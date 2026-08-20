# api/routers/admin_router.py
from fastapi import APIRouter, Depends, HTTPException, Body, Request
from typing import List, Dict, Any
import logging

from security import get_current_admin_user
from repositories.user_repo import UserRepository
from services.admin_analytics_service import AdminAnalyticsService
from services.analyzer_diagnostics_service import AnalyzerDiagnosticsService
from services.auth_service import AuthService
from limiter import limiter

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/users")
@limiter.limit("20/minute")
def get_all_users(request: Request, admin_email: str = Depends(get_current_admin_user)):
    try:
        users = UserRepository.find_all_users()
        
        for user in users:
            if "password" in user:
                del user["password"]
            # AdminUserManagement.jsx checks `user.isAdmin`, not the raw
            # Postgres column name `is_admin`.
            user["isAdmin"] = user.get("is_admin", False)
            # Same camelCase mapping for is_verified -- needed so the admin
            # panel can show/act on unverified accounts (see the manual
            # "Verify" action below, a manual override for accounts whose
            # verification email never arrived).
            user["isVerified"] = user.get("is_verified", False)
                
        return {"status": "success", "users": users}
    except Exception as e:
        logger.error(f"Error fetching users via PostgreSQL: {str(e)}")
        raise HTTPException(status_code=500, detail="Error fetching users")

@router.patch("/users/{email}/status")
@limiter.limit("20/minute")
def update_user_status(
    email: str,
    request: Request,
    payload: Dict[str, Any] = Body(...), 
    admin_email: str = Depends(get_current_admin_user)
):
    status = payload.get("status")
    
    if not email or not status:
        raise HTTPException(status_code=400, detail="Missing email or status")
        
    # Normalize + validate: the frontend sends "Active"/"Suspended", the DB
    # column default is lowercase "active". Storing whatever casing a caller
    # happens to send made the two easy to drift out of sync (that's what
    # broke the suspend toggle in the UI). Pin it down to two canonical,
    # lowercase values here so the column can never hold anything else.
    normalized_status = status.strip().lower()
    if normalized_status not in ("active", "suspended"):
        raise HTTPException(status_code=400, detail="Status must be 'active' or 'suspended'")
        
    if email == admin_email:
        raise HTTPException(status_code=400, detail="Cannot change your own status")
        
    try:
        rowcount = UserRepository.update_user_status(email, normalized_status)
        if rowcount == 0:
            raise HTTPException(status_code=404, detail="User not found")
        return {"status": "success", "message": f"User status updated to {normalized_status}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user status in PostgreSQL: {str(e)}")
        raise HTTPException(status_code=500, detail="Error updating user status")

