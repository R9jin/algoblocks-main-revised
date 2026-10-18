# api/routers/progress_router.py
"""
Progress, submission, and assessment sync endpoints for the AlgoBlocks API.

Mounts under the ``/api`` prefix (see index.py). All endpoints require a
valid Bearer token; the authenticated user's email is verified against the
payload's ``email``/``userId`` before any write occurs, preventing users
from recording data on behalf of other accounts.
"""
from fastapi import APIRouter, Depends, HTTPException, Body, Request
from typing import Dict, Any
import logging

# Uses absolute imports (not relative) so this module can be loaded both\n# standalone and as part of the package without ImportErrors.
from models import ProgressUpdate, BatchSyncPayload, SyncResponse
from services.auth_service import AuthService
from repositories.user_repo import UserRepository
from security import get_current_user_email
from limiter import limiter

router = APIRouter()
logger = logging.getLogger(__name__)

# All endpoints in this router are rate-limited. An authenticated client (or
# a stolen/leaked token) without rate limiting could hammer these write-heavy
# sync endpoints without bound — a straightforward abuse and DB-load vector.
# The limits below are generous enough for normal background sync (every 30 s,
# see syncManager.js) while capping worst-case abuse per client.

@router.post("/update-progress")
@limiter.limit("30/minute")
def update_progress(request: Request, data: ProgressUpdate, current_user_email: str = Depends(get_current_user_email)):
    try:
        if data.email != current_user_email:
            raise HTTPException(status_code=403, detail="Not authorized to update this progress")

        # Automatically handles SQL logic in user_repo via jsonb
        AuthService.update_progress(data)
        
        return {"status": "success", "message": "Progress updated"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating progress: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/sync-submission")
@limiter.limit("30/minute")
def sync_submission(request: Request, data: Dict[str, Any] = Body(...), current_user_email: str = Depends(get_current_user_email)):
    try:
        if data.get("userId") != current_user_email:
            raise HTTPException(status_code=403, detail="Not authorized to sync this submission")

        data["isSynced"] = True

        AuthService.sync_submission(data)

        return {"status": "success", "message": "Submission synced"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error syncing submission: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/sync-assessment")
@limiter.limit("30/minute")
def sync_assessment(request: Request, data: Dict[str, Any] = Body(...), current_user_email: str = Depends(get_current_user_email)):
    try:
        if data.get("userId") != current_user_email:
            raise HTTPException(status_code=403, detail="Not authorized to sync this assessment")

        data["isSynced"] = True
        
        AuthService.sync_assessment(data)

        return {"status": "success", "message": "Assessment synced"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error syncing assessment: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/batch-sync", response_model=SyncResponse)
@limiter.limit("15/minute")
def batch_sync(request: Request, payload: BatchSyncPayload, current_user_email: str = Depends(get_current_user_email)):
    try:
        response = AuthService.batch_sync(payload.dict(), current_user_email)
        return SyncResponse(
            status=response["status"], 
            message=response["message"], 
            synced_items=response["synced_items"]
        )
    except Exception as e:
        logger.error(f"Error in batch sync: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error during batch sync")

@router.get("/get-submission")
@limiter.limit("60/minute")
def get_submission(request: Request, activityId: str, moduleId: str, current_user_email: str = Depends(get_current_user_email)):
    try:
        res = AuthService.get_submission(current_user_email, activityId, moduleId)
        if res and res.get("submission"):
            return {"status": "success", "submission": res["submission"]}
        return {"status": "not_found", "submission": None}
    except Exception as e:
        logger.error(f"Error fetching submission: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/get-assessment")
@limiter.limit("60/minute")
def get_assessment(request: Request, assessmentId: str, current_user_email: str = Depends(get_current_user_email)):
    try:
        res = AuthService.get_assessment(current_user_email, assessmentId)
        if res and res.get("assessment"):
            return {"status": "success", "assessment": res["assessment"]}
        return {"status": "not_found", "assessment": None}
    except Exception as e:
        logger.error(f"Error fetching assessment: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")