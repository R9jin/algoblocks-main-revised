# api/security.py
"""
JWT-based authentication and authorization utilities for the AlgoBlocks API.

This module provides:
- JWT access token creation (HS256, 7-day TTL).
- ``get_current_user_email`` — a FastAPI dependency that validates the Bearer
  token, checks account status, and verifies the token version to support
  immediate revocation on password reset or explicit logout-all.
- ``get_current_admin_user`` — a dependency that layers an admin-role check
  on top of ``get_current_user_email``.
"""
import os
import logging
import jwt
from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

# Replaced PyMongo collection with the PostgreSQL user repository
from repositories.user_repo import UserRepository
from services.mail_service import SUPPORT_EMAIL

logger = logging.getLogger(__name__)

# JWT_SECRET_KEY is required; fail fast at startup with a clear message
# rather than a cryptic signing error at runtime.
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("CRITICAL SECURITY ERROR: JWT_SECRET_KEY environment variable is not set.")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 days

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login", auto_error=True)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """
    Mints a signed HS256 JWT for the given payload data.

    The token is signed with ``JWT_SECRET_KEY`` from the environment.
    If ``expires_delta`` is not supplied the default TTL of 7 days
    (``ACCESS_TOKEN_EXPIRE_MINUTES``) is applied.

    Always returns a ``str``; older versions of PyJWT return ``bytes``,
    which would cause JSON serialisation failures when the token is placed
    in an API response.

    Args:
        data: Arbitrary claims to encode (e.g. ``{"sub": email, "tv": version}``).
        expires_delta: Optional custom lifetime for the token.

    Returns:
        The encoded JWT as a plain string.
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    
    # Ensure it returns a str, not bytes (prevents b"ey..." JSON serialization bugs)
    if isinstance(encoded_jwt, bytes):
        return encoded_jwt.decode("utf-8")
    return encoded_jwt

# NOTE: plain ``def`` on purpose. This runs a blocking psycopg2 query on every
# authenticated request; as ``async def`` it executed ON the event loop and
# stalled every other in-flight request while it waited on the database.
# FastAPI runs sync dependencies in its threadpool.
def get_current_user_email(token: str = Depends(oauth2_scheme)) -> str:
    """
    FastAPI dependency that authenticates the Bearer token on every request.

    Validates the JWT signature and expiry, then performs two live database
    checks to ensure the account is still in good standing:

    1. **Account status** — suspended accounts are rejected immediately,
       even if their token has not yet expired. This makes an admin's
       "suspend" action take effect within the current request rather than
       only at the user's next login.

    2. **Token version** — the ``tv`` claim embedded at mint time is compared
       against the ``token_version`` column. A mismatch means the token was
       issued before a password reset or explicit logout-all and should be
       treated as revoked, without needing a growing block-list table.

    Args:
        token: Bearer token extracted from the ``Authorization`` header.

    Returns:
        The authenticated user's email address (canonical casing as stored
        in the database).

    Raises:
        HTTPException 401: Invalid, expired, or revoked token.
        HTTPException 403: Account is suspended.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub") or payload.get("email")
        if email is None:
            logger.warning("Token payload missing 'sub' or 'email'")
            raise credentials_exception

        # Re-check account status on every authenticated request so an admin's
        # "suspend" action takes effect immediately, not just on next login.
        # Uses the lightweight lookup (no progress/assessments join) since only
        # status and token_version are needed here.
        user = UserRepository.find_auth_fields_by_email(email)
        if not user or user.get("status", "active") != "active":
            logger.warning(f"Rejected request: {email} account is not active")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This account has been suspended. Contact an administrator at {SUPPORT_EMAIL} for help.",
            )

        # JWT revocation via token_version: a token minted before this feature
        # existed has no "tv" claim — treat that as 0 so pre-feature tokens
        # remain valid until the next event that bumps the column (password
        # reset, logout-all), rather than invalidating all outstanding sessions.
        token_version = payload.get("tv", 0)
        if token_version != user.get("token_version", 0):
            logger.warning(f"Rejected request: {email} token_version mismatch (revoked session)")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Your session has been revoked (password changed or logged out elsewhere). Please log in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        return email
        
    except jwt.ExpiredSignatureError:
        logger.warning("Rejected request: Token has expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as e:
        logger.warning(f"Rejected request: Invalid token - {str(e)}")
        raise credentials_exception

def get_current_admin_user(email: str = Depends(get_current_user_email)) -> str:
    """
    FastAPI dependency that enforces administrator privileges.

    Layers on top of ``get_current_user_email``, which already validates the
    JWT and account status. After authentication succeeds this dependency
    fetches the user's role flags and raises a 403 if the account is not an
    admin. The lightweight ``find_auth_fields_by_email`` lookup is used
    (no progress/assessments join) since only the role flag is needed.

    Args:
        email: The authenticated user's email, injected by ``get_current_user_email``.

    Returns:
        The admin user's email address.

    Raises:
        HTTPException 403: Authenticated user does not have admin privileges.
    """
    user = UserRepository.find_auth_fields_by_email(email)
    
    is_admin = False
    if user:
        is_admin = user.get("isAdmin", False) or user.get("is_admin", False) or user.get("role") == "admin"
        
    if not user or not is_admin:
        logger.warning(f"Rejected request: {email} attempted to access an admin-restricted endpoint.")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator privileges required to perform this action.",
        )
        
    return email