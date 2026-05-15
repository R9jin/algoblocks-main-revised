# api/routers/auth_router.py
from fastapi import APIRouter, Request
from api.models import LoginRequest, SignUpRequest, ProgressRequest
from api.services.auth_service import AuthService
from api.limiter import limiter # ✅ Import from the new file

router = APIRouter(prefix="/api", tags=["Auth & Progress"])

@router.post("/login")
@limiter.limit("5/minute")
def login_user(request: Request, req: LoginRequest):
    return AuthService.login(req)

@router.post("/signup")
@limiter.limit("5/minute")
def signup_user(request: Request, req: SignUpRequest):
    return AuthService.signup(req)

@router.post("/update-progress")
@limiter.limit("30/minute")
def update_progress(request: Request, req: ProgressRequest):
    return AuthService.update_progress(req)