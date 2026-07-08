# api/routers/progress_router.py
from fastapi import APIRouter, Depends, HTTPException
import logging
from ..models import ProgressUpdate, ActivitySubmission, AssessmentSubmission, BatchSyncPayload, SyncResponse
from ..services.auth_service import AuthService
from ..repositories.user_repo import UserRepository
from ..security import get_current_user_email

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/update-progress")
async def update_progress(data: ProgressUpdate, current_user_email: str = Depends(get_current_user_email)):
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
async def sync_submission(data: ActivitySubmission, current_user_email: str = Depends(get_current_user_email)):
    try:
        if data.userId != current_user_email:
            raise HTTPException(status_code=403, detail="Not authorized to sync this submission")

        submission_dict = data.dict()
        submission_dict["isSynced"] = True

        AuthService.sync_submission(submission_dict)

        return {"status": "success", "message": "Submission synced"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error syncing submission: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/sync-assessment")
async def sync_assessment(data: AssessmentSubmission, current_user_email: str = Depends(get_current_user_email)):
    try:
        if data.userId != current_user_email:
            raise HTTPException(status_code=403, detail="Not authorized to sync this assessment")

        assessment_dict = data.dict()
        assessment_dict["isSynced"] = True
        
        AuthService.sync_assessment(assessment_dict)

        return {"status": "success", "message": "Assessment synced"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error syncing assessment: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/batch-sync", response_model=SyncResponse)
async def batch_sync(payload: BatchSyncPayload, current_user_email: str = Depends(get_current_user_email)):
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
async def get_submission(activityId: str, moduleId: str, current_user_email: str = Depends(get_current_user_email)):
    try:
        res = AuthService.get_submission(current_user_email, activityId, moduleId)
        if res.get("submission"):
            return {"status": "success", "submission": res["submission"]}
        return {"status": "not_found", "submission": None}
    except Exception as e:
        logger.error(f"Error fetching submission: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/get-assessment")
async def get_assessment(assessmentId: str, current_user_email: str = Depends(get_current_user_email)):
    try:
        res = AuthService.get_assessment(current_user_email, assessmentId)
        if res.get("assessment"):
            return {"status": "success", "assessment": res["assessment"]}
        return {"status": "not_found", "assessment": None}
    except Exception as e:
        logger.error(f"Error fetching assessment: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")