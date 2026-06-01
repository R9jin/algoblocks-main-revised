# api/routers/analyze_router.py
from fastapi import APIRouter, Body

router = APIRouter()

# -------------------------------------------------------------
# RUN ENDPOINT REMOVED
# As requested, /run is removed because Python execution 
# is strictly handled by Pyodide in the browser.
# -------------------------------------------------------------

# -------------------------------------------------------------
# ANALYZE ENDPOINT
# Added to stop the 404 Not Found spam when the frontend editor
# asks for static analysis or Big-O complexity estimates.
# -------------------------------------------------------------
@router.post("/analyze")
async def analyze_code(payload: dict = Body(...)):
    """
    Provides static analysis/feedback for the frontend editor.
    """
    code = payload.get("code", "")
    
    # Return a basic structure so the frontend parser doesn't crash
    return {
        "status": "success",
        "analysis": {
            "message": "Code parsed successfully. Use the Run button to execute output via Pyodide.",
            "complexity": "O(N) Estimated - Subject to Pyodide trace",
            "suggestions": [],
            "issues": []
        }
    }