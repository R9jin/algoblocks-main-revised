from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from api.database import db # Adjust import based on your actual db instance
from api.security import get_current_user # Adjust based on your auth implementation

router = APIRouter(prefix="/api/progress", tags=["Progress"])

# Define exactly what the frontend should send
class AssessmentPayload(BaseModel):
    module_id: str
    score: int
    total_questions: int
    passed: bool

@router.post("/assessment")
async def save_assessment(payload: AssessmentPayload, current_user: dict = Depends(get_current_user)):
    try:
        # 1. Prepare the query to find the specific user and module
        query = {
            "user_id": current_user["_id"],  # Or current_user.id depending on your auth model
            "module_id": payload.module_id
        }

        # 2. Prepare the data to update or insert
        update_data = {
            "$set": {
                "score": payload.score,
                "total_questions": payload.total_questions,
                "passed": payload.passed,
                "updated_at": "ISODate()" # Or a datetime.utcnow()
            }
        }

        # 3. CRITICAL: Await the database call and use upsert=True
        result = await db.assessments.update_one(
            query, 
            update_data, 
            upsert=True  # Creates the document if it doesn't exist!
        )

        return {
            "success": True, 
            "message": "Assessment saved to MongoDB successfully.",
            "matched_count": result.matched_count,
            "modified_count": result.modified_count
        }

    except Exception as e:
        # If something breaks, throw a 500 so it doesn't silently fail with a 200 OK
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database insertion failed: {str(e)}"
        )