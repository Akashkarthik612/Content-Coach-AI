import logging

import httpx
from fastapi import HTTPException

from backend.core.config import settings

logger = logging.getLogger(__name__)

_LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
_LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo"
_LINKEDIN_POSTS_URL = "https://api.linkedin.com/rest/posts"
_LINKEDIN_API_VERSION = "202604"


class LinkedInAPIClient:
    """Static HTTP client for all LinkedIn API calls. No instance state."""

    @staticmethod
    def exchange_code(code: str) -> dict:
        """Exchange OAuth authorization code for access token."""
        resp = httpx.post(
            _LINKEDIN_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.LINKEDIN_REDIRECT_URI,
                "client_id": settings.LINKEDIN_CLIENT_ID,
                "client_secret": settings.LINKEDIN_CLIENT_SECRET,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )
        if resp.status_code != 200:
            raise HTTPException(
                status_code=400,
                detail=f"LinkedIn token exchange failed: {resp.text}",
            )
        return resp.json()

    @staticmethod
    def get_userinfo(access_token: str) -> dict:
        """Fetch LinkedIn profile via OIDC userinfo endpoint.

        Returns keys: sub, name, email (optional), picture (optional).
        """
        resp = httpx.get(
            _LINKEDIN_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        if resp.status_code == 401:
            raise HTTPException(status_code=401, detail="LinkedIn access token is invalid")
        if resp.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"LinkedIn userinfo request failed: {resp.text}",
            )
        return resp.json()

    @staticmethod
    def create_post(access_token: str, linkedin_urn: str, content: str) -> dict:
        """Publish a text post to LinkedIn on behalf of the authenticated user.

        Returns the LinkedIn post ID in {"id": "urn:li:share:..."}.
        Edge cases raised:
          401 → token revoked by user on LinkedIn side
          429 → rate limited
          5xx / network → LinkedIn API unavailable
        """
        payload = {
            "author": linkedin_urn,
            "commentary": content,
            "visibility": "PUBLIC",
            "distribution": {
                "feedDistribution": "MAIN_FEED",
                "targetEntities": [],
                "thirdPartyDistributionChannels": [],
            },
            "lifecycleState": "PUBLISHED",
            "isReshareDisabledByAuthor": False,
        }
        try:
            resp = httpx.post(
                _LINKEDIN_POSTS_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "LinkedIn-Version": _LINKEDIN_API_VERSION,
                    "X-Restli-Protocol-Version": "2.0.0",
                    "Content-Type": "application/json",
                },
                timeout=20,
            )
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"LinkedIn API unreachable: {exc}") from exc

        logger.error("LinkedIn Posts API → status=%s body=%s", resp.status_code, resp.text)

        if resp.status_code == 401:
            raise HTTPException(status_code=401, detail="LinkedIn token revoked")
        if resp.status_code == 429:
            raise HTTPException(status_code=429, detail="LinkedIn rate limit hit — try again in a few minutes")
        if resp.status_code >= 500:
            raise HTTPException(status_code=502, detail=f"LinkedIn API error {resp.status_code}: {resp.text}")
        if resp.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=f"LinkedIn unexpected response {resp.status_code}: {resp.text}")

        # LinkedIn returns the post URN in the X-RestLi-Id header (201) or body (200)
        post_id = resp.headers.get("x-restli-id") or resp.headers.get("X-RestLi-Id")
        if not post_id and resp.content:
            body = resp.json()
            post_id = body.get("id")
        return {"id": post_id}
