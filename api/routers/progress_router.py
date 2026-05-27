# api/routers/progress_router.py
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, Dict, Any

router = APIRouter(prefix="/api", tags=["Progress"])

class ProgressPayload(BaseModel):
    userId: str
    moduleId: str
    activityId: str
    type: str
    status: str
    score: Optional[int] = 0
    maxScore: Optional[int] = 5
    passedTestCases: Optional[int] = 0
    totalTestCases: Optional[int] = 0
    workspace: Dict[str, Any]
    pythonCode: str
    timestamp: int
    submittedAt: Optional[str] = None
    isSynced: Optional[bool] = True

@router.post("/update-progress")
def update_progress(payload: ProgressPayload):
    from api.database import db 
    
    query = {
        "userId": payload.userId, 
        "moduleId": payload.moduleId, 
        "activityId": payload.activityId
    }
    
    update_data = {"$set": payload.model_dump()}
    
    # Upsert: Update if exists, Insert if new
    db.progress.update_one(query, update_data, upsert=True)
    return {"message": "Draft saved to MongoDB", "status": "success"}


@router.get("/get-progress")
def get_progress(email: str, moduleId: str, activityId: str):
    from api.database import db 
    
    progress = db.progress.find_one({
        "userId": email,
        "moduleId": moduleId,
        "activityId": activityId
    }, {"_id": 0}) 
    
    if progress:
        return {"submission": progress}
    return {"submission": None}