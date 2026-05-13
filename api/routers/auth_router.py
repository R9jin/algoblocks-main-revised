from fastapi import APIRouter
from api.models import LoginRequest, SignUpRequest, ProgressRequest
from api.services.auth_service import AuthService

router = APIRouter(prefix="/api", tags=["Auth & Progress"])

@router.post("/login")
def login_user(req: LoginRequest):
    return AuthService.login(req)

@router.post("/signup")
def signup_user(req: SignUpRequest):
    return AuthService.signup(req)

@router.post("/update-progress")
def update_progress(req: ProgressRequest):
    return AuthService.update_progress(req)