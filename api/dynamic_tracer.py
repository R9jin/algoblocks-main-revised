import sys
import copy
from typing import Dict, Any, List

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
    
    def __init__(self):
        self.history: List[ExecutionSnapshot] = []

    def _trace_dispatch(self, frame, event, arg):
        # We only care about line execution events
        if event == 'line':
            # Snapshot the line number and the variables currently in memory
            snapshot = ExecutionSnapshot(frame.f_lineno, frame.f_locals)
            self.history.append(snapshot)
        return self._trace_dispatch

    def execute_and_trace(self, code_string: str, input_globals: dict = None) -> List[ExecutionSnapshot]:
        """Runs the student's code in a trace environment."""
        self.history = []
        safe_globals = input_globals if input_globals else {}
        
        # Turn on the dynamic tracer
        sys.settrace(self._trace_dispatch)
        try:
            # Execute the code
            exec(code_string, safe_globals, safe_globals)
        except Exception as e:
            print(f"Code execution halted: {e}")
        finally:
            # ALWAYS turn the tracer off immediately after
            sys.settrace(None)
            
        return self.history