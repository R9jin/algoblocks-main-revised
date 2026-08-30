# api/security.py
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

# BUG-01 Fix: Strictly load secret from environment variables
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("CRITICAL SECURITY ERROR: JWT_SECRET_KEY environment variable is not set.")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 days

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login", auto_error=True)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    
    # FIX: Ensure it returns a str, not bytes (prevents b"ey..." JSON serialization bugs)
    if isinstance(encoded_jwt, bytes):
        return encoded_jwt.decode("utf-8")
    return encoded_jwt

async def get_current_user_email(token: str = Depends(oauth2_scheme)) -> str:
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

        # SECURITY FIX: a suspended account's already-issued tokens (valid up
        # to 7 days) previously kept working for every request, since only
        # login checked account status. Re-check status here so an admin's
        # "suspend" action takes effect immediately, not just on next login.
        # PERFORMANCE: this runs on every authenticated request, so use the
        # lightweight lookup (no progress/assessments join) -- see
        # find_auth_fields_by_email for why.
        user = UserRepository.find_auth_fields_by_email(email)
        if not user or user.get("status", "active") != "active":
            logger.warning(f"Rejected request: {email} account is not active")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This account has been suspended. Contact an administrator at {SUPPORT_EMAIL} for help.",
            )

        # SECURITY: JWT revocation via token_version. A token minted before
        # this feature existed has no "tv" claim at all -- treat that as 0
        # so those already-issued tokens keep working until the next event
        # that bumps the column (password reset, logout-all), rather than
        # invalidating every outstanding session the moment this shipped.
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

async def get_current_admin_user(email: str = Depends(get_current_user_email)) -> str:
    """
    Dependency that checks if the currently authenticated user has admin privileges in PostgreSQL.
    """
    # PERFORMANCE: same lightweight lookup as get_current_user_email above --
    # this only needs the role/is_admin flag, not progress/assessments.
    user = UserRepository.find_auth_fields_by_email(email)
    
    # Using the fetched dictionary from the PG repository
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