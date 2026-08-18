# api/routers/auth_router.py
from fastapi import APIRouter, Request, Query, Body, Depends
from typing import Dict, Any

from models import UserLogin, UserCreate, ProgressUpdate, GoogleLoginRequest, AssessmentUpdateRequest, BatchSyncPayload, SyncResponse, ForgotPasswordRequest, ResetPasswordRequest, VerifyEmailRequest
from services.auth_service import AuthService
from limiter import limiter
from security import get_current_user_email

router = APIRouter(tags=["Auth & Progress"])

@router.post("/login")
@limiter.limit("5/minute")
def login_user(request: Request, req: UserLogin): 
    return AuthService.login(req)

@router.post("/signup")
@limiter.limit("5/minute")
def signup_user(request: Request, req: UserCreate):
    # Classic email/password signup: the account starts unverified and a
    # verification link is emailed to req.email (see AuthService.signup_with_email).
    # Pass the requesting frontend's Origin through so the emailed link
    # points back at wherever the person actually is (local dev, production,
    # or a preview deployment) instead of a hardcoded/missing FRONTEND_URL.
    return AuthService.signup_with_email(req.email, req.username, req.password, origin=request.headers.get("origin"))

@router.post("/verify-email")
@limiter.limit("10/minute")
def verify_email(request: Request, req: VerifyEmailRequest):
    return AuthService.verify_email(req.token)

@router.post("/forgot-password")
@limiter.limit("5/minute")
def forgot_password(request: Request, req: ForgotPasswordRequest):
    # BUG FIX: pass the requesting frontend's Origin through so the emailed
    # reset link points back at wherever the person actually is (local dev,
    # production, or a preview deployment) instead of a hardcoded/missing
    # FRONTEND_URL env var. See mail_service._resolve_frontend_url.
    return AuthService.forgot_password(req.email, origin=request.headers.get("origin"))

@router.get("/verify-reset-token")
@limiter.limit("20/minute")
def verify_reset_token(request: Request, token: str = Query(...)):
    return AuthService.verify_reset_token(token)

@router.post("/reset-password")
@limiter.limit("5/minute")
def reset_password(request: Request, req: ResetPasswordRequest):
    return AuthService.reset_password(req.token, req.new_password)

@router.post("/auth/google")
@limiter.limit("5/minute")
def google_auth(request: Request, req: GoogleLoginRequest): 
    return AuthService.google_login(req.token)

@router.get("/get-progress")
@limiter.limit("30/minute")
def get_progress(request: Request, trusted_email: str = Depends(get_current_user_email)):
    return AuthService.get_progress(trusted_email)

@router.post("/update-assessment")
@limiter.limit("30/minute")
def update_assessment(request: Request, req: AssessmentUpdateRequest, trusted_email: str = Depends(get_current_user_email)):
    req.email = trusted_email
    return AuthService.update_assessment(req)

@router.get("/get-assessments")
@limiter.limit("30/minute")
def get_assessments(request: Request, trusted_email: str = Depends(get_current_user_email)):
    return AuthService.get_assessments(trusted_email)

@router.get("/get-all-submissions")
@limiter.limit("30/minute")
def get_all_submissions(request: Request, trusted_email: str = Depends(get_current_user_email)):
    return AuthService.get_all_submissions(trusted_email)

@router.post("/update-onboarding")
@limiter.limit("30/minute")
def update_onboarding(request: Request, payload: Dict[str, Any], trusted_email: str = Depends(get_current_user_email)):
    onboarding_state = payload.get("onboarding_state", {}) if isinstance(payload, dict) else {}
    return AuthService.update_onboarding(trusted_email, onboarding_state)

@router.get("/get-onboarding")
@limiter.limit("30/minute")
def get_onboarding(request: Request, trusted_email: str = Depends(get_current_user_email)):
    return AuthService.get_onboarding(trusted_email)