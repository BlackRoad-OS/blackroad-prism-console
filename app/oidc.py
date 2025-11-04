from __future__ import annotations

import json
import time
from threading import RLock
from typing import Any, Dict, Optional

import httpx
import jwt
from jwt import exceptions as jwt_exceptions

from .config import ConfigHolder


class _SimpleTTLCache:
    """Minimal TTL cache to avoid optional dependencies."""

    def __init__(self, ttl_seconds: int, maxsize: int = 128) -> None:
        self._ttl = ttl_seconds
        self._maxsize = maxsize
        self._store: Dict[str, tuple[Dict[str, Any], float]] = {}
        self._lock = RLock()

    def _is_valid(self, key: str) -> bool:
        """Check if key exists and is not expired. Must be called with lock held."""
        item = self._store.get(key)
        if not item:
            return False
        _, expires_at = item
        if expires_at <= time.time():
            self._store.pop(key, None)
            return False
        return True

    def __contains__(self, key: str) -> bool:
        with self._lock:
            return self._is_valid(key)

    def __getitem__(self, key: str) -> Dict[str, Any]:
        with self._lock:
            if not self._is_valid(key):
                raise KeyError(key)
            value, _ = self._store[key]
            return value

    def __setitem__(self, key: str, value: Dict[str, Any]) -> None:
        with self._lock:
            # Enforce maximum size by evicting oldest entry if needed
            if key not in self._store and len(self._store) >= self._maxsize:
                # Find and remove the oldest entry
                oldest_key = min(self._store.items(), key=lambda item: item[1][1])[0]
                self._store.pop(oldest_key, None)
            self._store[key] = (value, time.time() + self._ttl)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()


_jwks_cache = _SimpleTTLCache(ttl_seconds=600, maxsize=1)


def _get_jwks(jwks_url: str) -> Dict[str, Any]:
    if "jwks" in _jwks_cache:
        return _jwks_cache["jwks"]
    resp = httpx.get(jwks_url, timeout=5.0)
    resp.raise_for_status()
    data = resp.json()
    _jwks_cache["jwks"] = data
    return data


def verify_oidc(cfg: ConfigHolder, id_token: str, audience: Optional[str]) -> Dict[str, Any]:
    """Returns decoded claims if valid; raises on failure."""

    oidc = cfg.current.auth["oidc"]
    issuer = oidc["issuer"]
    jwks_url = oidc["jwks_url"]
    skew = int(oidc.get("clock_skew_seconds", 300))

    jwks = _get_jwks(jwks_url)
    kid = jwt.get_unverified_header(id_token)["kid"]
    key = next((k for k in jwks["keys"] if k["kid"] == kid), None)
    if not key:
        raise ValueError("Unknown key id")

    public_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key))
    try:
        claims = jwt.decode(
            id_token,
            key=public_key,
            algorithms=["RS256", "RS384", "RS512"],
            audience=audience,
            issuer=issuer,
            leeway=skew,
        )
    except jwt_exceptions.InvalidAudienceError as exc:
        raise ValueError("audience_not_allowed") from exc

    allowed = cfg.current.auth["oidc"].get("audience_allowlist", [])
    aud_claim = claims.get("aud")
    if aud_claim is None:
        raise ValueError("missing_audience")
    if not any(
        (a.endswith("*") and str(aud_claim).startswith(a[:-1])) or str(aud_claim) == a
        for a in allowed
    ):
        raise ValueError("audience_not_allowed")

    now = int(time.time())
    if claims.get("nbf") and claims["nbf"] - skew > now:
        raise ValueError("token_not_yet_valid")

    return claims
