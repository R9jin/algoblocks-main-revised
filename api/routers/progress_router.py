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
        progress_data = list(db["progress"].find({"userId": user_email}, {"_id": 0}))
        for item in progress_data:
            if "data" in item and isinstance(item["data"], dict):
                nested = item.pop("data")
                item.update(nested)
        return progress_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/get-assessments")
def get_assessments(user_email: str = Depends(get_current_user_email)):
    if not user_email:
        raise HTTPException(status_code=401, detail="Invalid user token")

    try:
        assessment_data = list(db["assessments"].find({"userId": user_email}, {"_id": 0}))
        for item in assessment_data:
            if "data" in item and isinstance(item["data"], dict):
                nested = item.pop("data")
                item.update(nested)
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
        if submission and "data" in submission and isinstance(submission["data"], dict):
            nested = submission.pop("data")
            submission.update(nested)
        return submission if submission else {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    
@router.get("/get-submissions")
def get_all_submissions(user_email: str = Depends(get_current_user_email)):
    if not user_email:
        raise HTTPException(status_code=401, detail="Invalid user token")

    try:
        submissions_data = list(db["submissions"].find({"userId": user_email}, {"_id": 0}))
        for item in submissions_data:
            if "data" in item and isinstance(item["data"], dict):
                nested = item.pop("data")
                item.update(nested)
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

        actual_data = payload.get("data", payload)
        if isinstance(actual_data, dict) and actual_data is not payload:
            for k, v in payload.items():
                if k != "data":
                    actual_data[k] = v
        else:
            actual_data = payload.copy()

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

        actual_data = payload.get("data", payload)
        if isinstance(actual_data, dict) and actual_data is not payload:
            for k, v in payload.items():
                if k != "data":
                    actual_data[k] = v
        else:
            actual_data = payload.copy()

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
        actual_data = payload.get("data", payload)
        if isinstance(actual_data, dict) and actual_data is not payload:
            for k, v in payload.items():
                if k != "data":
                    actual_data[k] = v
        else:
            actual_data = payload.copy()

        activity_id = actual_data.get("activityId")
        if not activity_id:
            raise HTTPException(status_code=400, detail="Missing activityId in payload")

        actual_data["userId"] = user_email

        db["submissions"].update_one(
            {"userId": user_email, "activityId": activity_id},
            {"$set": actual_data},
            upsert=True
        )

        return {"status": "success", "message": "Submission synced successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync submission: {str(e)}")