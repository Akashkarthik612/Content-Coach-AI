from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class AuthenticatedUser:
    """Provider-agnostic identity recovered from a verified token.
    Same shape regardless of which provider issued the token."""

    id: str
    email: Optional[str] = None
    username: Optional[str] = None


class BaseAuthProvider(ABC):
    """
    Contract every token-verifying auth provider must satisfy: given a raw token/credential,
    verify it and return the identity it encodes. No instance state needed — verification
    is a pure function of the token, so the contract method is static.

    Current:  SupabaseAuth.verify_token(token)
    Future:   any other externally-issued-token integration follows the same shape
              (e.g. a webhook-signature verifier) by subclassing this ABC.
    """

    @staticmethod
    @abstractmethod
    def verify_token(token: str) -> AuthenticatedUser:
        """Validate the token; raise ValueError on failure; return identity on success."""
        ...
