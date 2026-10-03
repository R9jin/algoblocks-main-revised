"""
Insight Generator (composed)

EducationalInsightGenerator is the public, learner-facing explanation engine
used by the analyzer to narrate each recorded line and the overall algorithm.
It composes one instance of each explanation sub-component (plain has-a
attributes) instead of inheriting from them, and exposes a small facade of
public methods that delegate to the right sub-component -- so callers outside
this package (e.g. signature_recorder.py) keep calling
`nlg_engine.get_time_bottleneck_warning(...)` etc.

Design goals (from the AlgoBlocks manuscript, "glass box" model):
  * every explanation links a program step to the growth component that
    produces its cost (which loops repeat it, what it multiplies into),
  * explanations are deterministic -- the same code always yields the same
    words, so re-analysis while the learner edits blocks never reshuffles text,
  * explanations use the learner's own code (loop bounds, line numbers,
    variable names, observed execution counts) rather than generic Big-O facts,
  * feedback is actionable: traps come with a concrete alternative.

Section headers deliberately match the ones the UI already styles
(`formatExplanation` in asymptoticParser.jsx): Local Analysis, Global Impact,
Educational Insight, Bottleneck Warning, Space Bottleneck, Algorithmic Mastery.
"""
import ast
import zlib

from complexity_explainer.pattern_visitor import ComprehensiveASTVisitor
from complexity_explainer.variable_explanations import VariableExplanations
from complexity_explainer.insight_gatherers import InsightGatherers
from complexity_explainer.overall_narrative import OverallNarrative
from complexity_explainer.explanation_warnings import ExplanationWarnings
from complexity_explainer.growth_insight import ProgramShape
from complexity_explainer.line_insights import LineInsights


