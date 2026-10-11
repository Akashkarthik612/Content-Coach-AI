"""Google OAuth for the Drive connector: consent URL, code exchange, refresh,
revoke, and the sealed `state`.

The state is Fernet-sealed {user_id, nonce} (encrypted + HMAC, 10-minute TTL).
It is not trusted on its own: the frontend finishes the flow by POSTing
{code, state} with the user's JWT, and the router rejects a state whose
user_id isn't that user. Otherwise anyone could send a victim their own
consent link and attach the victim's Drive to their own account.
"""

import json
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, urlsplit
from uuid import UUID

import httpx
from cryptography.fernet import InvalidToken

from backend.core.config import settings
from backend.knowledge.connectors.base import AuthRevokedError, TransientConnectorError
from backend.knowledge.credentials import state_fernet

DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
STATE_TTL_SECONDS = 600
TIMEOUT_S = 15.0


class InvalidStateError(ValueError):
    """Tampered, expired or malformed OAuth state."""


class OAuthExchangeError(Exception):
    """Google rejected the authorization code (used, expired, wrong client)."""


@dataclass(frozen=True)
class TokenGrant:
    access_token: str = field(repr=False)
    expires_at: datetime
    scope: str
    refresh_token: str | None = field(default=None, repr=False)

    @property
    def has_drive_scope(self) -> bool:
        # Granular consent lets the user untick Drive and still "Allow".
        return DRIVE_SCOPE in self.scope.split()


def sign_state(user_id: UUID, key: str | None = None) -> str:
    payload = json.dumps({"u": str(user_id), "n": secrets.token_urlsafe(16)}).encode()
    return state_fernet(key).encrypt(payload).decode()


def verify_state(state: str, key: str | None = None, now: int | None = None) -> UUID:
    """The user_id sealed in `state`. `now` (unix seconds) is for tests."""
    fernet = state_fernet(key)
    try:
        token = state.encode()
        payload = (
            fernet.decrypt(token, ttl=STATE_TTL_SECONDS)
            if now is None
            else fernet.decrypt_at_time(token, ttl=STATE_TTL_SECONDS, current_time=now)
        )
        return UUID(json.loads(payload)["u"])
    except (InvalidToken, ValueError, KeyError, TypeError) as exc:
        raise InvalidStateError("invalid or expired OAuth state") from exc


def _url(real: str) -> str:
    """Same path on a fake host when GOOGLE_BASE_URL is set (tests only)."""
    base = settings.GOOGLE_BASE_URL.rstrip("/")
    return base + urlsplit(real).path if base else real


class GoogleOAuth:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client

    @staticmethod
    def is_configured() -> bool:
        return bool(
            settings.GOOGLE_OAUTH_CLIENT_ID
            and settings.GOOGLE_OAUTH_CLIENT_SECRET
            and settings.GOOGLE_DRIVE_REDIRECT_URI
            and settings.KNOWLEDGE_TOKEN_KEY
        )

    @staticmethod
    def auth_url(state: str) -> str:
        params = {
            "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
            "redirect_uri": settings.GOOGLE_DRIVE_REDIRECT_URI,
            "response_type": "code",
            "scope": DRIVE_SCOPE,
            "access_type": "offline",  # we need a refresh token
            # consent: a refresh token every time, even on reconnect.
            # select_account: always show Google's account chooser ("Use another account").
            "prompt": "consent select_account",
            "state": state,
        }
        return f"{_url(AUTH_URL)}?{urlencode(params)}"

    async def exchange(self, code: str) -> TokenGrant:
        response = await self._post(
            _url(TOKEN_URL),
            {
                "code": code,
                "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
                "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_DRIVE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        if response.status_code in (400, 401):
            raise OAuthExchangeError(_error_code(response))
        return self._grant(response)

    async def refresh(self, refresh_token: str) -> TokenGrant:
        response = await self._post(
            _url(TOKEN_URL),
            {
                "refresh_token": refresh_token,
                "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
                "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
                "grant_type": "refresh_token",
            },
        )
        if response.status_code in (400, 401):
            # invalid_grant: revoked by the user, password change, or the
            # 7-day expiry of a Testing-mode app. Only a reconnect fixes it.
            raise AuthRevokedError(f"auth_revoked: reconnect Google Drive ({_error_code(response)})")
        grant = self._grant(response)
        return TokenGrant(grant.access_token, grant.expires_at, grant.scope, refresh_token)

    async def revoke(self, token: str) -> None:
        """Best effort, on source delete. Never raises."""
        try:
            await self._post(_url(REVOKE_URL), {"token": token})
        except TransientConnectorError:
            pass

    async def _post(self, url: str, data: dict) -> httpx.Response:
        try:
            if self._client is not None:
                response = await self._client.post(url, data=data, timeout=TIMEOUT_S)
            else:
                async with httpx.AsyncClient() as client:
                    response = await client.post(url, data=data, timeout=TIMEOUT_S)
        except httpx.HTTPError as exc:
            raise TransientConnectorError(f"Google OAuth unreachable: {type(exc).__name__}") from exc
        if response.status_code >= 500 or response.status_code == 429:
            raise TransientConnectorError(f"Google OAuth HTTP {response.status_code}")
        return response

    @staticmethod
    def _grant(response: httpx.Response) -> TokenGrant:
        if response.status_code != 200:
            raise TransientConnectorError(f"Google OAuth HTTP {response.status_code}")
        body = response.json()
        return TokenGrant(
            access_token=body["access_token"],
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=int(body.get("expires_in", 3600))),
            scope=body.get("scope", ""),
            refresh_token=body.get("refresh_token"),
        )


def _error_code(response: httpx.Response) -> str:
    try:
        return str(response.json().get("error", response.status_code))
    except ValueError:
        return str(response.status_code)
