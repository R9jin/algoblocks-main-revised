# api/routers/analyze_router.py
import sys
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# Create the router
router = APIRouter(prefix="/api/analyze", tags=["Analyzer"])

# Tell Python where your engine scripts are (since they live in the frontend folder)
engine_path = os.path.join(os.path.dirname(__file__), "../../frontend/public/python_engine")
if engine_path not in sys.path:
    sys.path.append(engine_path)

try:
    # Import your actual custom AST analyzer!
    from analyzer import ComplexityAnalyzer
except ImportError:
    ComplexityAnalyzer = None

class CodePayload(BaseModel):
    code: str

@router.post("")
def analyze_python_code(payload: CodePayload):
    if ComplexityAnalyzer is None:
        raise HTTPException(500, "Analyzer engine not found on server")

    try:
        # Run the user's code through your custom logic
        analyzer = ComplexityAnalyzer()
        results = analyzer.analyze(payload.code)
        
        return {
            "status": "success",
            "results": results
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }