# api/routers/analyze_router.py
from fastapi import APIRouter, HTTPException, Body
from analyzer import analyze_source_code
from blockly_ast import evaluate_blockly_ast

router = APIRouter()

@router.post("/analyze")
def analyze_code(payload: dict = Body(...)):
    code = payload.get("code", "")
    if not code.strip():
        raise HTTPException(status_code=400, detail="Empty code provided")
    result = analyze_source_code(code)
    return result

@router.post("/evaluate-ast")
def evaluate_ast(payload: dict = Body(...)):
    workspace_xml = payload.get("workspaceXml", "")
    if not workspace_xml.strip():
        raise HTTPException(status_code=400, detail="Empty workspace XML provided")
    result = evaluate_blockly_ast(workspace_xml)
    return result