@router.post("/users/{email}/verify")
@limiter.limit("20/minute")
def manually_verify_user(
    email: str,
    request: Request,
    admin_email: str = Depends(get_current_admin_user)
):
    """
    Marks an account as email-verified directly, bypassing the normal
    click-the-link flow entirely. Useful as a manual override if a
    person's verification email never arrives (spam filtering, a typo'd
    address, etc.) and an admin needs to unblock them by hand.
    """
    if not email:
        raise HTTPException(status_code=400, detail="Missing email")

    try:
        rowcount = UserRepository.mark_verified(email)
        if rowcount == 0:
            raise HTTPException(status_code=404, detail="User not found")
        return {"status": "success", "message": "User marked as verified"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error manually verifying user in PostgreSQL: {str(e)}")
        raise HTTPException(status_code=500, detail="Error verifying user")

@router.get("/password-reset-requests")
@limiter.limit("30/minute")
def get_pending_password_resets(
    request: Request,
    admin_email: str = Depends(get_current_admin_user)
):
    """
    Accounts with a pending forgot-password request. Legacy: normal
    forgot-password requests now email the user directly (see
    AuthService.forgot_password) -- this list stays empty unless
    something explicitly calls UserRepository.request_password_reset,
    which nothing in the current flow does. Kept as a manual-override
    path for edge cases (e.g. an account's email is unreachable).
    """
    try:
        return {"status": "success", "requests": AuthService.list_pending_password_resets()}
    except Exception as e:
        logger.error(f"Error fetching pending password reset requests: {str(e)}")
        raise HTTPException(status_code=500, detail="Error fetching pending password reset requests")


@router.post("/password-reset-requests/{email}/approve")
@limiter.limit("20/minute")
def approve_password_reset_request(
    email: str,
    request: Request,
    admin_email: str = Depends(get_current_admin_user)
):
    """
    Grants a pending reset request: issues the actual reset token and
    returns the full /reset-password?token=... link. The admin is
    responsible for getting that link to the user (chat, phone, in person)
    -- there's no email step in this flow.
    """
    if not email:
        raise HTTPException(status_code=400, detail="Missing email")
    try:
        return AuthService.approve_password_reset(email, origin=request.headers.get("origin"))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving password reset for {email}: {str(e)}")
        raise HTTPException(status_code=500, detail="Error approving password reset")


@router.post("/password-reset-requests/{email}/deny")
@limiter.limit("20/minute")
def deny_password_reset_request(
    email: str,
    request: Request,
    admin_email: str = Depends(get_current_admin_user)
):
    """Dismisses a pending request without issuing a token."""
    if not email:
        raise HTTPException(status_code=400, detail="Missing email")
    try:
        return AuthService.deny_password_reset(email)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error denying password reset for {email}: {str(e)}")
        raise HTTPException(status_code=500, detail="Error denying password reset")


@router.delete("/users/{email}")
@limiter.limit("10/minute")
def delete_user(
    email: str,
    request: Request,
    admin_email: str = Depends(get_current_admin_user)
):
    if not email:
        raise HTTPException(status_code=400, detail="Missing email")
        
    if email == admin_email:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
        
    try:
        # User deletion automatically cascades to progress and assessments due to ON DELETE CASCADE
        rowcount = UserRepository.delete_user(email)
        if rowcount == 0:
            raise HTTPException(status_code=404, detail="User not found")
        return {"status": "success", "message": "User deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting user from PostgreSQL: {str(e)}")
        raise HTTPException(status_code=500, detail="Error deleting user")


@router.get("/users/{email}/metrics")
@limiter.limit("30/minute")
def get_user_metrics(
    email: str,
    request: Request,
    admin_email: str = Depends(get_current_admin_user)
):
    """
    Per-user breakdown of the same metrics a learner sees on their own
    Profile page: Task Success Rate (TSR), Algorithmic Efficiency Score
    (AES), Refactoring Optimization Gain (ROG), pre-test/post-test
    milestone scores, and recorded progress entries.
    """
    try:
        result = AdminAnalyticsService.get_user_metrics(email)
        if result is None:
            raise HTTPException(status_code=404, detail="User not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error computing user metrics: {str(e)}")
        raise HTTPException(status_code=500, detail="Error computing user metrics")


@router.get("/analytics/overview")
@limiter.limit("20/minute")
def get_analytics_overview(
    request: Request,
    emails: str = None,
    post_test_only: bool = False,
    admin_email: str = Depends(get_current_admin_user)
):
    """
    Cohort-wide dashboard combining:
      - System-generated measures: average TSR, AES, ROG across all
        recorded activity submissions.
      - Assessment-based measures: Mean/SD of pre-test and post-test
        scores, Paired Samples t-Test, Cohen's d effect size, and Hake's
        Normalized Learning Gain (g) -- exactly as defined in the study's
        Statistical Treatment of Data section.

    Administrator accounts are always excluded from these computations.

    Pass `?emails=a@x.com,b@x.com` to restrict the computation to a
    specific set of standard-user respondents -- useful during a live
    data-gathering session where only certain accounts should count
    toward the study's results. Omit it to include every standard user.

    Pass `?post_test_only=true` to further restrict the computation to
    standard users who have actually finished the post-test -- i.e.
    accounts with a recorded post-test score. This can be combined with
    `emails` (both filters apply together) or used on its own.
    """
    try:
        selected_emails = None
        if emails:
            selected_emails = [e.strip() for e in emails.split(",") if e.strip()]
        return AdminAnalyticsService.get_cohort_overview(
            selected_emails=selected_emails,
            post_test_completed_only=post_test_only,
        )
    except Exception as e:
        logger.error(f"Error computing analytics overview: {str(e)}")
        raise HTTPException(status_code=500, detail="Error computing analytics overview")


@router.get("/analyzer/regression-check")
@limiter.limit("5/minute")
def get_analyzer_regression_check(
    request: Request,
    refresh: bool = False,
    admin_email: str = Depends(get_current_admin_user),
):
    """
    Server-side pass/fail regression check for the complexity analyzer.

    This is deliberately separate from the client-side Pyodide benchmark
    (EvaluationSuite.jsx / "Dataset Testing"): it runs entirely in the
    FastAPI backend on plain CPython, against a vendored copy of the
    analyzer and ground-truth dataset (see api/analyzer_diagnostics/),
    and returns a fixed-floor PASS/FAIL verdict instead of just descriptive
    charts. Intended as the answer to "how do you know the analyzer's
    reported accuracy hasn't regressed" -- runnable on demand from the
    admin dashboard, no browser/WASM required.

    Results are cached for ~30s per server instance; pass `?refresh=true`
    to force a fresh run.
    """
    try:
        return AnalyzerDiagnosticsService.get_regression_report(force_refresh=refresh)
    except Exception as e:
        logger.error(f"Error running analyzer regression check: {str(e)}")
        raise HTTPException(status_code=500, detail="Error running analyzer regression check")