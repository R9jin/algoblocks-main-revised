"""
complexity_explainer.py -- AI-generated educational explanations
(renamed from semantic_nlg.py, since this module's entire job is
producing the natural-language explanations of a line/algorithm's
complexity, not general NLG).

Public entry points re-exported here for backward compatibility:
  - EducationalInsightGenerator  the AI explanation engine
  - ComprehensiveASTVisitor      the pattern-signal collector it consumes
  - PatternSignals / BigOInfo / etc.  shared signal dataclasses

Implementation is split by pipeline stage across sibling modules:
  - explanation_signals.py    shared dataclasses
  - pattern_ast_visitor.py    raw AST pattern collection
  - pattern_evaluators.py     signal synthesis (recursion/memo/etc.)
  - pattern_visitor.py        composed ComprehensiveASTVisitor
  - variable_explanations.py  per-line/per-variable NLG
  - insight_gatherers.py      bottleneck/insight collection
  - overall_narrative.py      whole-algorithm narrative + recurrence solving
  - explanation_warnings.py   short-form warnings/praise
  - insight_generator.py      composed EducationalInsightGenerator
"""
from explanation_signals import (
    BigOInfo,
    MemorySignals,
    ComplexitySignals,
    AlgorithmicParadigms,
    PatternSignals,
)
from pattern_visitor import ComprehensiveASTVisitor
from insight_generator import EducationalInsightGenerator

__all__ = [
    "BigOInfo",
    "MemorySignals",
    "ComplexitySignals",
    "AlgorithmicParadigms",
    "PatternSignals",
    "ComprehensiveASTVisitor",
    "EducationalInsightGenerator",
]
