# api/routers/progress_router.py
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict, Any
import logging
from ..models import ProgressUpdate, ActivitySubmission, AssessmentSubmission, BatchSyncPayload, SyncResponse
from ..database import users_collection, progress_collection, submissions_collection, assessments_collection
# BUG-10 Fix: Align with live security signature get_current_user_email
from ..security import get_current_user_email

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/update-progress")
async def update_progress(data: ProgressUpdate, current_user_email: str = Depends(get_current_user_email)):
    try:
        if data.email != current_user_email:
            raise HTTPException(status_code=403, detail="Not authorized to update this progress")

        users_collection.update_one(
            {"email": current_user_email},
            {"$set": {f"progress.{data.lesson_id}": data.score}},
            upsert=True
        )

        progress_collection.update_one(
            {"userId": current_user_email, "lessonId": data.lesson_id},
            {
                "$set": {
                    "score": data.score,
                    "completed": data.completed,
                    "lastUpdated": data.dict().get("timestamp", None)
                }
            },
            upsert=True
        )

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

        submissions_collection.update_one(
            {
                "userId": current_user_email,
                "moduleId": data.moduleId,
                "activityId": data.activityId
            },
            {"$set": submission_dict},
            upsert=True
        )

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

        assessments_collection.update_one(
            {
                "userId": current_user_email,
                "assessmentId": data.assessmentId
            },
            {"$set": data.dict()},
            upsert=True
        )

        return {"status": "success", "message": "Assessment synced"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error syncing assessment: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/batch-sync", response_model=SyncResponse)
async def batch_sync(payload: BatchSyncPayload, current_user_email: str = Depends(get_current_user_email)):
    try:
        synced_count = 0

        if payload.progress:
            for prog in payload.progress:
                if prog.get("email") == current_user_email:
                    progress_collection.update_one(
                        {"userId": current_user_email, "lessonId": prog.get("lesson_id")},
                        {"$set": prog},
                        upsert=True
                    )
                    users_collection.update_one(
                        {"email": current_user_email},
                        {"$set": {f"progress.{prog.get('lesson_id')}": prog.get("score")}},
                        upsert=True
                    )
                    synced_count += 1

        if payload.submissions:
            for sub in payload.submissions:
                if sub.get("userId") == current_user_email:
                    sub["isSynced"] = True
                    submissions_collection.update_one(
                        {
                            "userId": current_user_email,
                            "moduleId": sub.get("moduleId"),
                            "activityId": sub.get("activityId")
                        },
                        {"$set": sub},
                        upsert=True
                    )
                    synced_count += 1

        if payload.assessments:
            for ass in payload.assessments:
                if ass.get("userId") == current_user_email:
                    assessments_collection.update_one(
                        {
                            "userId": current_user_email,
                            "assessmentId": ass.get("assessmentId")
                        },
                        {"$set": ass},
                        upsert=True
                    )
                    synced_count += 1

        return SyncResponse(status="success", message="Batch sync completed", synced_items=synced_count)

    except Exception as e:
        logger.error(f"Error in batch sync: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error during batch sync")

@router.get("/get-submission")
async def get_submission(activityId: str, moduleId: str, current_user_email: str = Depends(get_current_user_email)):
    try:
        submission = submissions_collection.find_one(
            {"userId": current_user_email, "moduleId": moduleId, "activityId": activityId},
            {"_id": 0}
        )
        if submission:
            return {"status": "success", "submission": submission}
        return {"status": "not_found", "submission": None}
    except Exception as e:
        logger.error(f"Error fetching submission: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/get-assessment")
async def get_assessment(assessmentId: str, current_user_email: str = Depends(get_current_user_email)):
    try:
        assessment = assessments_collection.find_one(
            {"userId": current_user_email, "assessmentId": assessmentId},
            {"_id": 0}
        )
        if assessment:
            return {"status": "success", "assessment": assessment}
        return {"status": "not_found", "assessment": None}
    except Exception as e:
        logger.error(f"Error fetching assessment: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")