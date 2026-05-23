# frontend/public/python_engine/dynamic_tracer.py
import sys
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
            if name.startswith('__'): continue # Skip Python magic variables
            
            var_type = type(val).__name__
            size = 1 # Default scalar size
            
            # If it's a collection, get its actual length at this exact moment
            if hasattr(val, '__len__') and not isinstance(val, (str, bytes)):
                try:
                    size = len(val)
                except:
                    pass
                    
            profile[name] = {
                "type": var_type,
                "size": size,
                "preview": str(val)[:30] + "..." if len(str(val)) > 30 else str(val)
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
        
        # Turn on the dynamic tracer
        sys.settrace(self._trace_dispatch)
        try:
            # Execute the code
            exec(code_string, safe_globals, safe_globals)
        except Exception as e:
            # Catch timeouts and errors silently to allow partial traces
            pass
        finally:
            # ALWAYS turn the tracer off immediately after
            sys.settrace(None)
            
        return {
            "history": self.history,
            "line_hits": dict(self.line_hits)
        }