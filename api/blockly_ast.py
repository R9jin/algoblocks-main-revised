# frontend/public/python_engine/blockly_ast.py
import ast
import uuid

def gen_uid():
    return str(uuid.uuid4())[:15]

class BlocklyASTConverter:
    def __init__(self):
        self.variables = set()

    # ==========================================
    # TYPE INFERENCE & SAFETY MECHANISM
    # ==========================================
    def _infer_type(self, node):
        if isinstance(node, (ast.List, ast.Tuple)): return "Array"
        if isinstance(node, ast.Dict): return "Dictionary"
        if isinstance(node, ast.Set): return "Set"
        if isinstance(node, ast.Constant):
            if isinstance(node.value, bool): return "Boolean"
            if isinstance(node.value, (int, float)): return "Number"
            if isinstance(node.value, str): return "String"
            if node.value is None: return "Any"
        if isinstance(node, ast.Compare): return "Boolean"
        if isinstance(node, ast.BoolOp): return "Boolean"
        if isinstance(node, ast.UnaryOp):
            if isinstance(node.op, ast.Not): return "Boolean"
            if isinstance(node.op, (ast.USub, ast.UAdd)): return "Number"
        if isinstance(node, ast.BinOp):
            if isinstance(node.op, ast.Mod): return "Number"
            if isinstance(node.op, ast.Add):
                left_t = self._infer_type(node.left)
                right_t = self._infer_type(node.right)
                if left_t == "Array" or right_t == "Array" or isinstance(node.left, (ast.List, ast.Tuple)): return "Array"
                if left_t == "String" or right_t == "String": return "String"
                return "Number"
            arith_map = {ast.Sub, ast.Mult, ast.Div, ast.Pow, ast.FloorDiv}
            if type(node.op) in arith_map: return "Number"
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                if node.func.id in ["len", "abs", "round", "int", "float", "sum", "min", "max"]: return "Number"
                if node.func.id in ["str", "input"]: return "String"  
                if node.func.id in ["list", "tuple", "sorted"]: return "Array"
                if node.func.id in ["dict"]: return "Dictionary"
                if node.func.id in ["bool"]: return "Boolean"
            elif isinstance(node.func, ast.Attribute):
                if node.func.attr in ["upper", "lower", "title", "capitalize", "replace"]: return "String"
                if node.func.attr in ["count", "index", "find"]: return "Number"
                if node.func.attr in ["keys", "values", "items", "split"]: return "Array"
        if isinstance(node, ast.Subscript) and isinstance(node.slice, ast.Slice): return "Array"
        return "Any"

    def serialize_expr_safe(self, node, expected_types):
        if not node: return None
        actual_type = self._infer_type(node)
        
        if actual_type != "Any" and actual_type not in expected_types:
            expr = self.make_raw_expr(node)
            if expr and isinstance(expr, dict):
                expr["output"] = "Any"
            return expr
            
        return self.serialize_expr(node)

    # =========================
    # BLOCK HEIGHT ESTIMATOR
    # =========================
    def get_chain_height(self, block):
        if not block: return 0
        btype = block.get("type", "")
        if btype in ["procedures_defnoreturn", "procedures_defreturn", "controls_if", "controls_for", "controls_whileUntil", "controls_forEach"]: 
            height = 60
        else: 
            height = 80

        inputs = block.get("inputs", {})
        for key, input_data in inputs.items():
            inner = input_data.get("block")
            if not inner: continue
            if key.startswith("DO") or key in ["STACK", "ELSE"]:
                height += self.get_chain_height(inner)
            else:
                height += self.get_value_expansion(inner)

        next_block = block.get("next", {}).get("block")
        if next_block:
            height += self.get_chain_height(next_block)
            
        return height

    def get_value_expansion(self, block):
        if not block: return 0
        expansion = 5 
        inputs = block.get("inputs", {})
        for key, input_data in inputs.items():
            inner = input_data.get("block")
            if inner:
                expansion += self.get_value_expansion(inner)
        return expansion

    def convert(self, code: str):
        self.variables = set()
        try:
            clean_code = code.replace('\xa0', ' ').replace('\u200b', '').replace('\t', '    ')
        except Exception:
            clean_code = code
            
        try:
            tree = ast.parse(clean_code)
        except SyntaxError as se:
            # FIX: Explicitly intercept Syntax Errors and refuse conversion.
            # This prevents the system from wrapping garbage text into massive Raw Python blocks.
            return {
                "status": "error",
                "message": f"SyntaxError: Invalid Python syntax on line {se.lineno}."
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}

        try:
            clusters = []
            current_chain_tail = None

            for node in tree.body:
                block = self.serialize_node(node, is_top_level=True) or self.make_raw_statement(node)
                if not block: continue

                if block.get("type") in ["procedures_defnoreturn", "procedures_defreturn"]:
                    clusters.append(block)
                    current_chain_tail = None 
                else:
                    if current_chain_tail is None:
                        clusters.append(block)
                        current_chain_tail = block
                    else:
                        current_chain_tail["next"] = {"block": block}
                        current_chain_tail = block

            y_offset = 20
            for cluster in clusters:
                cluster["x"] = 20
                cluster["y"] = y_offset
                y_offset += self.get_chain_height(cluster) + 40

            vars_array = [{"id": v, "name": v} for v in self.variables]
            return {
                "status": "success",
                "blocks": {
                    "variables": vars_array,
                    "blocks": {"languageVersion": 0, "blocks": clusters}
                }
            }
        except Exception as e:
            # Fallback for valid Python that Blockly simply doesn't have an equivalent block for
            return self.raw_fallback(code)
        
    def raw_fallback(self, code):
        return {
            "status": "success",
            "blocks": {
                "blocks": {
                    "languageVersion": 0,
                    "blocks": [{
                        "type": "raw_python_multiline",
                        "id": gen_uid(),
                        "x": 20, "y": 20,
                        "fields": {"CODE": str(code)}
                    }]
                }
            }
        }

    def add_input(self, block_dict, input_name, child_block):
        if not child_block: return
        if isinstance(child_block, dict):
            child_block.setdefault("output", "Any")
        block_dict.setdefault("inputs", {})
        block_dict["inputs"][input_name] = {"block": child_block}

    def serialize_body(self, nodes):
        if not nodes: return None
        first, prev = None, None

        for node in nodes:
            block = self.serialize_node(node, is_top_level=False) or self.make_raw_statement(node)
            if not block: continue
            if not first:
                first = block
            elif prev:
                prev["next"] = {"block": block}
            prev = block

        return first

    def make_raw_statement(self, node):
        try:
            return {"type": "raw_python_statement", "id": gen_uid(), "fields": {"CODE": str(ast.unparse(node))}}
        except Exception:
            return None

    def make_raw_expr(self, node):
        try:
            return {"type": "raw_python_expression", "id": gen_uid(), "fields": {"CODE": str(ast.unparse(node))}}
        except Exception:
            return None

    # =========================
    # EXPRESSIONS
    # =========================
    def serialize_expr(self, node):
        if node is None: return None
        try:
            if isinstance(node, ast.Call) and getattr(node.func, "id", "") == "list":
                if len(node.args) == 1 and isinstance(node.args[0], ast.Call) and getattr(node.args[0].func, "id", "") == "range":
                    range_args = node.args[0].args
                    start = ast.Constant(value=0)
                    if len(range_args) == 1:
                        end = range_args[0]
                    elif len(range_args) >= 2:
                        start = range_args[0]
                        end = range_args[1]
                    block = {"type": "list_range", "id": gen_uid()}
                    self.add_input(block, "START", self.serialize_expr_safe(start, ["Number"]))
                    self.add_input(block, "END", self.serialize_expr_safe(end, ["Number"]))
                    return block

            if isinstance(node, ast.Call) and getattr(node.func, "id", "") == "isinstance":
                if len(node.args) == 2:
                    block = {"type": "python_isinstance", "id": gen_uid()}
                    self.add_input(block, "VALUE", self.serialize_expr(node.args[0]))
                    self.add_input(block, "TYPE", self.serialize_expr(node.args[1]))
                    return block

            if isinstance(node, ast.JoinedStr):
                parts = []
                for value in node.values:
                    if isinstance(value, ast.Constant):
                        parts.append({"type": "text", "id": gen_uid(), "fields": {"TEXT": str(value.value)}})
                    elif isinstance(value, ast.FormattedValue):
                        parts.append(self.serialize_expr(value.value))
                if parts:
                    block = {"type": "text_join", "id": gen_uid(), "extraState": {"itemCount": len(parts)}}
                    for i, p in enumerate(parts): self.add_input(block, f"ADD{i}", p)
                    return block

            if isinstance(node, ast.FormattedValue): return self.serialize_expr(node.value)

            if isinstance(node, ast.IfExp):
                block = {"type": "logic_ternary", "id": gen_uid()}
                self.add_input(block, "IF", self.serialize_expr_safe(node.test, ["Boolean"]))
                self.add_input(block, "THEN", self.serialize_expr(node.body))
                self.add_input(block, "ELSE", self.serialize_expr(node.orelse))
                return block

            if isinstance(node, ast.UnaryOp):
                if isinstance(node.op, ast.Not):
                    block = {"type": "logic_negate", "id": gen_uid()}
                    self.add_input(block, "BOOL", self.serialize_expr_safe(node.operand, ["Boolean"]))
                    return block
                if isinstance(node.op, ast.USub):
                    if isinstance(node.operand, ast.Constant) and isinstance(node.operand.value, (int, float)):
                        return {"type": "math_number", "id": gen_uid(), "fields": {"NUM": str(-node.operand.value)}, "output": "Number"}
                    
                    block = {"type": "math_arithmetic", "id": gen_uid(), "fields": {"OP": "MINUS"}}
                    self.add_input(block, "A", {"type": "math_number", "id": gen_uid(), "fields": {"NUM": "0"}})
                    self.add_input(block, "B", self.serialize_expr_safe(node.operand, ["Number"]))
                    return block
                if isinstance(node.op, ast.UAdd):
                    return self.serialize_expr(node.operand)

            if isinstance(node, ast.Constant):
                if isinstance(node.value, str) and node.value == '\n':
                    return {"type": "text_newline", "id": gen_uid(), "output": "String"}
                if isinstance(node.value, bool):
                    return {"type": "logic_boolean", "id": gen_uid(), "fields": {"BOOL": "TRUE" if node.value else "FALSE"}, "output": "Boolean"}
                if isinstance(node.value, (int, float)):
                    return {"type": "math_number", "id": gen_uid(), "fields": {"NUM": str(node.value)}, "output": "Number"}
                if isinstance(node.value, str):
                    return {"type": "text", "id": gen_uid(), "fields": {"TEXT": node.value}, "output": "String"}
                if node.value is None:
                    return {"type": "logic_null", "id": gen_uid(), "output": "Any"}
                    
            if isinstance(node, ast.Name):
                if node.id in ["int", "float", "str", "list", "dict", "bool", "tuple", "set"]:
                    return {"type": "python_type_primitive", "id": gen_uid(), "fields": {"TYPE": node.id}}
                self.variables.add(node.id)
                return {"type": "variables_get", "id": gen_uid(), "fields": {"VAR": {"id": node.id, "name": node.id}}}

            if isinstance(node, ast.BinOp):
                if isinstance(node.op, ast.Add):
                    if self._infer_type(node.left) == "Array" or self._infer_type(node.right) == "Array" or isinstance(node.left, (ast.List, ast.Tuple)):
                        block = {"type": "list_concat", "id": gen_uid(), "output": "Array"}
                        self.add_input(block, "LIST1", self.serialize_expr(node.left))
                        self.add_input(block, "LIST2", self.serialize_expr(node.right))
                        return block

                if isinstance(node.op, ast.Mult):
                    if self._infer_type(node.left) == "String" or self._infer_type(node.right) == "String":
                        block = {"type": "text_multiply", "id": gen_uid()}
                        if self._infer_type(node.left) == "String":
                            self.add_input(block, "TEXT", self.serialize_expr(node.left))
                            self.add_input(block, "MULTIPLIER", self.serialize_expr(node.right))
                        else:
                            self.add_input(block, "TEXT", self.serialize_expr(node.right))
                            self.add_input(block, "MULTIPLIER", self.serialize_expr(node.left))
                        return block

                if isinstance(node.op, ast.Mod):
                    block = {"type": "math_modulo", "id": gen_uid()}
                    self.add_input(block, "DIVIDEND", self.serialize_expr_safe(node.left, ["Number"]))
                    self.add_input(block, "DIVISOR", self.serialize_expr_safe(node.right, ["Number"]))
                    return block
                arith = {ast.Add: "ADD", ast.Sub: "MINUS", ast.Mult: "MULTIPLY", ast.Div: "DIVIDE", ast.Pow: "POWER", ast.FloorDiv: "DIVIDE"}
                if type(node.op) in arith:
                    block = {"type": "math_arithmetic", "id": gen_uid(), "fields": {"OP": arith[type(node.op)]}}
                    self.add_input(block, "A", self.serialize_expr_safe(node.left, ["Number"]))
                    self.add_input(block, "B", self.serialize_expr_safe(node.right, ["Number"]))
                    return block

            if isinstance(node, ast.Compare):
                if len(node.ops) == 1:
                    if isinstance(node.ops[0], ast.In):
                        block = {"type": "logic_in", "id": gen_uid()}
                        self.add_input(block, "ITEM", self.serialize_expr(node.left))
                        self.add_input(block, "COLLECTION", self.serialize_expr(node.comparators[0]))
                        return block
                    elif isinstance(node.ops[0], ast.NotIn):
                        inner_block = {"type": "logic_in", "id": gen_uid()}
                        self.add_input(inner_block, "ITEM", self.serialize_expr(node.left))
                        self.add_input(inner_block, "COLLECTION", self.serialize_expr(node.comparators[0]))
                        block = {"type": "logic_negate", "id": gen_uid()}
                        self.add_input(block, "BOOL", inner_block)
                        return block

                op_map = {
                    ast.Eq: "EQ", ast.NotEq: "NEQ", ast.Lt: "LT", ast.LtE: "LTE",
                    ast.Gt: "GT", ast.GtE: "GTE", ast.Is: "IS", ast.IsNot: "ISNOT"
                }
                
                def build_compare(left, op, right):
                    if type(op) not in op_map: return self.make_raw_expr(node)
                    b = {"type": "logic_compare", "id": gen_uid(), "fields": {"OP": op_map[type(op)]}}
                    self.add_input(b, "A", self.serialize_expr(left))
                    self.add_input(b, "B", self.serialize_expr(right))
                    return b

                if len(node.ops) == 1:
                    return build_compare(node.left, node.ops[0], node.comparators[0])
                else:
                    current_left = node.left
                    comparisons = []
                    for op, right in zip(node.ops, node.comparators):
                        comparisons.append(build_compare(current_left, op, right))
                        current_left = right
                    
                    result_block = comparisons[0]
                    for comp in comparisons[1:]:
                        b = {"type": "logic_operation", "id": gen_uid(), "fields": {"OP": "AND"}}
                        self.add_input(b, "A", result_block)
                        self.add_input(b, "B", comp)
                        result_block = b
                    return result_block

            if isinstance(node, ast.BoolOp):
                op_type = "AND" if isinstance(node.op, ast.And) else "OR"
                def chain_bools(values):
                    if len(values) == 1: return self.serialize_expr_safe(values[0], ["Boolean"])
                    block = {"type": "logic_operation", "id": gen_uid(), "fields": {"OP": op_type}}
                    self.add_input(block, "A", self.serialize_expr_safe(values[0], ["Boolean"]))
                    self.add_input(block, "B", chain_bools(values[1:]))
                    return block
                return chain_bools(node.values)

            if isinstance(node, (ast.List, ast.Tuple)):
                block = {"type": "lists_create_with", "id": gen_uid(), "extraState": {"itemCount": len(node.elts)}, "output": "Array"}
                for i, elt in enumerate(node.elts):
                    child = self.serialize_expr(elt)
                    if child is None:
                        child = {"type": "math_number", "id": gen_uid(), "fields": {"NUM": "0"}, "output": "Number"}
                    if child and child.get("type") == "math_number":
                        child = {"type": "math_number", "id": gen_uid(), "fields": child.get("fields"), "output": "Number"}
                    self.add_input(block, f"ADD{i}", child)
                return block

            if isinstance(node, ast.Dict):
                expr = self.make_raw_expr(node)
                if expr and isinstance(expr, dict):
                    expr["output"] = "Dictionary"
                return expr

            if isinstance(node, ast.Subscript):
                if isinstance(node.slice, ast.Slice):
                    block = {"type": "list_slice_advanced", "id": gen_uid()}
                    self.add_input(block, "LIST", self.serialize_expr(node.value))
                    if node.slice.lower:
                        self.add_input(block, "START", self.serialize_expr(node.slice.lower))
                    if node.slice.upper:
                        self.add_input(block, "END", self.serialize_expr(node.slice.upper))
                    return block
                
                block = {"type": "lists_getIndex", "id": gen_uid(), "fields": {"MODE": "GET", "WHERE": "FROM_START"}}
                self.add_input(block, "VALUE", self.serialize_expr(node.value))
                slice_node = node.slice
                if hasattr(ast, 'Index') and isinstance(slice_node, getattr(ast, 'Index')):
                    slice_node = slice_node.value
                self.add_input(block, "AT", self.serialize_expr_safe(slice_node, ["Number"]))
                return block

            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name):
                    name = node.func.id
                    if name == "type" and len(node.args) == 1:
                        block = {"type": "python_type", "id": gen_uid()}
                        self.add_input(block, "VALUE", self.serialize_expr(node.args[0]))
                        return block
                    if name == "input" and len(node.args) <= 1:
                        block = {"type": "python_input", "id": gen_uid()}
                        if node.args: self.add_input(block, "PROMPT", self.serialize_expr(node.args[0]))
                        return block
                    if name == "len" and len(node.args) == 1:
                        block = {"type": "lists_length", "id": gen_uid()}
                        self.add_input(block, "VALUE", self.serialize_expr(node.args[0]))
                        return block
                    
                    if name == "int" and len(node.args) == 1:
                        block = {"type": "type_cast_int", "id": gen_uid()}
                        self.add_input(block, "VALUE", self.serialize_expr(node.args[0]))
                        return block
                    if name in ["float", "bool", "str", "list"] and len(node.args) == 1:
                        block = {"type": "type_cast_advanced", "id": gen_uid(), "fields": {"TYPE": name}}
                        self.add_input(block, "VALUE", self.serialize_expr(node.args[0]))
                        return block
                    if name in ["abs", "round"] and len(node.args) == 1:
                        block = {"type": "math_abs_round", "id": gen_uid(), "fields": {"OP": name}}
                        self.add_input(block, "VALUE", self.serialize_expr_safe(node.args[0], ["Number"]))
                        return block
                    if name == "sorted" and len(node.args) == 1:
                        reverse_val = "FALSE"
                        for kw in node.keywords:
                            if kw.arg == "reverse" and getattr(kw.value, 'value', False):
                                reverse_val = "TRUE"
                        block = {"type": "list_sorted", "id": gen_uid(), "fields": {"REVERSE": reverse_val}}
                        self.add_input(block, "LIST", self.serialize_expr(node.args[0]))
                        return block

                    if name in ["max", "min"] and len(node.args) == 2:
                        block = {"type": "math_min_max", "id": gen_uid(), "fields": {"OP": "MAX" if name == "max" else "MIN"}}
                        self.add_input(block, "A", self.serialize_expr_safe(node.args[0], ["Number"]))
                        self.add_input(block, "B", self.serialize_expr_safe(node.args[1], ["Number"]))
                        return block

                    block = {"type": "procedures_callreturn", "id": gen_uid(), "extraState": {"name": name, "params": [f"arg{i}" for i in range(len(node.args))]}}
                    for i, arg in enumerate(node.args):
                        self.add_input(block, f"ARG{i}", self.serialize_expr(arg))
                    return block

                elif isinstance(node.func, ast.Attribute):
                    method = node.func.attr
                    obj = node.func.value
                    
                    if method in ["upper", "lower", "title", "capitalize"] and len(node.args) == 0:
                        block = {"type": "string_case_formatting", "id": gen_uid(), "fields": {"CASE": method}}
                        self.add_input(block, "STRING", self.serialize_expr(obj))
                        return block

                    if method == "split":
                        block = {"type": "string_split", "id": gen_uid()}
                        self.add_input(block, "STRING", self.serialize_expr(obj))
                        if len(node.args) == 1:
                            self.add_input(block, "DELIMITER", self.serialize_expr(node.args[0]))
                        else:
                            self.add_input(block, "DELIMITER", {"type": "text", "id": gen_uid(), "fields": {"TEXT": " "}})
                        return block

                    if method in ["keys", "values", "items"] and len(node.args) == 0:
                        block = {"type": "dict_keys_values", "id": gen_uid(), "fields": {"OP": method}}
                        self.add_input(block, "DICT", self.serialize_expr(obj))
                        return block
                        
                    if method == "count" and len(node.args) == 1:
                        block = {"type": "list_count", "id": gen_uid()}
                        self.add_input(block, "LIST", self.serialize_expr(obj))
                        self.add_input(block, "ITEM", self.serialize_expr(node.args[0]))
                        return block

                    if method in ["union", "intersection", "difference"] and len(node.args) == 1:
                        block = {"type": "set_operations", "id": gen_uid(), "fields": {"OP": method.upper()}}
                        self.add_input(block, "SET1", self.serialize_expr(obj))
                        self.add_input(block, "SET2", self.serialize_expr(node.args[0]))
                        return block

                    if method == "pop":
                        if len(node.args) == 0:
                            block = {"type": "list_pop", "id": gen_uid()}
                            self.add_input(block, "LIST", self.serialize_expr(obj))
                            return block
                        elif len(node.args) == 1:
                            arg = node.args[0]
                            if isinstance(arg, ast.Constant) and arg.value == 0:
                                block = {"type": "queue_dequeue", "id": gen_uid()}
                                self.add_input(block, "QUEUE", self.serialize_expr(obj))
                                return block
                            else:
                                block = {"type": "dict_pop", "id": gen_uid()}
                                self.add_input(block, "KEY", self.serialize_expr(arg))
                                self.add_input(block, "DICT", self.serialize_expr(obj))
                                return block

        except Exception:
            pass
        
        expr = self.make_raw_expr(node)
        if expr and isinstance(expr, dict):
            expr["output"] = "Any" 
        return expr

    # =========================
    # STATEMENTS
    # =========================
    def serialize_node(self, node, is_top_level=False):
        try:
            if isinstance(node, ast.Pass):
                return {"type": "controls_pass", "id": gen_uid()}
            if isinstance(node, ast.Break):
                return {"type": "controls_flow_statements", "id": gen_uid(), "fields": {"FLOW": "BREAK"}}
            if isinstance(node, ast.Continue):
                return {"type": "controls_flow_statements", "id": gen_uid(), "fields": {"FLOW": "CONTINUE"}}

            if isinstance(node, ast.Assign):
                if len(node.targets) == 1 and isinstance(node.targets[0], ast.Tuple) and isinstance(node.value, ast.Tuple):
                    target = node.targets[0]
                    if len(target.elts) == 2 and len(node.value.elts) == 2:
                        if isinstance(target.elts[0], ast.Name) and isinstance(target.elts[1], ast.Name) and \
                           isinstance(node.value.elts[0], ast.Name) and isinstance(node.value.elts[1], ast.Name):
                            if target.elts[0].id == node.value.elts[1].id and target.elts[1].id == node.value.elts[0].id:
                                var1, var2 = target.elts[0].id, target.elts[1].id
                                self.variables.add(var1)
                                self.variables.add(var2)
                                return {
                                    "type": "variable_swap",
                                    "id": gen_uid(),
                                    "fields": {
                                        "VAR1": {"id": var1, "name": var1},
                                        "VAR2": {"id": var2, "name": var2}
                                    }
                                }
                
                target = node.targets[0]
                
                if isinstance(target, ast.Name):
                    var = target.id
                    self.variables.add(var)
                    block = {"type": "variables_set", "id": gen_uid(), "fields": {"VAR": {"id": var, "name": var}}}
                    self.add_input(block, "VALUE", self.serialize_expr(node.value))
                    return block
                
                elif isinstance(target, ast.Subscript):
                    block = {
                        "type": "lists_setIndex", 
                        "id": gen_uid(), 
                        "fields": {"MODE": "SET", "WHERE": "FROM_START"}
                    }
                    
                    self.add_input(block, "LIST", self.serialize_expr(target.value))
                    
                    slice_node = target.slice
                    if hasattr(ast, 'Index') and isinstance(slice_node, getattr(ast, 'Index')):
                        slice_node = slice_node.value
                        
                    self.add_input(block, "AT", self.serialize_expr_safe(slice_node, ["Number"]))
                    self.add_input(block, "TO", self.serialize_expr(node.value))
                    return block

                else:
                    return self.make_raw_statement(node)

            elif isinstance(node, ast.AugAssign):
                op_map = {ast.Add: "ADD", ast.Sub: "MINUS", ast.Mult: "MULTIPLY", ast.Div: "DIVIDE"}
                if type(node.op) in op_map:
                    if isinstance(node.target, ast.Name):
                        var = node.target.id
                        self.variables.add(var)
                        if self._infer_type(node.value) in ["Array", "String"]:
                            return self.make_raw_statement(node)
                        block = {"type": "math_assignment", "id": gen_uid(), "fields": {"VAR": {"id": var, "name": var}, "OP": op_map[type(node.op)]}}
                        self.add_input(block, "DELTA", self.serialize_expr_safe(node.value, ["Number"]))
                        return block
                        
                    elif isinstance(node.target, ast.Subscript):
                        block = {
                            "type": "lists_setIndex", 
                            "id": gen_uid(), 
                            "fields": {"MODE": "SET", "WHERE": "FROM_START"}
                        }
                        
                        self.add_input(block, "LIST", self.serialize_expr(node.target.value))
                        
                        slice_node = node.target.slice
                        if hasattr(ast, 'Index') and isinstance(slice_node, getattr(ast, 'Index')):
                            slice_node = slice_node.value
                        self.add_input(block, "AT", self.serialize_expr_safe(slice_node, ["Number"]))
                        
                        math_block = {"type": "math_arithmetic", "id": gen_uid(), "fields": {"OP": op_map[type(node.op)]}}
                        get_block = {"type": "lists_getIndex", "id": gen_uid(), "fields": {"MODE": "GET", "WHERE": "FROM_START"}}
                        self.add_input(get_block, "VALUE", self.serialize_expr(node.target.value))
                        self.add_input(get_block, "AT", self.serialize_expr_safe(slice_node, ["Number"]))
                        
                        self.add_input(math_block, "A", get_block)
                        self.add_input(math_block, "B", self.serialize_expr_safe(node.value, ["Number"]))
                        
                        self.add_input(block, "TO", math_block)
                        return block

            elif isinstance(node, ast.FunctionDef):
                if not is_top_level: return self.make_raw_statement(node)
                has_ret = any(isinstance(n, ast.Return) for n in ast.walk(node))
                block = {"type": "procedures_defreturn" if has_ret else "procedures_defnoreturn", "id": gen_uid(), "fields": {"NAME": node.name}}
                params = [{"name": a.arg, "id": a.arg} for a in node.args.args]
                for p in params: self.variables.add(p["id"])
                if params: block["extraState"] = {"params": params}
                self.add_input(block, "STACK", self.serialize_body(node.body))
                return block

            elif isinstance(node, ast.If):
                block = {"type": "controls_if", "id": gen_uid()}
                self.add_input(block, "IF0", self.serialize_expr_safe(node.test, ["Boolean"]))
                self.add_input(block, "DO0", self.serialize_body(node.body))

                if node.orelse:
                    block["extraState"] = {"hasElse": True}
                    self.add_input(block, "ELSE", self.serialize_body(node.orelse))
                return block

            elif isinstance(node, ast.For):
                if isinstance(node.iter, ast.Call) and getattr(node.iter.func, "id", "") == "range":
                    args = node.iter.args
                    if len(args) == 1:
                        start, end, step = ast.Constant(value=0), args[0], ast.Constant(value=1)
                    elif len(args) == 2:
                        start, end, step = args[0], args[1], ast.Constant(value=1)
                    else:
                        start, end, step = args[0], args[1], args[2]

                    block = {"type": "controls_for", "id": gen_uid(), "fields": {"VAR": {"id": node.target.id, "name": node.target.id}}}
                    self.variables.add(node.target.id)
                    self.add_input(block, "FROM", self.serialize_expr_safe(start, ["Number"]))
                    self.add_input(block, "TO", self.serialize_expr_safe(end, ["Number"]))
                    self.add_input(block, "BY", self.serialize_expr_safe(step, ["Number"]))
                    self.add_input(block, "DO", self.serialize_body(node.body))
                    return block
                else:
                    block = {"type": "controls_forEach", "id": gen_uid(), "fields": {"VAR": {"id": node.target.id, "name": node.target.id}}}
                    self.variables.add(node.target.id)
                    self.add_input(block, "LIST", self.serialize_expr(node.iter))
                    self.add_input(block, "DO", self.serialize_body(node.body))
                    return block

            elif isinstance(node, ast.While):
                block = {"type": "controls_whileUntil", "id": gen_uid(), "fields": {"MODE": "WHILE"}}
                self.add_input(block, "BOOL", self.serialize_expr_safe(node.test, ["Boolean"]))
                self.add_input(block, "DO", self.serialize_body(node.body))
                return block

            elif isinstance(node, ast.Return):
                block = {"type": "procedure_return_value", "id": gen_uid()}
                if node.value:
                    self.add_input(block, "VALUE", self.serialize_expr(node.value))
                return block

            elif isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
                if isinstance(node.value.func, ast.Name):
                    name = node.value.func.id
                    if name == "print":
                        block = {"type": "text_print", "id": gen_uid()}
                        if node.value.args:
                            self.add_input(block, "TEXT", self.serialize_expr(node.value.args[0]))
                        return block

                    block = {"type": "procedures_callnoreturn", "id": gen_uid(), "extraState": {"name": name, "params": [f"arg{i}" for i in range(len(node.value.args))]}}
                    for i, arg in enumerate(node.value.args):
                        self.add_input(block, f"ARG{i}", self.serialize_expr(arg))
                    return block
                
                elif isinstance(node.value.func, ast.Attribute):
                    method = node.value.func.attr
                    obj = node.value.func.value
                    
                    if method == "sort" and len(node.value.args) == 0:
                        reverse_val = "FALSE"
                        for kw in node.value.keywords:
                            if kw.arg == "reverse" and getattr(kw.value, 'value', False):
                                reverse_val = "TRUE"
                        block = {"type": "list_sort", "id": gen_uid(), "fields": {"REVERSE": reverse_val}}
                        self.add_input(block, "LIST", self.serialize_expr(obj))
                        return block
                        
                    if method == "insert" and len(node.value.args) == 2:
                        block = {"type": "list_insert", "id": gen_uid()}
                        self.add_input(block, "LIST", self.serialize_expr(obj))
                        self.add_input(block, "INDEX", self.serialize_expr(node.value.args[0]))
                        self.add_input(block, "ITEM", self.serialize_expr(node.value.args[1]))
                        return block

                    if method == "append" and len(node.value.args) == 1:
                        block = {"type": "list_append", "id": gen_uid()}
                        self.add_input(block, "LIST", self.serialize_expr(obj))
                        self.add_input(block, "ITEM", self.serialize_expr(node.value.args[0]))
                        return block
                        
                    if method == "remove" and len(node.value.args) == 1:
                        block = {"type": "list_remove_value", "id": gen_uid()}
                        self.add_input(block, "LIST", self.serialize_expr(obj))
                        self.add_input(block, "ITEM", self.serialize_expr(node.value.args[0]))
                        return block
                        
                    if method == "reverse" and len(node.value.args) == 0:
                        block = {"type": "list_reverse", "id": gen_uid()}
                        self.add_input(block, "LIST", self.serialize_expr(obj))
                        return block
                        
                    if method == "clear" and len(node.value.args) == 0:
                        block = {"type": "list_clear", "id": gen_uid()}
                        self.add_input(block, "LIST", self.serialize_expr(obj))
                        return block
                        
                    if method == "pop":
                        if len(node.value.args) == 0:
                            block = {"type": "list_pop_statement", "id": gen_uid()}
                            self.add_input(block, "LIST", self.serialize_expr(obj))
                            return block
                        elif len(node.value.args) == 1:
                            arg = node.value.args[0]
                            if isinstance(arg, ast.Constant) and arg.value == 0:
                                block = {"type": "queue_dequeue_statement", "id": gen_uid()}
                                self.add_input(block, "QUEUE", self.serialize_expr(obj))
                                return block

            elif isinstance(node, (ast.Import, ast.ImportFrom)):
                return {"type": "raw_python_statement", "id": gen_uid(), "fields": {"CODE": ast.unparse(node)}}

        except Exception:
            pass

        return None