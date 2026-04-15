importScripts("https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js");

let pyodideReadyPromise = async function () {
    let pyodide = await loadPyodide();
    
    // Fetch your custom python scripts from the public folder
    const analyzerCode = await (await fetch('/python_engine/analyzer.py')).text();
    const blocklyAstCode = await (await fetch('/python_engine/blockly_ast.py')).text();
    
    // Load them into Pyodide's virtual file system
    pyodide.FS.writeFile('/analyzer.py', analyzerCode);
    pyodide.FS.writeFile('/blockly_ast.py', blocklyAstCode);

    return pyodide;
}();

self.onmessage = async (event) => {
    const { type, code } = event.data;
    const pyodide = await pyodideReadyPromise;

    try {
        if (type === 'ANALYZE_CODE') {
            // Run your complexity analyzer
            await pyodide.runPythonAsync(`
                import ast
                import json
                from analyzer import ComplexityAnalyzer
                
                def analyze(source_code):
                    try:
                        tree = ast.parse(source_code)
                        analyzer = ComplexityAnalyzer(source_code)
                        analyzer.bfs_first_pass(tree)
                        for _, node in analyzer.symbol_table.items():
                            analyzer.visit(node)
                        
                        analyzer.details = []
                        analyzer.max_complexity = analyzer.max_space_weight = 0
                        analyzer.max_poly = analyzer.max_log = analyzer.max_sqrt = 0
                        analyzer.current_depth = analyzer.loop_depth = 0
                        analyzer.log_loop_depth = analyzer.sqrt_loop_depth = 0
                        
                        analyzer.visit(tree)
                        
                        # Format output
                        lines = []
                        for line in analyzer.details:
                            lines.append({
                                "lineOfCode": line["lineOfCode"],
                                "local_time": line.get("local_time"),
                                "global_time": line.get("global_time"),
                                "local_space": line.get("local_space"),
                                "global_space": line.get("global_space"),
                                "weight": line.get("weight", 0),
                                "local_explanation": line.get("local_explanation", ""),
                                "color": line.get("color")
                            })
                            
                        return json.dumps({
                            "status": "success",
                            "total": analyzer.get_final_asymptotic_badge(),
                            "lines": lines
                        })
                    except Exception as e:
                        return json.dumps({"status": "error", "message": str(e)})
            `);
            
            const analyzeFunc = pyodide.globals.get('analyze');
            const resultStr = analyzeFunc(code);
            self.postMessage({ type: 'ANALYZE_RESULT', data: JSON.parse(resultStr) });
        } 
        
        else if (type === 'RUN_CODE') {
            // Capture standard output
            await pyodide.runPythonAsync(`
                import sys
                import io
                sys.stdout = io.StringIO()
            `);
            
            await pyodide.runPythonAsync(code);
            
            const stdout = await pyodide.runPythonAsync("sys.stdout.getvalue()");
            self.postMessage({ type: 'RUN_RESULT', data: stdout });
        }

    } catch (error) {
        self.postMessage({ type: 'ERROR', data: error.message });
    }
};