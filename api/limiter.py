# api/limiter.py
"""
Rate limiter configuration for the AlgoBlocks API.

Defines a shared SlowAPI Limiter instance that reads the true client IP from
the ``X-Forwarded-For`` header (set by Vercel's proxy layer) so rate limits
apply to the real originating address rather than the proxy's address.

The limiter is imported and attached to the FastAPI app in index.py and
referenced via the ``@limiter.limit(...)`` decorator in every router.
"""
import os
import jwt
from fastapi import Request
from slowapi import Limiter

def get_real_client_ip(request: Request) -> str:
    """
    Extracts the real client IP address from the request.

    When running behind Vercel's reverse proxy the originating IP arrives in
    the ``X-Forwarded-For`` header as a comma-separated list; the left-most
    value is the client address. Falls back to ``request.client.host`` for
    direct connections (local development), or ``"127.0.0.1"`` as a last
    resort when no client info is available at all.

    Args:
        request: The incoming FastAPI/Starlette request object.

    Returns:
        The resolved client IP address as a string.
    """
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

def get_rate_limit_key(request: Request) -> str:
    """
    Rate-limit bucket for a request.

    Authenticated requests are bucketed per ACCOUNT, everything else per IP.

    Why: keyed purely by IP, every student behind the same school/lab NAT shared
    one bucket, so a class syncing in the background (30 progress writes/min,
    20 project saves/min per bucket) tripped 429s for each other, and each
    429 left their work "pending". The token signature and expiry are verified
    here, so a forged or expired token cannot be used to pick another user's
    bucket or dodge the limit -- it just falls back to the per-IP bucket.
    """
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        secret = os.getenv("JWT_SECRET_KEY")
        if secret:
            try:
                claims = jwt.decode(auth[7:].strip(), secret, algorithms=["HS256"])
                sub = claims.get("sub") or claims.get("email")
                if sub:
                    return f"user:{str(sub).lower()}"
            except jwt.PyJWTError:
                pass
    return get_real_client_ip(request)

# Define the limiter here so anyone can import it safely
limiter = Limiter(key_func=get_rate_limit_key, default_limits=["100/minute"])
