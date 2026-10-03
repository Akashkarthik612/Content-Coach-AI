"""Test signing keys standing in for Supabase Auth.

Generated once per process. The public halves are served as a JWKS by
fake_upstream.py; `mint_token` signs with the private halves, so tokens go
through the real verify_token() — signature, exp, aud and iss all checked.
Supabase signs with RS256 on older projects and ES256 on newer ones; both
are covered.
"""

import json
import time
import uuid
from functools import lru_cache

import jwt
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from jwt.algorithms import ECAlgorithm, RSAAlgorithm

RS256_KID = "smoke-rs256"
ES256_KID = "smoke-es256"


@lru_cache
def _keys() -> dict:
    return {
        RS256_KID: ("RS256", rsa.generate_private_key(public_exponent=65537, key_size=2048)),
        ES256_KID: ("ES256", ec.generate_private_key(ec.SECP256R1())),
    }


@lru_cache
def _stranger_key():
    """A key that is NOT in the JWKS — a token signed with it must be rejected."""
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def jwks() -> dict:
    keys = []
    for kid, (alg, private) in _keys().items():
        to_jwk = RSAAlgorithm.to_jwk if alg == "RS256" else ECAlgorithm.to_jwk
        jwk = json.loads(to_jwk(private.public_key()))
        keys.append({**jwk, "kid": kid, "alg": alg, "use": "sig"})
    return {"keys": keys}


def mint_token(
    supabase_url: str,
    sub: uuid.UUID | str,
    email: str | None = None,
    kid: str = RS256_KID,
    expires_in: int = 3600,
    stranger: bool = False,
) -> str:
    alg, private = _keys()[kid]
    if stranger:
        alg, private = "RS256", _stranger_key()
    now = int(time.time())
    claims = {
        "sub": str(sub),
        "email": email,
        "aud": "authenticated",
        "role": "authenticated",
        "iss": f"{supabase_url}/auth/v1",
        "iat": now,
        "exp": now + expires_in,
    }
    return jwt.encode(claims, private, algorithm=alg, headers={"kid": RS256_KID if stranger else kid})
