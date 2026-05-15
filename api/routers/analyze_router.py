# api/routers/analyze_router.py
import sys
import os
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from api.limiter import limiter # ✅ Import from the new file

# Create the router
router = APIRouter(prefix="/api/analyze", tags=["Analyzer"])

# Tell Python where your engine scripts are (since they live in the frontend folder)
engine_path = os.path.join(os.path.dirname(__file__), "../../frontend/public/python_engine")
if engine_path not in sys.path:
    sys.path.append(engine_path)

try:
    # ✅ FIX: Import the helper function instead of the class directly
    from analyzer import analyze_source_code
except ImportError:
    analyze_source_code = None

class CodePayload(BaseModel):
    code: str

@router.post("")
@limiter.limit("10/minute")
def analyze_python_code(request: Request, payload: CodePayload):
    if analyze_source_code is None:
        raise HTTPException(500, "Analyzer engine not found on server")

    try:
        # ✅ FIX: Pass the code directly into the wrapper function
        results = analyze_source_code(payload.code)
        
        # analyze_source_code already returns a dictionary with {"status": "success", ...} 
        # so we can just return it directly!
        return results
        
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }