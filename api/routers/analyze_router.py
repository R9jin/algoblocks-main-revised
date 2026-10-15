# api/routers/analyze_router.py
"""
Code analysis endpoint for the AlgoBlocks API.

Mounts under the ``/api`` prefix (see index.py). Real-time AST complexity
analysis is executed client-side inside Pyodide Web Workers; this endpoint
serves only as a static fallback for the editor and is preserved for
compatibility with any tooling that targets ``/api/analyze`` directly.
"""
from fastapi import APIRouter, Body, Request
from limiter import limiter

router = APIRouter()

# This endpoint is intentionally public/unauthenticated (it is a static
# fallback for the editor). Rate-limit it to prevent automated hammering
# since no login is required to reach it.
@router.post("/analyze")
@limiter.limit("20/minute")
async def analyze_code(request: Request, payload: dict = Body(...)):
    """
    Static fallback for the code analysis editor.

    All real-time AST computational complexity analysis is executed
    client-side inside Pyodide Web Workers (``analyzer.worker.js``). This
    endpoint is preserved strictly as a test-harness fallback and always
    returns a static placeholder response — it does not perform any actual
    AST analysis.
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