# api/routers/auth_router.py
from fastapi import APIRouter, Request, Query, Body
from typing import Dict, Any

from models import LoginRequest, SignUpRequest, ProgressRequest, GoogleAuthRequest, AssessmentRequest
from services.auth_service import AuthService
from limiter import limiter

# FIX: Removed prefix="/api" because index.py already mounts this at /api/auth or /api
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

@router.post("/update-progress")
@limiter.limit("30/minute")
def update_progress(request: Request, req: ProgressRequest):
    return AuthService.update_progress(req)

@router.get("/get-progress")
@limiter.limit("30/minute")
def get_progress(request: Request, email: str = Query(...)):
    return AuthService.get_progress(email)

@router.post("/update-assessment")
@limiter.limit("30/minute")
def update_assessment(request: Request, req: AssessmentRequest):
    return AuthService.update_assessment(req)

@router.get("/get-assessments")
@limiter.limit("30/minute")
def get_assessments(request: Request, email: str = Query(...)):
    return AuthService.get_assessments(email)

@router.post("/sync-submission")
@limiter.limit("30/minute")
def sync_submission(request: Request, payload: Dict[str, Any] = Body(...)):
    return AuthService.sync_submission(payload)

@router.get("/get-submission")
@limiter.limit("30/minute")
def get_submission(request: Request, email: str = Query(...), activityId: str = Query(...), moduleId: str = Query(None)):
    return AuthService.get_submission(email, activityId, moduleId)

@router.post("/sync-assessment")
@limiter.limit("30/minute")
def sync_assessment(request: Request, payload: Dict[str, Any] = Body(...)):
    return AuthService.sync_assessment(payload)

@router.get("/get-assessment")
@limiter.limit("30/minute")
def get_assessment(request: Request, email: str = Query(...), moduleId: str = Query(...)):
    return AuthService.get_assessment(email, moduleId)

@router.get("/get-all-submissions")
@limiter.limit("30/minute")
def get_all_submissions(request: Request, email: str = Query(...)):
    return AuthService.get_all_submissions(email)