class EducationalInsightGenerator:
    """
    Builds plain-language, classroom-style explanations of what a line of code
    is doing and why it costs what it costs. Written for students who are
    still building intuition for Big-O -- short sentences, concrete numbers,
    and a friendly, direct tone over formal jargon.

    Composes: variable_explanations, insight_gatherers, line_insights,
    overall_narrative, explanation_warnings (see each module's docstring).
    """
    def __init__(self, ctx):
        self.ctx = ctx
        self.variable_explanations = VariableExplanations(self)
        self.insight_gatherers = InsightGatherers(self)
        self.overall_narrative = OverallNarrative(self)
        self.explanation_warnings = ExplanationWarnings(self)
        self.line_insights = LineInsights(self)
        self._seed = ""
        self._shape = None
        self._shape_key = None

    # -------------------------------------------------------------------
    # Deterministic phrasing pick. Several equivalent phrasings exist so a
    # long algorithm doesn't read like a form letter, but the choice is a
    # stable hash of (what is being explained) -- NOT random -- so the same
    # line always reads the same way between re-analyses.
    # -------------------------------------------------------------------
    def _v(self, *options):
        if len(options) == 1:
            return options[0]
        key = f"{self._seed}|{options[0][:40]}".encode("utf-8", "ignore")
        return options[zlib.crc32(key) % len(options)]

    # -------------------------------------------------------------------
    # Structural facts about the learner's program (enclosing loops, loop
    # bounds...). Parsed once per analysis, from the same source lines.
    # -------------------------------------------------------------------
    @property
    def shape(self) -> ProgramShape:
        lines = getattr(self.ctx, "source_lines", None) or []
        key = (id(lines), len(lines))
        if self._shape is None or self._shape_key != key:
            self._shape = ProgramShape.from_source_lines(lines)
            self._shape_key = key
        return self._shape

    # -------------------------------------------------------------------
    # Public facade methods
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
        self._seed = f"{getattr(node, 'lineno', 0)}:{code_snippet}"
        line_no = getattr(node, "lineno", -1)

        if is_dead and hits == 0:
            t_desc = (
                f"**Local & Global Analysis:**\nThis line (`{code_snippet}`) is dead code -- no path through the program can reach it, "
                f"so it never runs and adds nothing to the cost: O(1). Removing it would not change the complexity."
            )
            s_desc = (
                "**Local & Global Analysis:**\nSince this code never executes, it never needs any memory either -- O(1)."
            )
            return t_desc, s_desc

        visitor = ComprehensiveASTVisitor(self.ctx)
        sig = visitor.analyze(node)
        ve = self.variable_explanations
        shape = self.shape

        g_time_info = ve._classify_big_o(str(global_t))
        l_time_info = ve._classify_big_o(str(local_t))
        g_space_info = ve._classify_big_o(str(global_s))
        l_space_info = ve._classify_big_o(str(local_s))

        # ---------------- TIME ----------------
        time_intro = ve._build_action_intro(node, code_snippet, sig)
        time_local = ve._build_local_time_explanation(l_time_info, sig, node=node, line_no=line_no)
        time_global = ve._build_global_time_explanation(l_time_info, g_time_info, sig, node=node, line_no=line_no)

        time_insights = self.insight_gatherers._gather_time_insights(
            sig, str(local_t), global_t=str(global_t), node=node, hits=hits, code_snippet=code_snippet)
        time_insight_text = "\n\n**Educational Insight:**\n" + "\n\n".join(time_insights) if time_insights else ""
        time_hits = ve._build_observed_note(node, hits, is_dead)

        full_time_desc = (
            f"{time_intro}\n\n"
            f"**Local Analysis:**\n{time_local}\n\n"
            f"**Global Impact:**\n{time_global}"
            f"{time_insight_text}"
            f"{time_hits}"
        )

        # ---------------- SPACE ----------------
        space_local = ve._build_local_space_explanation(l_space_info, sig, node=node)
        space_global = ve._build_global_space_explanation(l_space_info, g_space_info, sig, node=node, line_no=line_no, global_raw=str(global_s))

        space_insights = self.insight_gatherers._gather_space_insights(
            sig, mem_state, node=node, local_s=str(local_s), global_s=str(global_s), hits=hits)
        space_insight_text = "\n\n**Educational Insight:**\n" + "\n\n".join(space_insights) if space_insights else ""

        full_space_desc = (
            f"**Local Analysis:**\n{space_local}\n\n"
            f"**Global Impact:**\n{space_global}"
            f"{space_insight_text}"
        )

        return full_time_desc, full_space_desc

    def generate_definition_explanations(self, node, dead_reason=None, code_snippet=""):
        """Explanation pair for a `def` line (the analyzer pins its cost at O(1),
        so it never goes through generate_explanations). Defining a function is
        cheap -- the interesting teaching is what its CALLS will cost."""
        name = getattr(node, "name", "this function")
        line_no = getattr(node, "lineno", -1)
        self._seed = f"{line_no}:{code_snippet or name}"
        params = [a.arg for a in node.args.args + node.args.kwonlyargs]
        sig_txt = f"`def {name}({', '.join(params)}):`"
        facts = self.shape.recursion_facts()
        recursive = name in facts["recursive"]

        dead = f"{dead_reason}\n\n" if dead_reason else ""
        intro = (f"{sig_txt} defines a function: it packages the body under a name so it can be run later, "
                 f"as many times as it is called.")
        local_t = (f"Defining `{name}` is O(1): Python builds one function object and binds the name to it. "
                   f"None of the body runs yet.")
        if recursive:
            global_t = (f"The cost of `{name}` is paid on its *calls*, not here. Because `{name}` calls itself, the total "
                        f"depends on how many calls the recursion makes -- the lines inside show what each call costs, "
                        f"and the overall analysis settles the recurrence.")
        else:
            global_t = (f"The cost of `{name}` is paid on its *calls*, not here. Each call runs every line of the body once "
                        f"(plus whatever loops are inside), so the total is (cost of the body) x (number of calls).")

        t_notes = self.line_insights._t_funcdef(node, line_no)
        t_insights = self.insight_gatherers._top(t_notes, 4) if t_notes else []
        t_block = ("\n\n**Educational Insight:**\n" + "\n\n".join(t_insights)) if t_insights else ""
        time_desc = (f"{dead}{intro}\n\n**Local Analysis:**\n{local_t}\n\n**Global Impact:**\n{global_t}{t_block}")

        s_local = f"The function object itself takes a small, fixed amount of memory -- O(1)."
        if recursive:
            s_global = (f"Each active call of `{name}` keeps its own frame (parameters + local variables) until it returns. "
                        f"Recursion makes those frames pile up, so the stack depth -- not the function object -- is what costs memory.")
        else:
            s_global = (f"Memory is used when `{name}` *runs*: each call gets a temporary frame for its parameters and locals, "
                        f"released when the call returns. Anything the body builds is accounted on its own lines.")
        s_notes = self.line_insights._s_funcdef(node, line_no)
        s_insights = self.insight_gatherers._top(s_notes, 3) if s_notes else []
        s_block = ("\n\n**Educational Insight:**\n" + "\n\n".join(s_insights)) if s_insights else ""
        space_desc = f"**Local Analysis:**\n{s_local}\n\n**Global Impact:**\n{s_global}{s_block}"
        return time_desc, space_desc
