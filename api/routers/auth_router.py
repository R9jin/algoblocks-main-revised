# api/routers/auth_router.py
from fastapi import APIRouter, Request, Query
from api.models import LoginRequest, SignUpRequest, ProgressRequest, GoogleAuthRequest, AssessmentRequest
from api.services.auth_service import AuthService
from api.limiter import limiter

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

@router.post("/update-assessment")
@limiter.limit("30/minute")
def update_assessment(request: Request, req: AssessmentRequest):
    return AuthService.update_assessment(req)

@router.post("/auth/google")
@limiter.limit("5/minute")
def google_auth(request: Request, req: GoogleAuthRequest):
    return AuthService.google_login(req.token)

# ==========================================
# ✅ NEW: GET endpoints for Syncing
# ==========================================
@router.get("/get-progress")
@limiter.limit("30/minute")
def get_progress(request: Request, email: str = Query(...)):
    return AuthService.get_progress(email)

@router.get("/get-assessments")
@limiter.limit("30/minute")
def get_assessments(request: Request, email: str = Query(...)):
    return AuthService.get_assessments(email)