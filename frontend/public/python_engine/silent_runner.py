# frontend/public/python_engine/silent_runner.py
"""Silent diagnostic run.

Executes the learner's code in a throw-away namespace (nothing is printed, input()
is never answered, time.sleep is a no-op) and records EVERY runtime error it can
find, not just the first one:

  * each top-level statement runs on its own, so one crash does not hide the next;
  * functions that are defined but never called by the script are called once
    (only when they need no arguments), so their mistakes surface too;
  * a step budget stops infinite loops, and a statement that depends on a name
    a failed statement should have created is skipped, so one real error does
    not fan out into a pile of follow-up NameErrors.

It only reports; it never changes the complexity result.
"""
import ast
import builtins
import sys
import time

STEP_LIMIT_MESSAGE = "Execution exceeded max steps (infinite loop protection)."
_FILENAME = "<user_code>"


class _StepLimit(BaseException):
    """Raised from the trace hook; BaseException so `except Exception` can't swallow it."""


class _NeedsInput(BaseException):
    """input() was reached. We cannot answer it silently, so that unit stops quietly."""


class _Sink:
    """Swallows print() output during the silent run."""
    def write(self, _text):
        return 0

    def flush(self):
        pass


def _no_input(*_args, **_kwargs):
    raise _NeedsInput()


def _names(node, ctx):
    return {n.id for n in ast.walk(node) if isinstance(n, ast.Name) and isinstance(n.ctx, ctx)}


def _required_args(fn):
    a = fn.args
    positional = len(a.posonlyargs) + len(a.args)
    required = positional - len(a.defaults)
    required += sum(1 for d in a.kw_defaults if d is None)
    return required


def _is_generator(fn):
    return any(isinstance(n, (ast.Yield, ast.YieldFrom)) for n in ast.walk(fn))


def collect_runtime_errors(source, per_unit_steps=20000, per_unit_seconds=2.0,
                           total_seconds=8.0, max_errors=30):
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []

    env_builtins = dict(vars(builtins))
    env_builtins["input"] = _no_input
    env = {"__name__": "__main__", "__builtins__": env_builtins}

    errors = []
    called = set()
    poisoned = set()
    state = {"steps": 0, "line": 1, "deadline": 0.0}
    overall_deadline = time.perf_counter() + total_seconds

    def local_trace(frame, event, arg):
        if event == "line":
            state["steps"] += 1
            state["line"] = frame.f_lineno
            if state["steps"] > per_unit_steps or (
                    state["steps"] % 256 == 0 and time.perf_counter() > state["deadline"]):
                raise _StepLimit()
        return local_trace

    def global_trace(frame, event, arg):
        if frame.f_code.co_filename != _FILENAME:
            return None
        if event == "call":
            called.add(frame.f_code.co_name)
        return local_trace

    def last_user_line(exc, fallback):
        line = fallback
        tb = exc.__traceback__
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == _FILENAME:
                line = tb.tb_lineno
            tb = tb.tb_next
        return line

    def run_unit(thunk, fallback_line):
        """Runs one unit. Returns True when it failed (so its names become unreliable)."""
        state["steps"] = 0
        state["line"] = fallback_line
        state["deadline"] = time.perf_counter() + per_unit_seconds
        sys.settrace(global_trace)
        try:
            thunk()
            return False
        except _StepLimit:
            errors.append({"line": state["line"], "message": STEP_LIMIT_MESSAGE, "blocking": False})
            return True
        except _NeedsInput:
            return True
        except (SystemExit, KeyboardInterrupt):
            return True
        except Exception as exc:
            msg = str(exc)
            label = type(exc).__name__
            errors.append({
                "line": last_user_line(exc, fallback_line),
                "message": f"{label}: {msg}" if msg else label,
                "blocking": True,
            })
            return True
        finally:
            sys.settrace(None)

    real_sleep = time.sleep
    real_out, real_err = sys.stdout, sys.stderr
    time.sleep = lambda *a, **k: None
    sys.stdout = sys.stderr = _Sink()
    try:
        for stmt in tree.body:
            if len(errors) >= max_errors or time.perf_counter() > overall_deadline:
                break
            stores = _names(stmt, ast.Store)
            if poisoned & _names(stmt, ast.Load):
                poisoned |= stores
                continue
            try:
                code = compile(ast.Module(body=[stmt], type_ignores=[]), _FILENAME, "exec")
            except SyntaxError as exc:
                if "await" not in (exc.msg or ""):
                    errors.append({"line": exc.lineno or stmt.lineno,
                                   "message": f"SyntaxError: {exc.msg}", "blocking": True})
                poisoned |= stores
                continue
            if run_unit(lambda c=code: exec(c, env, env), stmt.lineno):
                poisoned |= stores

        # Functions the script defines but never calls: call the ones that need no arguments.
        for stmt in tree.body:
            if len(errors) >= max_errors or time.perf_counter() > overall_deadline:
                break
            if not isinstance(stmt, ast.FunctionDef) or stmt.decorator_list:
                continue
            fn = env.get(stmt.name)
            if not callable(fn) or stmt.name in called:
                continue
            if _required_args(stmt) != 0 or _is_generator(stmt):
                continue
            if poisoned & _names(stmt, ast.Load):
                continue
            run_unit(lambda f=fn: f(), stmt.lineno)
    finally:
        sys.settrace(None)
        time.sleep = real_sleep
        sys.stdout, sys.stderr = real_out, real_err

    seen = set()
    unique = []
    for e in sorted(errors, key=lambda x: x["line"]):
        key = (e["line"], e["message"])
        if key not in seen:
            seen.add(key)
            unique.append(e)
    return unique
