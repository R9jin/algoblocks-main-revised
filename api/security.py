# api/security.py
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
import logging

logger = logging.getLogger(__name__)

# Make sure this exact secret key matches the one used in auth_service.py to generate the token
SECRET_KEY = "algoblocks_secret_key" 
ALGORITHM = "HS256"

# auto_error=True strictly enforces that the Authorization header MUST be present
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")

async def get_current_user_email(token: str = Depends(oauth2_scheme)):
    """
    Strict and secure authentication dependency.
    Requires a valid, unexpired JWT Bearer token. 
    Under no circumstances does this accept unverified user IDs from the URL.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        # Decode and validate the token signature and expiration
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        # Extract the email (subject) from the payload
        email: str = payload.get("sub") or payload.get("email")
        if email is None:
            logger.warning("Token payload missing 'sub' or 'email'")
            raise credentials_exception
            
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