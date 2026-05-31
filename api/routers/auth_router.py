# api/routers/auth_router.py
from fastapi import APIRouter, Request, Query, Body, Depends
from typing import Dict, Any

from models import LoginRequest, SignUpRequest, ProgressRequest, GoogleAuthRequest, AssessmentRequest
from services.auth_service import AuthService
from limiter import limiter
from security import get_current_user_email

router = APIRouter(tags=["Auth & Progress"])

@router.post("/login")
@limiter.limit("5/minute")
def login_user(request: Request, req: LoginRequest):
    return AuthService.login(req)

@router.post("/signup")
@limiter.limit("5/minute")
def signup_user(request: Request, req: SignUpRequest):
    return AuthService.signup(req)

@router.post("/auth/google")
@limiter.limit("5/minute")
def google_auth(request: Request, req: GoogleAuthRequest):
    return AuthService.google_login(req.token)

# 🛡️ PROTECTED ROUTES BELOW 🛡️

@router.post("/update-progress")
@limiter.limit("30/minute")
def update_progress(request: Request, req: ProgressRequest, trusted_email: str = Depends(get_current_user_email)):
    req.email = trusted_email # OVERWRITE malicious body email with trusted token email
    return AuthService.update_progress(req)

@router.get("/get-progress")
@limiter.limit("30/minute")
def get_progress(request: Request, trusted_email: str = Depends(get_current_user_email)):
    return AuthService.get_progress(trusted_email)

@router.post("/update-assessment")
@limiter.limit("30/minute")
def update_assessment(request: Request, req: AssessmentRequest, trusted_email: str = Depends(get_current_user_email)):
    req.email = trusted_email
    return AuthService.update_assessment(req)

@router.get("/get-assessments")
@limiter.limit("30/minute")
def get_assessments(request: Request, trusted_email: str = Depends(get_current_user_email)):
    return AuthService.get_assessments(trusted_email)

@router.post("/sync-submission")
@limiter.limit("30/minute")
def sync_submission(request: Request, payload: Dict[str, Any] = Body(...), trusted_email: str = Depends(get_current_user_email)):
    payload["userId"] = trusted_email # Force the userId to be the token owner
    return AuthService.sync_submission(payload)

@router.get("/get-submission")
@limiter.limit("30/minute")
def get_submission(request: Request, activityId: str = Query(...), moduleId: str = Query(None), trusted_email: str = Depends(get_current_user_email)):
    return AuthService.get_submission(trusted_email, activityId, moduleId)

@router.post("/sync-assessment")
@limiter.limit("30/minute")
def sync_assessment(request: Request, payload: Dict[str, Any] = Body(...), trusted_email: str = Depends(get_current_user_email)):
    payload["userId"] = trusted_email
    return AuthService.sync_assessment(payload)

@router.get("/get-assessment")
@limiter.limit("30/minute")
def get_assessment(request: Request, moduleId: str = Query(...), trusted_email: str = Depends(get_current_user_email)):
    return AuthService.get_assessment(trusted_email, moduleId)

@router.get("/get-all-submissions")
@limiter.limit("30/minute")
def get_all_submissions(request: Request, trusted_email: str = Depends(get_current_user_email)):
    return AuthService.get_all_submissions(trusted_email)