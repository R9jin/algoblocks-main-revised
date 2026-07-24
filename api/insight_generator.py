"""
Insight Generator (composed)

EducationalInsightGenerator is the public, AI-facing explanation engine
used by the analyzer to narrate each recorded line and the overall
algorithm. It composes one instance of each explanation sub-component
(plain has-a attributes) instead of inheriting from them, and exposes a
small facade of public methods that delegate to the right sub-component
-- so callers outside this package (e.g. signature_recorder.py) keep
calling `nlg_engine.get_time_bottleneck_warning(...)` etc. without
needing to know which sub-component actually implements it.
"""
import random

from pattern_visitor import ComprehensiveASTVisitor
from variable_explanations import VariableExplanations
from insight_gatherers import InsightGatherers
from overall_narrative import OverallNarrative
from explanation_warnings import ExplanationWarnings


class EducationalInsightGenerator:
    """
    Builds plain-language, classroom-style explanations of what a line of code
    is doing and why it costs what it costs. Written for students who are
    still building intuition for Big-O -- so it favors short sentences,
    concrete comparisons, and a friendly, direct tone over formal jargon.
    Multiple phrasings are used for the same idea so the output doesn't feel
    like a templated form letter.

    Composes: variable_explanations, insight_gatherers, overall_narrative,
    explanation_warnings (see each module's docstring for its role).
    """
    def __init__(self, ctx):
        self.ctx = ctx
        self.variable_explanations = VariableExplanations(self)
        self.insight_gatherers = InsightGatherers(self)
        self.overall_narrative = OverallNarrative(self)
        self.explanation_warnings = ExplanationWarnings(self)

    # -------------------------------------------------------------------
    # Small helper: pick one of several equivalent phrasings at random so
    # repeated explanations across a long algorithm don't all sound identical.
    # -------------------------------------------------------------------
    def _v(self, *options):
        return random.choice(options)

    # -------------------------------------------------------------------
    # Public facade methods -- thin delegates to the owning sub-component,
    # kept here so the rest of the codebase has one stable entry point
    # (`nlg_engine.<method>`) regardless of which sub-component implements it.
    # -------------------------------------------------------------------
    def generate_variable_explanation(self, *args, **kwargs):
        return self.variable_explanations.generate_variable_explanation(*args, **kwargs)

    def get_time_bottleneck_warning(self, *args, **kwargs):
        return self.explanation_warnings.get_time_bottleneck_warning(*args, **kwargs)

    def get_space_bottleneck_warning(self, *args, **kwargs):
        return self.explanation_warnings.get_space_bottleneck_warning(*args, **kwargs)

    def get_time_optimization_praise(self, *args, **kwargs):
        return self.explanation_warnings.get_time_optimization_praise(*args, **kwargs)

    def _format_recurrence_relation(self, *args, **kwargs):
        return self.explanation_warnings._format_recurrence_relation(*args, **kwargs)

    def generate_overall_analysis(self, *args, **kwargs):
        return self.overall_narrative.generate_overall_analysis(*args, **kwargs)

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

        g_time_info = self.variable_explanations._classify_big_o(str(global_t))
        l_time_info = self.variable_explanations._classify_big_o(str(local_t))
        g_space_info = self.variable_explanations._classify_big_o(str(global_s))
        l_space_info = self.variable_explanations._classify_big_o(str(local_s))

        time_intro = self.variable_explanations._build_action_intro(node, code_snippet, sig)
        time_local = self.variable_explanations._build_local_time_explanation(l_time_info, sig)
        time_global = self.variable_explanations._build_global_time_explanation(l_time_info, g_time_info, sig)

        time_insights = self.insight_gatherers._gather_time_insights(sig, str(local_t))
        time_insight_text = "\n\n**Worth Knowing:**\n" + "\n\n".join(time_insights) if time_insights else ""
        time_hits = f"\n\n*This line actually ran {hits} time(s) during the last test.*" if hits > 0 else ""

        full_time_desc = (
            f"{time_intro}\n\n"
            f"**On Its Own:**\n{time_local}\n\n"
            f"**In the Bigger Picture:**\n{time_global}"
            f"{time_insight_text}"
            f"{time_hits}"
        )

        space_local = self.variable_explanations._build_local_space_explanation(l_space_info, sig)
        space_global = self.variable_explanations._build_global_space_explanation(l_space_info, g_space_info, sig)

        space_insights = self.insight_gatherers._gather_space_insights(sig, mem_state)
        space_insight_text = "\n\n**Worth Knowing:**\n" + "\n\n".join(space_insights) if space_insights else ""

        full_space_desc = (
            f"**On Its Own:**\n{space_local}\n\n"
            f"**In the Bigger Picture:**\n{space_global}"
            f"{space_insight_text}"
        )

        return full_time_desc, full_space_desc
