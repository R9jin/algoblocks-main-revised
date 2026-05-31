# api/routers/progress_router.py
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from typing import Dict, Any, List

# CORRECTED IMPORTS: Removed 'api.' prefix since we are running inside the api folder
from database import db 
from security import get_current_user 

router = APIRouter()

# -------------------------------------------------------------
# GET PROGRESS
# -------------------------------------------------------------
@router.get("/get-progress")
async def get_progress(current_user: dict = Depends(get_current_user)):
    user_email = current_user.get("email")
    if not user_email:
        raise HTTPException(status_code=401, detail="Invalid user token")

    try:
        progress_data = list(db["progress"].find({"userId": user_email}, {"_id": 0}))
        return {"status": "success", "progress": progress_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# -------------------------------------------------------------
# GET ASSESSMENTS
# -------------------------------------------------------------
@router.get("/get-assessments")
async def get_assessments(current_user: dict = Depends(get_current_user)):
    user_email = current_user.get("email")
    if not user_email:
        raise HTTPException(status_code=401, detail="Invalid user token")

    try:
        assessment_data = list(db["assessments"].find({"userId": user_email}, {"_id": 0}))
        return {"status": "success", "assessments": assessment_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# -------------------------------------------------------------
# GET ALL SUBMISSIONS (NEW: Fixes missing python code fetch)
# -------------------------------------------------------------
@router.get("/get-all-submissions")
async def get_all_submissions(
    email: str = Query(..., description="User email"),
    current_user: dict = Depends(get_current_user)
):
    """
    Fetches all coding activity submissions for a user securely.
    Verifies token and ensures requested email matches the logged-in user.
    """
    token_email = current_user.get("email")
    
    if not token_email or token_email.lower() != email.lower():
        raise HTTPException(status_code=403, detail="Not authorized to access this user's submissions")

    try:
        # Fetch submissions and exclude the ObjectID to prevent JSON serialization errors
        submissions = list(db["submissions"].find({"userId": token_email}, {"_id": 0}))
        return {"status": "success", "submissions": submissions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# -------------------------------------------------------------
# UPDATE PROGRESS
# -------------------------------------------------------------
@router.post("/update-progress")
async def update_progress(payload: dict = Body(...), current_user: dict = Depends(get_current_user)):
    user_email = current_user.get("email")
    if not user_email:
        raise HTTPException(status_code=401, detail="Invalid user token")

    try:
        # Support either format depending on frontend mapping
        key = payload.get("key") or payload.get("lesson_id")
        if not key:
            raise HTTPException(status_code=400, detail="Missing progress key or lesson_id")

        payload["userId"] = user_email

        # Upsert: Update if exists, insert if new
        db["progress"].update_one(
            {"userId": user_email, "key": key},
            {"$set": payload},
            upsert=True
        )

        return {"status": "success", "message": "Progress updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update progress: {str(e)}")

# -------------------------------------------------------------
# UPDATE ASSESSMENT
# -------------------------------------------------------------
@router.post("/update-assessment")
async def update_assessment(payload: dict = Body(...), current_user: dict = Depends(get_current_user)):
    user_email = current_user.get("email")
    if not user_email:
        raise HTTPException(status_code=401, detail="Invalid user token")

    try:
        key = payload.get("key") or payload.get("assessment_key")
        if not key:
            raise HTTPException(status_code=400, detail="Missing assessment key")

        payload["userId"] = user_email

        # Upsert: Update if exists, insert if new
        db["assessments"].update_one(
            {"userId": user_email, "key": key},
            {"$set": payload},
            upsert=True
        )

        return {"status": "success", "message": "Assessment updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update assessment: {str(e)}")

# -------------------------------------------------------------
# SYNC SUBMISSION (Handles Python Code & Test Outputs)
# -------------------------------------------------------------
@router.post("/sync-submission")
async def sync_submission(payload: dict = Body(...), current_user: dict = Depends(get_current_user)):
    user_email = current_user.get("email")
    if not user_email:
        raise HTTPException(status_code=401, detail="Invalid user token")

    try:
        activity_id = payload.get("activityId")
        if not activity_id:
            raise HTTPException(status_code=400, detail="Missing activityId in payload")

        # Security: Force the user ID to the logged-in token's email
        payload["userId"] = user_email

        # Upsert: Update if exists, insert if new
        db["submissions"].update_one(
            {"userId": user_email, "activityId": activity_id},
            {"$set": payload},
            upsert=True
        )

        return {"status": "success", "message": "Submission synced successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync submission: {str(e)}")