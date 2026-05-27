# api/routers/progress_router.py
from fastapi import APIRouter, HTTPException, Body
from api.database import db

router = APIRouter()

# ==========================================
# ACTIVITY SUBMISSIONS (DRAFTS & FINAL)
# ==========================================
@router.post("/sync-submission")
async def sync_submission(payload: dict = Body(...)):
    user_id = payload.get("userId")
    module_id = payload.get("moduleId")
    activity_id = payload.get("activityId")

    if not user_id or not activity_id:
        raise HTTPException(status_code=400, detail="Missing userId or activityId")

    # Using synchronous PyMongo
    db["submissions"].update_one(
        {"userId": user_id, "moduleId": module_id, "activityId": activity_id},
        {"$set": payload},
        upsert=True
    )
    return {"status": "success", "message": "Submission synced"}

@router.get("/get-submission")
async def get_submission(email: str, activityId: str, moduleId: str = None):
    query = {"userId": email, "activityId": activityId}
    if moduleId:
        query["moduleId"] = moduleId
        
    # Using synchronous PyMongo
    submission = db["submissions"].find_one(query, {"_id": 0})
    
    return {"status": "success", "submission": submission}

# ==========================================
# ASSESSMENT SUBMISSIONS (DRAFTS & FINAL)
# ==========================================
@router.post("/sync-assessment")
async def sync_assessment(payload: dict = Body(...)):
    user_id = payload.get("userId")
    module_id = payload.get("moduleId")

    if not user_id or not module_id:
        raise HTTPException(status_code=400, detail="Missing userId or moduleId")

    db["assessments"].update_one(
        {"userId": user_id, "moduleId": module_id},
        {"$set": payload},
        upsert=True
    )
    return {"status": "success", "message": "Assessment synced"}

@router.get("/get-assessment")
async def get_assessment(email: str, moduleId: str):
    assessment = db["assessments"].find_one({"userId": email, "moduleId": moduleId}, {"_id": 0})
    return {"status": "success", "assessment": assessment}

# ==========================================
# GENERAL TOPIC PROGRESS (SCORE ONLY)
# ==========================================
@router.post("/update-progress")
async def update_progress(payload: dict = Body(...)):
    email = payload.get("email")
    lesson_id = payload.get("lesson_id")
    
    if not email or not lesson_id:
         raise HTTPException(status_code=400, detail="Missing email or lesson_id")
         
    db["progress"].update_one(
        {"email": email, "lesson_id": lesson_id},
        {"$set": payload},
        upsert=True
    )
    return {"status": "success"}