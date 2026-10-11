"""OAuth tokens at rest. The database only ever sees Fernet ciphertext;
plaintext tokens exist in memory for one request or sync run and are never
logged (CredentialRecord's repr hides them).

The same KNOWLEDGE_TOKEN_KEY also seals the OAuth `state`, through a
separate key derived with HKDF so the two uses can't be swapped.
"""

import asyncio
import base64
from datetime import datetime
from uuid import UUID

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.knowledge.records import CredentialRecord
from backend.knowledge.repository import KnowledgeStore


class MissingTokenKeyError(RuntimeError):
    """KNOWLEDGE_TOKEN_KEY is not set (main.py requires it on Render)."""


def _fernet(key: str | None, purpose: bytes | None = None) -> Fernet:
    key = key if key is not None else settings.KNOWLEDGE_TOKEN_KEY
    if not key:
        raise MissingTokenKeyError("KNOWLEDGE_TOKEN_KEY is not set")
    if purpose is None:
        return Fernet(key)
    raw = base64.urlsafe_b64decode(key)
    derived = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=purpose).derive(raw)
    return Fernet(base64.urlsafe_b64encode(derived))


class TokenCipher:
    """Fernet: AES-128-CBC + HMAC-SHA256. A wrong key or tampered ciphertext
    raises cryptography.fernet.InvalidToken."""

    def __init__(self, key: str | None = None) -> None:
        self._fernet = _fernet(key)

    def encrypt(self, plaintext: str) -> bytes:
        return self._fernet.encrypt(plaintext.encode())

    def decrypt(self, ciphertext: bytes) -> str:
        return self._fernet.decrypt(ciphertext).decode()


def state_fernet(key: str | None = None) -> Fernet:
    return _fernet(key, purpose=b"honne-oauth-state")


class CredentialStore:
    """Encrypts on the way in, decrypts on the way out; the repository stores bytes."""

    def __init__(self, store: KnowledgeStore, cipher: TokenCipher | None = None) -> None:
        self._store = store
        self._cipher = cipher or TokenCipher()

    async def save(
        self,
        db: Session,
        user_id: UUID,
        source_id: UUID,
        refresh_token: str,
        access_token: str | None,
        access_token_expires_at: datetime | None,
        scope: str,
    ) -> None:
        await asyncio.to_thread(
            self._store.save_credentials,
            db,
            user_id,
            source_id,
            self._cipher.encrypt(refresh_token),
            self._cipher.encrypt(access_token) if access_token else None,
            access_token_expires_at,
            scope,
        )

    async def load(self, db: Session, user_id: UUID, source_id: UUID) -> CredentialRecord | None:
        row = await asyncio.to_thread(self._store.get_credentials, db, user_id, source_id)
        if row is None:
            return None
        return CredentialRecord(
            source_id=row.source_id,
            user_id=row.user_id,
            refresh_token=self._cipher.decrypt(row.refresh_token_enc),
            access_token=self._cipher.decrypt(row.access_token_enc) if row.access_token_enc else None,
            access_token_expires_at=row.access_token_expires_at,
            scope=row.scope,
        )

    async def update_access_token(
        self, db: Session, user_id: UUID, source_id: UUID, access_token: str, expires_at: datetime
    ) -> None:
        await asyncio.to_thread(
            self._store.update_access_token,
            db,
            user_id,
            source_id,
            self._cipher.encrypt(access_token),
            expires_at,
        )
