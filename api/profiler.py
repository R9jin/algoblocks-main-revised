# public/python_engine/profiler.py
import sys
import traceback
from collections import defaultdict

class LineExecutionProfiler:
    def __init__(self):
        self.hits = defaultdict(int)

    def trace_lines(self, frame, event, arg):
        if event == 'line':
            filename = frame.f_code.co_filename
            if filename == "<string>":
                self.hits[frame.f_lineno] += 1
        return self.trace_lines

    def run_code(self, source_code):
        self.hits.clear()
        try:
            compiled_code = compile(source_code, '<string>', 'exec')
            sys.settrace(self.trace_lines)
            
            # Prevent input() from hanging the analyzer worker
            def dummy_input(*args, **kwargs):
                return "1"
                
            isolated_globals = {"input": dummy_input}
            exec(compiled_code, isolated_globals)
            
        except Exception as e:
            pass # Fails gracefully, returning whatever hits we tracked so far
        finally:
            sys.settrace(None)
            
        return dict(self.hits)