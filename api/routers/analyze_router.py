# api/routers/analyze_router.py
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

# Import directly from the local api folder
from analyzer import analyze_source_code
from limiter import limiter

router = APIRouter(prefix="/api/analyze", tags=["Analyzer"])

class CodePayload(BaseModel):
    code: str

@router.post("")
@limiter.limit("10/minute")
def analyze_python_code(request: Request, payload: CodePayload):
    try:
        # Pass the code directly into the wrapper function
        results = analyze_source_code(payload.code)
        
        # analyze_source_code already returns a dictionary with {"status": "success", ...} 
        return results
        
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }