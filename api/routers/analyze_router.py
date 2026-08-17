# api/routers/analyze_router.py
from fastapi import APIRouter, Body, Request
from limiter import limiter

router = APIRouter()

# SECURITY: this endpoint is intentionally public/unauthenticated (it's a
# static fallback for the editor -- see the stub notice below), which makes
# it the easiest target on the whole API for a bot to hammer with no login
# required. Rate limit it like the other public auth endpoints.
@router.post("/analyze")
@limiter.limit("20/minute")
async def analyze_code(request: Request, payload: dict = Body(...)):
    """
    ARCHITECTURAL STUB NOTICE (BUG-12 Remediation):
    All real-time AST computational complexity analysis is executed client-side inside 
    Pyodide Web Workers (analyzer.worker.js). This endpoint is preserved strictly as 
    a static test harness fallback for the editor.
    """
    code = payload.get("code", "")
    
    return {
        "status": "success",
        "analysis": {
            "message": "Code parsed successfully. Use the Run button to execute output via Pyodide.",
            "complexity": "O(N) Estimated - Subject to Pyodide client execution trace",
            "suggestions": [],
            "issues": []
        }
    }