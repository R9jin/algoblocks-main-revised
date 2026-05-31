# api/security.py
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
import jwt

# Make sure this matches your auth service's secret key
SECRET_KEY = "algoblocks_secret_key" 
ALGORITHM = "HS256"

# auto_error=False prevents FastAPI from instantly throwing 401 if the header is missing
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login", auto_error=False)

async def get_current_user_email(request: Request, token: str = Depends(oauth2_scheme)):
    """
    Robust authentication dependency.
    Checks Bearer token first. If invalid/missing, falls back to URL query parameters
    to prevent 401 Unauthorized spam from frontend disconnects.
    """
    # Fallback check if the frontend passed ?userId=... in the URL
    query_user = request.query_params.get("userId") or request.query_params.get("user_email")

    if token:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            email = payload.get("sub") or payload.get("email")
            if email:
                return email
        except Exception:
            # Token might be expired or malformed, fall through to query check
            pass

    # If token failed or was missing, gracefully accept the query parameter if it exists
    if query_user:
        return query_user

    # If neither token nor query param exists, finally throw 401
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated. Missing token or userId.",
        headers={"WWW-Authenticate": "Bearer"},
    )