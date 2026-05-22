# frontend\public\python_engine\blockly_ast.py
import ast
import uuid


def gen_uid():
    return str(uuid.uuid4())[:15]


class BlocklyASTConverter:
    def __init__(self):
        self.variables = set()

    # ==========================================
    # NEW: TYPE INFERENCE & SAFETY MECHANISM
    # ==========================================
    def _infer_type(self, node):
        """Infers the Blockly output type of an AST node to prevent connection crashes."""
        if isinstance(node, ast.List): return "Array"
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
            arith_map = {ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow, ast.FloorDiv}
            if type(node.op) in arith_map: return "Number"
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id in ["len"]: return "Number"
            if node.func.id in ["abs", "round", "int", "float"]: return "Number"
            if node.func.id in ["str", "input"]: return "String"  
            if node.func.id in ["list"]: return "Array"
        return "Any"

    def serialize_expr_safe(self, node, expected_types):
        """
        Serializes an expression and ensures it won't crash Blockly.
        If the node's inferred type contradicts the parent's strictly expected input types,
        it wraps the node in a raw python expression (which has type 'Any') to force a safe connection.
        """
        if not node: return None
        actual_type = self._infer_type(node)
        
        # If type clash predicted! Wrap in raw expression to erase Blockly output type and force "Any"
        if actual_type != "Any" and actual_type not in expected_types:
            expr = self.make_raw_expr(node)
            if expr and isinstance(expr, dict):
                expr["output"] = "Any"
            return expr
            
        return self.serialize_expr(node)

    # =========================
    # ORIGINAL: BLOCK HEIGHT ESTIMATOR
    # =========================
    def estimate_block_height(self, block):
        if not block:
            return 0

        btype = block.get("type", "")

        if btype in ["procedures_defnoreturn", "procedures_defreturn"]:
            return 180
        if btype == "controls_if":
            return 160
        if btype in ["controls_for", "controls_whileUntil"]:
            return 150
        if btype in ["variables_set", "math_assignment"]:
            return 110

        return 90

    # =========================
    # ORIGINAL: CHAIN HEIGHT CALCULATOR
    # =========================
    def get_chain_height(self, block):
        if not block:
            return 0

        height = self.estimate_block_height(block)

        next_block = block.get("next", {}).get("block")
        if next_block:
            height += self.get_chain_height(next_block)

        return height

    def convert(self, code: str):
        self.variables = set()

        try:
            clean_code = (
                code.replace('\xa0', ' ')
                .replace('\u200b', '')
                .replace('\t', '    ')
            )

            tree = ast.parse(clean_code)

            top_blocks = []
            current_chain_tail = None
            y_offset = 20

            for node in tree.body:
                # FIX: Explicitly mark nodes processed at the root of the file as top level
                block = self.serialize_node(node, is_top_level=True) or self.make_raw_statement(node)
                if not block:
                    continue

                if block.get("type") in ["procedures_defnoreturn", "procedures_defreturn"]:
                    block["x"] = 20
                    block["y"] = y_offset
                    top_blocks.append(block)

                    y_offset += self.get_chain_height(block) + 40
                    current_chain_tail = None
                    continue

                if not top_blocks:
                    block["x"] = 20
                    block["y"] = y_offset
                    top_blocks.append(block)
                    current_chain_tail = block

                    y_offset += self.get_chain_height(block) + 40
                else:
                    if current_chain_tail is None:
                        block["x"] = 20
                        block["y"] = y_offset
                        top_blocks.append(block)
                        current_chain_tail = block

                        y_offset += self.get_chain_height(block) + 40
                    else:
                        current_chain_tail["next"] = {"block": block}
                        current_chain_tail = block

            vars_array = [{"id": v, "name": v} for v in self.variables]

            return {
                "status": "success",
                "blocks": {
                    "variables": vars_array,
                    "blocks": {
                        "languageVersion": 0,
                        "blocks": top_blocks
                    }
                }
            }

        except Exception:
            return self.raw_fallback(code)

    def raw_fallback(self, code):
        return {
            "status": "success",
            "blocks": {
                "blocks": {
                    "languageVersion": 0,
                    "blocks": [
                        {
                            "type": "raw_python_multiline",
                            "id": gen_uid(),
                            "x": 20,
                            "y": 20,
                            "fields": {"CODE": str(code)}
                        }
                    ]
                }
            }
        }

    def add_input(self, block_dict, input_name, child_block):
        if not child_block:
            return

        if child_block is None:
            return

        if isinstance(child_block, dict):
            child_block.setdefault("output", "Any")

        block_dict.setdefault("inputs", {})
        block_dict["inputs"][input_name] = {"block": child_block}

    def serialize_body(self, nodes):
        if not nodes:
            return None

        first = None
        prev = None

        for node in nodes:
            # Nodes evaluated within a body block are naturally NOT top level
            block = self.serialize_node(node, is_top_level=False) or self.make_raw_statement(node)
            if not block:
                continue

            if not first:
                first = block
            else:
                if prev:
                    prev["next"] = {"block": block}

            prev = block

        return first

    def make_raw_statement(self, node):
        try:
            return {
                "type": "raw_python_statement",
                "id": gen_uid(),
                "fields": {"CODE": str(ast.unparse(node))}
            }
        except Exception:
            return None

    def make_raw_expr(self, node):
        try:
            return {
                "type": "raw_python_expression",
                "id": gen_uid(),
                "fields": {"CODE": str(ast.unparse(node))}
            }
        except Exception:
            return None

    # =========================
    # EXPRESSIONS
    # =========================
    def serialize_expr(self, node):
        if node is None:
            return None

        try:

            if isinstance(node, ast.JoinedStr):
                parts = []

                for value in node.values:
                    if isinstance(value, ast.Constant):
                        parts.append({
                            "type": "text",
                            "id": gen_uid(),
                            "fields": {"TEXT": value.value}
                        })

                    elif isinstance(value, ast.FormattedValue):
                        parts.append(self.serialize_expr(value.value))

                if parts:
                    block = {
                        "type": "text_join",
                        "id": gen_uid(),
                        "extraState": {"itemCount": len(parts)}
                    }

                    for i, p in enumerate(parts):
                        self.add_input(block, f"ADD{i}", p)

                    return block

            if isinstance(node, ast.FormattedValue):
                return self.serialize_expr(node.value)

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
                    block = {
                        "type": "math_arithmetic",
                        "id": gen_uid(),
                        "fields": {"OP": "MINUS"}
                    }
                    self.add_input(block, "A", {
                        "type": "math_number",
                        "id": gen_uid(),
                        "fields": {"NUM": "0"}
                    })
                    self.add_input(block, "B", self.serialize_expr_safe(node.operand, ["Number"]))
                    return block

                if isinstance(node.op, ast.UAdd):
                    return self.serialize_expr(node.operand)

            if isinstance(node, ast.Constant):
                if isinstance(node.value, bool):
                    return {
                        "type": "logic_boolean",
                        "id": gen_uid(),
                        "fields": {"BOOL": "TRUE" if node.value else "FALSE"},
                        "output": "Boolean"
                    }

                if isinstance(node.value, (int, float)):
                    return {
                        "type": "math_number",
                        "id": gen_uid(),
                        "fields": {"NUM": str(node.value)},
                        "output": "Number"
                    }

                if isinstance(node.value, str):
                    return {
                        "type": "text",
                        "id": gen_uid(),
                        "fields": {"TEXT": node.value},
                        "output": "String"
                    }
                    
            if isinstance(node, ast.Name):
                self.variables.add(node.id)
                return {
                    "type": "variables_get",
                    "id": gen_uid(),
                    "fields": {"VAR": {"id": node.id, "name": node.id}}
                }

            if isinstance(node, ast.BinOp):

                if isinstance(node.op, ast.Mod):
                    block = {"type": "math_modulo", "id": gen_uid()}
                    self.add_input(block, "DIVIDEND", self.serialize_expr_safe(node.left, ["Number"]))
                    self.add_input(block, "DIVISOR", self.serialize_expr_safe(node.right, ["Number"]))
                    return block

                arith = {
                    ast.Add: "ADD",
                    ast.Sub: "MINUS",
                    ast.Mult: "MULTIPLY",
                    ast.Div: "DIVIDE",
                    ast.Pow: "POWER"
                }

                if type(node.op) in arith:
                    if self._infer_type(node.left) in ["Array", "String"] or self._infer_type(node.right) in ["Array", "String"]:
                        expr = self.make_raw_expr(node)
                        if expr and isinstance(expr, dict):
                            expr["output"] = "Any"
                        return expr

                    block = {
                        "type": "math_arithmetic",
                        "id": gen_uid(),
                        "fields": {"OP": arith[type(node.op)]}
                    }
                    self.add_input(block, "A", self.serialize_expr_safe(node.left, ["Number"]))
                    self.add_input(block, "B", self.serialize_expr_safe(node.right, ["Number"]))
                    return block

            if isinstance(node, ast.Compare) and len(node.ops) == 1:
                op_map = {
                    ast.Eq: "EQ",
                    ast.NotEq: "NEQ",
                    ast.Lt: "LT",
                    ast.LtE: "LTE",
                    ast.Gt: "GT",
                    ast.GtE: "GTE"
                }

                # FIX: If the operation is not handled (like 'in' / ast.In), gracefully fallback to a raw string block
                if type(node.ops[0]) not in op_map:
                    return self.make_raw_expr(node)

                block = {
                    "type": "logic_compare",
                    "id": gen_uid(),
                    "fields": {"OP": op_map[type(node.ops[0])]}
                }
                self.add_input(block, "A", self.serialize_expr(node.left))
                self.add_input(block, "B", self.serialize_expr(node.comparators[0]))
                return block

            if isinstance(node, ast.BoolOp):
                op_type = "AND" if isinstance(node.op, ast.And) else "OR"
                block = {
                    "type": "logic_operation",
                    "id": gen_uid(),
                    "fields": {"OP": op_type}
                }
                self.add_input(block, "A", self.serialize_expr_safe(node.values[0], ["Boolean"]))
                self.add_input(block, "B", self.serialize_expr_safe(node.values[1], ["Boolean"]))
                return block

            if isinstance(node, ast.List):
                block = {
                    "type": "lists_create_with",
                    "id": gen_uid(),
                    "extraState": {"itemCount": len(node.elts)},
                    "output": "Array"
                }

                for i, elt in enumerate(node.elts):
                    child = self.serialize_expr(elt)

                    if child is None:
                        child = {
                            "type": "math_number",
                            "id": gen_uid(),
                            "fields": {"NUM": "0"},
                            "output": "Number"
                        }

                    if child and child.get("type") == "math_number":
                        child = {
                            "type": "math_number",
                            "id": gen_uid(),
                            "fields": child.get("fields"),
                            "output": "Number"
                        }

                    self.add_input(block, f"ADD{i}", child)

                return block

            if isinstance(node, ast.Subscript):
                block = {
                    "type": "lists_getIndex",
                    "id": gen_uid(),
                    "fields": {"MODE": "GET", "WHERE": "FROM_START"}
                }
                self.add_input(block, "VALUE", self.serialize_expr(node.value))
                
                slice_node = node.slice
                if hasattr(ast, 'Index') and isinstance(slice_node, getattr(ast, 'Index')):
                    slice_node = slice_node.value
                    
                self.add_input(block, "AT", self.serialize_expr_safe(slice_node, ["Number"]))
                return block

            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                name = node.func.id
                
                if name == "type" and len(node.args) == 1:
                    block = {"type": "python_type", "id": gen_uid()}
                    self.add_input(block, "VALUE", self.serialize_expr(node.args[0]))
                    return block

                if name == "input" and len(node.args) <= 1:
                    block = {"type": "python_input", "id": gen_uid()}
                    if node.args:
                        self.add_input(block, "PROMPT", self.serialize_expr(node.args[0]))
                    return block

                if name == "len" and len(node.args) == 1:
                    block = {"type": "lists_length", "id": gen_uid()}
                    self.add_input(block, "VALUE", self.serialize_expr(node.args[0]))
                    return block

                if name == "int" and len(node.args) == 1:
                    block = {"type": "type_cast_int", "id": gen_uid()}
                    self.add_input(block, "VALUE", self.serialize_expr(node.args[0]))
                    return block

                if name in ["max", "min"] and len(node.args) == 2:
                    block = {
                        "type": "math_min_max",
                        "id": gen_uid(),
                        "fields": {"OP": "MAX" if name == "max" else "MIN"}
                    }
                    self.add_input(block, "A", self.serialize_expr_safe(node.args[0], ["Number"]))
                    self.add_input(block, "B", self.serialize_expr_safe(node.args[1], ["Number"]))
                    return block

                block = {
                    "type": "procedures_callreturn",
                    "id": gen_uid(),
                    "extraState": {
                        "name": name,
                        "params": [f"arg{i}" for i in range(len(node.args))]
                    }
                }

                for i, arg in enumerate(node.args):
                    self.add_input(block, f"ARG{i}", self.serialize_expr(arg))

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
    # FIX: Inject is_top_level tracker to route nested functions into safe statement blocks
    def serialize_node(self, node, is_top_level=False):
        try:
            if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
                var = node.targets[0].id
                self.variables.add(var)

                block = {
                    "type": "variables_set",
                    "id": gen_uid(),
                    "fields": {"VAR": {"id": var, "name": var}}
                }

                self.add_input(block, "VALUE", self.serialize_expr(node.value))
                return block

            elif isinstance(node, ast.AugAssign) and isinstance(node.target, ast.Name):
                op_map = {
                    ast.Add: "ADD",
                    ast.Sub: "MINUS",
                    ast.Mult: "MULTIPLY",
                    ast.Div: "DIVIDE"
                }

                if type(node.op) in op_map:
                    var = node.target.id
                    self.variables.add(var)

                    if self._infer_type(node.value) in ["Array", "String"]:
                        return self.make_raw_statement(node)

                    block = {
                        "type": "math_assignment",
                        "id": gen_uid(),
                        "fields": {
                            "VAR": {"id": var, "name": var},
                            "OP": op_map[type(node.op)]
                        }
                    }

                    self.add_input(block, "DELTA", self.serialize_expr_safe(node.value, ["Number"]))
                    return block

            elif isinstance(node, ast.FunctionDef):
                # FIX: If this is an inner/nested function, immediately return it as a raw statement
                if not is_top_level:
                    return self.make_raw_statement(node)

                has_ret = any(isinstance(n, ast.Return) for n in ast.walk(node))

                block = {
                    "type": "procedures_defreturn" if has_ret else "procedures_defnoreturn",
                    "id": gen_uid(),
                    "fields": {"NAME": node.name}
                }

                params = [{"name": a.arg, "id": a.arg} for a in node.args.args]
                for p in params:
                    self.variables.add(p["id"])

                if params:
                    block["extraState"] = {"params": params}

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

                    block = {
                        "type": "controls_for",
                        "id": gen_uid(),
                        "fields": {"VAR": {"id": node.target.id, "name": node.target.id}}
                    }

                    self.variables.add(node.target.id)

                    self.add_input(block, "FROM", self.serialize_expr_safe(start, ["Number"]))
                    self.add_input(block, "TO", self.serialize_expr_safe(end, ["Number"]))
                    self.add_input(block, "BY", self.serialize_expr_safe(step, ["Number"]))
                    self.add_input(block, "DO", self.serialize_body(node.body))

                    return block

            elif isinstance(node, ast.While):
                block = {
                    "type": "controls_whileUntil",
                    "id": gen_uid(),
                    "fields": {"MODE": "WHILE"}
                }
                self.add_input(block, "BOOL", self.serialize_expr_safe(node.test, ["Boolean"]))
                self.add_input(block, "DO", self.serialize_body(node.body))
                return block

            elif isinstance(node, ast.Return):
                block = {"type": "procedure_return_value", "id": gen_uid()}
                self.add_input(block, "VALUE", self.serialize_expr(node.value))
                return block

            elif isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
                name = node.value.func.id if isinstance(node.value.func, ast.Name) else None

                if name == "print":
                    block = {"type": "text_print", "id": gen_uid()}
                    if node.value.args:
                        self.add_input(block, "TEXT", self.serialize_expr(node.value.args[0]))
                    return block

                if name:
                    block = {
                        "type": "procedures_callnoreturn",
                        "id": gen_uid(),
                        "extraState": {
                            "name": name,
                            "params": [f"arg{i}" for i in range(len(node.value.args))]
                        }
                    }

                    for i, arg in enumerate(node.value.args):
                        self.add_input(block, f"ARG{i}", self.serialize_expr(arg))

                    return block
                
            elif isinstance(node, ast.Import):
                return {
                    "type": "raw_python_statement",
                    "id": gen_uid(),
                    "fields": {
                        "CODE": ast.unparse(node)
                    }
                }

            elif isinstance(node, ast.ImportFrom):
                return {
                    "type": "raw_python_statement",
                    "id": gen_uid(),
                    "fields": {
                        "CODE": ast.unparse(node)
                    }
                }

        except Exception:
            pass

        return None