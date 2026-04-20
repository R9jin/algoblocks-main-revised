# public/python_engine/profiler.py (or inject directly via Pyodide)
import sys
import traceback
from collections import defaultdict

class LineExecutionProfiler:
    def __init__(self):
        # Maps line number (int) -> hit count (int)
        self.hits = defaultdict(int)

    def trace_lines(self, frame, event, arg):
        # We only care about line execution events
        if event == 'line':
            # Ensure we are only tracking the user's code, which gets compiled as '<string>'
            filename = frame.f_code.co_filename
            if filename == "<string>":
                self.hits[frame.f_lineno] += 1
        return self.trace_lines

    def run_code(self, source_code):
        self.hits.clear()
        
        try:
            # Compile the code so it registers as '<string>' for our tracer
            compiled_code = compile(source_code, '<string>', 'exec')
            
            # Start the tracer
            sys.settrace(self.trace_lines)
            
            # Execute the code in a clean, isolated namespace
            isolated_globals = {}
            exec(compiled_code, isolated_globals)
            
        except Exception as e:
            # If the user's code has an error, we still want to return the hits up to that point
            print(f"Execution stopped due to: {e}")
        finally:
            # ALWAYS turn off the tracer, even if the code crashes
            sys.settrace(None)
            
        return dict(self.hits)