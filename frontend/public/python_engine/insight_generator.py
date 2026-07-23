"""
Insight Generator (composed)

Composes the explanation mixins into the public EducationalInsightGenerator,
which is the AI-facing explanation engine used by the analyzer to narrate
each recorded line and the overall algorithm.
"""
import ast
import random
import re
from typing import Any, Dict, List, Optional, Set

from explanation_signals import BigOInfo
from pattern_visitor import ComprehensiveASTVisitor
from variable_explanations import VariableExplanationMixin
from insight_gatherers import InsightGathererMixin
from overall_narrative import OverallNarrativeMixin
from explanation_warnings import ExplanationWarningsMixin


class EducationalInsightGenerator(
    VariableExplanationMixin,
    InsightGathererMixin,
    OverallNarrativeMixin,
    ExplanationWarningsMixin,
):
    """
    Builds plain-language, classroom-style explanations of what a line of code
    is doing and why it costs what it costs. Written for students who are
    still building intuition for Big-O -- so it favors short sentences,
    concrete comparisons, and a friendly, direct tone over formal jargon.
    Multiple phrasings are used for the same idea so the output doesn't feel
    like a templated form letter.
    """
    def __init__(self, ctx):
        self.ctx = ctx

    # -------------------------------------------------------------------
    # Small helper: pick one of several equivalent phrasings at random so
    # repeated explanations across a long algorithm don't all sound identical.
    # -------------------------------------------------------------------
    def _v(self, *options):
        return random.choice(options)

    def generate_explanations(self, node, local_t, global_t, local_s, global_s, is_dead, code_snippet, hits=0, mem_state=None):
        if is_dead and hits == 0:
            t_desc = (
                f"**Local & Global:**\nThis line (`{code_snippet}`) is dead code -- there's no way for the program to ever reach it, "
                f"so it never runs and costs nothing: O(1)."
            )
            s_desc = (
                "**Local & Global:**\nSince this code never executes, it never needs any memory either -- O(1)."
            )
            return t_desc, s_desc

        visitor = ComprehensiveASTVisitor(self.ctx)
        sig = visitor.analyze(node)

        g_time_info = self._classify_big_o(str(global_t))
        l_time_info = self._classify_big_o(str(local_t))
        g_space_info = self._classify_big_o(str(global_s))
        l_space_info = self._classify_big_o(str(local_s))

        time_intro = self._build_action_intro(node, code_snippet, sig)
        time_local = self._build_local_time_explanation(l_time_info, sig)
        time_global = self._build_global_time_explanation(l_time_info, g_time_info, sig)

        time_insights = self._gather_time_insights(sig, str(local_t))
        time_insight_text = "\n\n**Worth Knowing:**\n" + "\n\n".join(time_insights) if time_insights else ""
        time_hits = f"\n\n*This line actually ran {hits} time(s) during the last test.*" if hits > 0 else ""

        full_time_desc = (
            f"{time_intro}\n\n"
            f"**On Its Own:**\n{time_local}\n\n"
            f"**In the Bigger Picture:**\n{time_global}"
            f"{time_insight_text}"
            f"{time_hits}"
        )

        space_local = self._build_local_space_explanation(l_space_info, sig)
        space_global = self._build_global_space_explanation(l_space_info, g_space_info, sig)

        space_insights = self._gather_space_insights(sig, mem_state)
        space_insight_text = "\n\n**Worth Knowing:**\n" + "\n\n".join(space_insights) if space_insights else ""

        full_space_desc = (
            f"**On Its Own:**\n{space_local}\n\n"
            f"**In the Bigger Picture:**\n{space_global}"
            f"{space_insight_text}"
        )

        return full_time_desc, full_space_desc
