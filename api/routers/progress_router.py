# api/routers/progress_router.py
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from database import db 
from security import get_current_user_email

router = APIRouter()

@router.get("/get-progress")
def get_progress(user_email: str = Depends(get_current_user_email)):
    if not user_email:
        raise HTTPException(status_code=401, detail="Invalid user token")

    try:
        # Returning raw array to fix the frontend .map() parsing error
        progress_data = list(db["progress"].find({"userId": user_email}, {"_id": 0}))
        return progress_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/get-assessments")
def get_assessments(user_email: str = Depends(get_current_user_email)):
    if not user_email:
        raise HTTPException(status_code=401, detail="Invalid user token")

    try:
        assessment_data = list(db["assessments"].find({"userId": user_email}, {"_id": 0}))
        return assessment_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/get-submission")
def get_submission(
    activityId: str = Query(..., description="The ID of the activity"),
    moduleId: str = Query(None, description="The ID of the module"),
    user_email: str = Depends(get_current_user_email)
):
    if not user_email:
        raise HTTPException(status_code=401, detail="Invalid user token")

    try:
        submission = db["submissions"].find_one(
            {"userId": user_email, "activityId": activityId}, 
            {"_id": 0}
        )
        return submission if submission else {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    

@router.get("/get-submissions")
def get_all_submissions(user_email: str = Depends(get_current_user_email)):
    if not user_email:
        raise HTTPException(status_code=401, detail="Invalid user token")

    try:
        # Fetch all submissions for this user
        submissions_data = list(db["submissions"].find({"userId": user_email}, {"_id": 0}))
        return submissions_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.post("/update-progress")
def update_progress(payload: dict = Body(...), user_email: str = Depends(get_current_user_email)):
    if not user_email:
        raise HTTPException(status_code=401, detail="Invalid user token")

    try:
        key = payload.get("key") or payload.get("lesson_id")
        if not key:
            raise HTTPException(status_code=400, detail="Missing progress key or lesson_id")

        # Fallback check: If the frontend sent nested data, flatten it
        actual_data = payload.get("data", payload)
        if isinstance(actual_data, dict):
            for k, v in payload.items():
                if k != "data":
                    actual_data[k] = v
        else:
            actual_data = payload

        actual_data["key"] = key
        actual_data["userId"] = user_email

        db["progress"].update_one(
            {"userId": user_email, "key": key},
            {"$set": actual_data},
            upsert=True
        )

        return {"status": "success", "message": "Progress updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update progress: {str(e)}")

@router.post("/update-assessment")
def update_assessment(payload: dict = Body(...), user_email: str = Depends(get_current_user_email)):
    if not user_email:
        raise HTTPException(status_code=401, detail="Invalid user token")

    try:
        key = payload.get("key") or payload.get("assessment_key")
        if not key:
            raise HTTPException(status_code=400, detail="Missing assessment key")

        # Fallback check: If the frontend sent nested data, flatten it
        actual_data = payload.get("data", payload)
        if isinstance(actual_data, dict):
            for k, v in payload.items():
                if k != "data":
                    actual_data[k] = v
        else:
            actual_data = payload

        actual_data["key"] = key
        actual_data["userId"] = user_email

        db["assessments"].update_one(
            {"userId": user_email, "key": key},
            {"$set": actual_data},
            upsert=True
        )

        return {"status": "success", "message": "Assessment updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update assessment: {str(e)}")

@router.post("/sync-submission")
def sync_submission(payload: dict = Body(...), user_email: str = Depends(get_current_user_email)):
    if not user_email:
        raise HTTPException(status_code=401, detail="Invalid user token")

    try:
        activity_id = payload.get("activityId")
        if not activity_id:
            raise HTTPException(status_code=400, detail="Missing activityId in payload")

        payload["userId"] = user_email

        db["submissions"].update_one(
            {"userId": user_email, "activityId": activity_id},
            {"$set": payload},
            upsert=True
        )

        return {"status": "success", "message": "Submission synced successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync submission: {str(e)}")