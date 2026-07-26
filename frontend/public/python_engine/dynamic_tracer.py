# frontend/public/python_engine/dynamic_tracer.py
import sys
import types
from typing import Dict, Any, List
from collections import Counter

class ExecutionSnapshot:
    """Holds the state of memory at a specific line of code during execution."""
    def __init__(self, line_no: int, local_vars: Dict[str, Any]):
        self.line_no = line_no
        self.variables = self._profile_variables(local_vars)

    def _profile_variables(self, local_vars: Dict[str, Any]) -> Dict[str, Dict]:
        """Extracts the type and size of variables without copying massive data."""
        profile = {}
        for name, val in local_vars.items():
            # Skip Python magic variables
            if name.startswith('__'): 
                continue 
            
            # Optimization 1: Skip modules, functions, and classes to save processing time
            if isinstance(val, (types.ModuleType, types.FunctionType, types.BuiltinFunctionType, type)):
                continue
            
            var_type = type(val).__name__
            size = 1 # Default scalar size
            is_collection = False
            
            # Fast check for collections
            if hasattr(val, '__len__') and not isinstance(val, (str, bytes)):
                try:
                    size = len(val)
                    is_collection = True
                except Exception:
                    pass
            
            # Optimization 2: Prevent massive string operations on large arrays/matrices
            if is_collection and size > 30:
                preview = f"<{var_type} (size: {size})>"
            else:
                try:
                    # Optimization 3: Only evaluate the string ONCE using repr() 
                    # repr() is safer than str() for arbitrary unknown objects
                    val_str = repr(val)
                    preview = val_str[:30] + "..." if len(val_str) > 30 else val_str
                except Exception:
                    # Fallback if an object has a broken __repr__ method
                    preview = f"<{var_type}>"
                    
            profile[name] = {
                "type": var_type,
                "size": size,
                "preview": preview
            }
        return profile


class AlgoBlocksTracer:
    """Executes code and captures line-by-line runtime telemetry."""
    
    def __init__(self, max_steps=15000):
        self.history: List[ExecutionSnapshot] = []
        self.line_hits = Counter()
        self.max_steps = max_steps
        self.step_count = 0

    def _trace_dispatch(self, frame, event, arg):
        # We only care about line execution events
        if event == 'line':
            self.step_count += 1
            if self.step_count > self.max_steps:
                raise TimeoutError("Execution exceeded max steps (infinite loop protection).")
                
            lineno = frame.f_lineno
            self.line_hits[lineno] += 1
            
            # Snapshot the line number and the variables currently in memory
            snapshot = ExecutionSnapshot(lineno, frame.f_locals)
            self.history.append(snapshot)
        return self._trace_dispatch

    def execute_and_trace(self, code_string: str, input_globals: dict = None) -> Dict[str, Any]:
        """Runs the student's code in a trace environment and aggregates data."""
        self.history = []
        self.line_hits = Counter()
        self.step_count = 0
        safe_globals = input_globals if input_globals else {}
        runtime_warning = None
        runtime_warning_line = None

        # Turn on the dynamic tracer
        sys.settrace(self._trace_dispatch)
        try:
            # Execute the code
            exec(code_string, safe_globals, safe_globals)
        except TimeoutError as e:
            # The step-count guard in _trace_dispatch tripped - this is the
            # infinite loop protection. Surface it instead of discarding it,
            # so the user actually sees an "infinite loop" diagnosis instead
            # of the analysis silently coming back empty.
            runtime_warning = str(e)
            if self.history:
                runtime_warning_line = self.history[-1].line_no
        except Exception:
            # Other runtime errors (ZeroDivisionError, etc.) are surfaced
            # elsewhere via the static/AST error path, so a partial trace is
            # fine here - only the timeout case needs explicit reporting.
            pass
        finally:
            # ALWAYS turn the tracer off immediately after
            sys.settrace(None)

        return {
            "history": self.history,
            "line_hits": dict(self.line_hits),
            "runtime_warning": runtime_warning,
            "runtime_warning_line": runtime_warning_line
        }