import { registerFieldMultilineInput } from "@blockly/field-multilineinput";
import { CrossTabCopyPaste } from "@blockly/plugin-cross-tab-copy-paste";
import { Modal } from "@blockly/plugin-modal";
import { WorkspaceSearch } from "@blockly/plugin-workspace-search";
import { shadowBlockConversionChangeListener } from "@blockly/shadow-block-converter";
import "@blockly/toolbox-search";
import { Backpack } from "@blockly/workspace-backpack";
import { ContentHighlight } from "@blockly/workspace-content-highlight";
import { PositionedMinimap } from "@blockly/workspace-minimap";
import * as Blockly from "blockly";
import "blockly/blocks";
import * as En from "blockly/msg/en";
import { pythonGenerator } from "blockly/python";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { convertPythonToBlocks } from "../workers/analyzerInstance";

registerFieldMultilineInput();
Blockly.setLocale(En);

let crossTabPluginInitialized = false;
const DarkTheme = Blockly.Themes.Dark;
const ModernTheme = Blockly.Themes.Modern;

const pastelTheme = Blockly.Theme.defineTheme("pastelTheme", {
  base: ModernTheme,
  categoryStyles: {
    logic_category: { colour: "#c1a0e8" }, loop_category: { colour: "#8bcf8b" }, math_category: { colour: "#4C97FF" },
    text_category: { colour: "#d5a52a" }, io_category: { colour: "#FF8A65" }, list_category: { colour: "#4DB6AC" },
    dict_category: { colour: "#BA68C8" }, set_tuple_category: { colour: "#7986CB" }, stack_queue_category: { colour: "#F06292" },
    variable_category: { colour: "#f38286" }, procedure_category: { colour: "#7a6b66" }, raw_category: { colour: "#FF6B6B" }
  },
  blockStyles: {
    logic_blocks: { colourPrimary: "#c1a0e8", colourSecondary: "#B8A0D6", colourTertiary: "#A38CC1" },
    loop_blocks: { colourPrimary: "#8bcf8b", colourSecondary: "#90BC90", colourTertiary: "#7CA77C" },
    math_blocks: { colourPrimary: "#4C97FF", colourSecondary: "#2c80f5", colourTertiary: "#2A70CC" },
    text_blocks: { colourPrimary: "#d5a52a", colourSecondary: "#E5AF2C", colourTertiary: "#CC9A26" },
    io_blocks: { colourPrimary: "#FF8A65", colourSecondary: "#E27A59", colourTertiary: "#C76B4E" },
    list_blocks: { colourPrimary: "#4DB6AC", colourSecondary: "#42A097", colourTertiary: "#388C83" },
    dict_blocks: { colourPrimary: "#BA68C8", colourSecondary: "#A65CB4", colourTertiary: "#9251A0" },
    set_tuple_blocks: { colourPrimary: "#7986CB", colourSecondary: "#6B77B5", colourTertiary: "#5E68A0" },
    stack_queue_blocks: { colourPrimary: "#F06292", colourSecondary: "#D75883", colourTertiary: "#BD4D73" },
    variable_blocks: { colourPrimary: "#f38286", colourSecondary: "#DB888B", colourTertiary: "#C27679" },
    procedure_blocks: { colourPrimary: "#7a6b66", colourSecondary: "#BDB2AE", colourTertiary: "#A89D9A" },
    raw_blocks: { colourPrimary: "#FF6B6B", colourSecondary: "#FF8787", colourTertiary: "#FFA8A8" }
  },
  fontStyle: { family: "'Outfit', 'Inter', sans-serif", weight: "500", size: 13 }
});

const sanitizePythonCode = (code) => {
  if (!code) return "";
  return code.replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000]/g, " ");
};

const customBlocks = [
  { type: "comment_block", message0: "Comment %1", colour: "#999999", tooltip: "Adds a comment to the Python code",
    args0: [{ type: "field_input", name: "TEXT", text: "write note here" }], previousStatement: null, nextStatement: null },
  { type: "math_assignment", message0: "%1 %2 %3", colour: "#4C97FF", tooltip: "Modify a variable using Add, Subtract, Multiply, or Divide",
    args0: [{ type: "field_variable", name: "VAR", variable: "item" }, { type: "field_dropdown", name: "OP", options: [["+=", "ADD"], ["-=", "MINUS"], ["*=", "MULTIPLY"], ["/=", "DIVIDE"]] }, { type: "input_value", name: "DELTA", check: "Number" }], inputsInline: true, previousStatement: null, nextStatement: null },
  { type: "procedure_return_value", message0: "return %1", colour: "#7a6b66", tooltip: "Returns the value from this function",
    args0: [{ type: "input_value", name: "VALUE" }], previousStatement: null, nextStatement: null },
  { type: "custom_string_join", message0: "join list %1 with delimiter %2", colour: "#d5a52a", tooltip: "Joins a list of strings into one string using a specified delimiter",
    args0: [{ type: "input_value", name: "LIST", check: "Array" }, { type: "input_value", name: "DELIMITER", check: "String" }], output: "String" },
  { type: "string_to_list", message0: "create list from string %1", style: "list_blocks", tooltip: "Converts a string into a list of its characters",
    args0: [{ type: "input_value", name: "STRING", check: "String" }], output: "Array" },
  { type: "math_advanced_operators", message0: "%1 %2 %3", colour: "#4C97FF", tooltip: "Performs advanced math operations such as Floor Division, Power, Bitwise Shifts, and Bitwise Logic",
    args0: [{ type: "input_value", name: "A", check: "Number" }, { type: "field_dropdown", name: "OP", options: [["//", "FLOOR_DIV"], ["**", "POWER"], [">>", "RSHIFT"], ["<<", "LSHIFT"], ["&", "BIT_AND"], ["|", "BIT_OR"]] }, { type: "input_value", name: "B", check: "Number" }], inputsInline: true, output: "Number" },
  { type: "type_cast_int", message0: "int %1", colour: "#4C97FF", tooltip: "Converts the given value to an integer",
    args0: [{ type: "input_value", name: "VALUE" }], output: "Number" },
  { type: "math_min_max", message0: "%1 of %2 and %3", colour: "#4C97FF", tooltip: "Returns the maximum or minimum of two numbers",
    args0: [{ type: "field_dropdown", name: "OP", options: [["max", "MAX"], ["min", "MIN"]] }, { type: "input_value", name: "A", check: "Number" }, { type: "input_value", name: "B", check: "Number" }], inputsInline: true, output: "Number" },
  { type: "dict_create_empty", message0: "create empty dictionary", style: "dict_blocks", tooltip: "Creates a new, empty Python dictionary", output: null },
  { type: "dict_set", message0: "in dictionary %1 set key %2 to %3", style: "dict_blocks", tooltip: "Sets a key-value pair in a dictionary",
    args0: [{ type: "input_value", name: "DICT" }, { type: "input_value", name: "KEY" }, { type: "input_value", name: "VALUE" }], inputsInline: true, previousStatement: null, nextStatement: null },
  { type: "dict_get", message0: "in dictionary %1 get key %2", style: "dict_blocks", tooltip: "Retrieves the value for a specific key in a dictionary",
    args0: [{ type: "input_value", name: "DICT" }, { type: "input_value", name: "KEY" }], inputsInline: true, output: null },
  { type: "dict_pair", message0: "key %1 : value %2", style: "dict_blocks", tooltip: "Creates a single Key-Value pair",
    args0: [{ type: "input_value", name: "KEY" }, { type: "input_value", name: "VALUE" }], inputsInline: true, output: "DictPair" },
  { type: "dict_from_pairs", message0: "create dictionary with %1", style: "dict_blocks", tooltip: "Converts a list of key-value pairs into a dictionary literal",
    args0: [{ type: "input_value", name: "LIST", check: "Array" }], output: null },
  { type: "dict_pop", message0: "remove and get value for key/index %1 in %2", style: "dict_blocks", tooltip: "Removes the specified key or index and returns the corresponding value.",
    args0: [{ type: "input_value", name: "KEY" }, { type: "input_value", name: "DICT" }], inputsInline: true, output: null },
  { type: "set_create_empty", message0: "create empty set", style: "set_tuple_blocks", tooltip: "Creates a new, empty Python set", output: null },
  { type: "set_from_list", message0: "create set from list %1", style: "set_tuple_blocks", tooltip: "Converts a list into a set, removing duplicates and enabling O(1) lookups",
    args0: [{ type: "input_value", name: "LIST", check: "Array" }], output: null },
  { type: "set_add", message0: "add %1 to set %2", style: "set_tuple_blocks", tooltip: "Adds an item to a set in constant time",
    args0: [{ type: "input_value", name: "ITEM" }, { type: "input_value", name: "SET" }], inputsInline: true, previousStatement: null, nextStatement: null },
  { type: "set_remove", message0: "remove %1 from set %2", style: "set_tuple_blocks", tooltip: "Removes an item from a set in constant time",
    args0: [{ type: "input_value", name: "ITEM" }, { type: "input_value", name: "SET" }], inputsInline: true, previousStatement: null, nextStatement: null },
  { type: "set_operations", message0: "set %1 of %2 and %3", style: "set_tuple_blocks", tooltip: "Performs mathematical set operations (union, intersection, difference).",
    args0: [{ type: "field_dropdown", name: "OP", options: [["union", "UNION"], ["intersection", "INTERSECTION"], ["difference", "DIFFERENCE"]] }, { type: "input_value", name: "SET1" }, { type: "input_value", name: "SET2" }], inputsInline: true, output: null },
  { type: "tuple_create", message0: "create tuple with %1 and %2", style: "set_tuple_blocks", tooltip: "Creates an immutable tuple containing two elements",
    args0: [{ type: "input_value", name: "A" }, { type: "input_value", name: "B" }], inputsInline: true, output: null },
  { type: "multi_line_comment", message0: "comment %1", colour: "#999999", tooltip: "Adds a multi-line comment to the Python code",
    args0: [{ type: "field_multilinetext", name: "TEXT", text: "Write multi-line note here", spellcheck: false }], previousStatement: null, nextStatement: null },
  { type: "raw_python_statement", message0: "Raw Code \n %1", style: "raw_blocks", tooltip: "Dumps exact text string to Python code",
    args0: [{ type: "field_multilinetext", name: "CODE", text: "print('Hello World')", spellcheck: false }], previousStatement: null, nextStatement: null },
  { type: "raw_python_expression", message0: "Raw Eval \n %1", style: "raw_blocks", tooltip: "Evaluates exact text string as a value",
    args0: [{ type: "field_multilinetext", name: "CODE", text: "x + y", spellcheck: false }], output: null },
  { type: "raw_python_multiline", message0: "Raw Block \n %1", style: "raw_blocks", tooltip: "Dumps multi-line exact text string to Python code",
    args0: [{ type: "field_multilinetext", name: "CODE", text: "def custom_func():\n    pass", spellcheck: false }], previousStatement: null, nextStatement: null },
  { type: "python_input", message0: "ask user for input with prompt %1", style: "io_blocks", tooltip: "Displays a message and waits for the user to type something in the console.",
    args0: [{ type: "input_value", name: "PROMPT", check: "String" }], output: "String" },
  { type: "python_type", message0: "type of %1", colour: "#c1a0e8", tooltip: "Returns the type of the given value",
    args0: [{ type: "input_value", name: "VALUE" }], output: null },
  { type: "python_type_primitive", message0: "type %1", colour: "#c1a0e8", tooltip: "Python primitive types",
    args0: [{ type: "field_dropdown", name: "TYPE", options: [["int", "int"], ["float", "float"], ["str", "str"], ["list", "list"], ["dict", "dict"], ["bool", "bool"], ["tuple", "tuple"], ["set", "set"]] }], output: null },
  { type: "python_isinstance", message0: "is %1 a %2?", colour: "#c1a0e8", tooltip: "Checks if a value is of a specific type",
    args0: [{ type: "input_value", name: "VALUE" }, { type: "input_value", name: "TYPE" }], inputsInline: true, output: "Boolean" },
  { type: "text_multiply", message0: "repeat text %1 %2 times", colour: "#d5a52a", tooltip: "Repeats a string a given number of times",
    args0: [{ type: "input_value", name: "TEXT", check: "String" }, { type: "input_value", name: "MULTIPLIER", check: "Number" }], inputsInline: true, output: "String" },
  { type: "text_newline", message0: "Line Break", colour: "#d5a52a", tooltip: "Returns a newline character", output: "String" },
  { type: "list_append", message0: "append %1 to list %2", style: "list_blocks", tooltip: "Appends an item to the end of a list",
    args0: [{ type: "input_value", name: "ITEM" }, { type: "input_value", name: "LIST", check: "Array" }], inputsInline: true, previousStatement: null, nextStatement: null },
  { type: "list_count", message0: "count occurrences of %1 in list %2", style: "list_blocks", tooltip: "Counts how many times an item appears in a list.",
    args0: [{ type: "input_value", name: "ITEM" }, { type: "input_value", name: "LIST", check: "Array" }], inputsInline: true, output: "Number" },
  { type: "list_reverse", message0: "reverse list %1", style: "list_blocks", tooltip: "Reverses the items of a list in place.",
    args0: [{ type: "input_value", name: "LIST", check: "Array" }], previousStatement: null, nextStatement: null },
  { type: "list_clear", message0: "clear all items from %1", style: "list_blocks", tooltip: "Removes all elements from the list or dictionary.",
    args0: [{ type: "input_value", name: "LIST" }], previousStatement: null, nextStatement: null },
  { type: "list_range", message0: "create list from %1 to %2 (exclusive)", style: "list_blocks", tooltip: "Creates a list of numbers from start to end",
    args0: [{ type: "input_value", name: "START", check: "Number" }, { type: "input_value", name: "END", check: "Number" }], inputsInline: true, output: "Array" },
  { type: "variable_swap", message0: "swap variable %1 and %2", style: "variable_blocks", tooltip: "Swaps the values of two variables",
    args0: [{ type: "field_variable", name: "VAR1", variable: "a" }, { type: "field_variable", name: "VAR2", variable: "b" }], previousStatement: null, nextStatement: null },
  { type: "logic_in", message0: "%1 is in %2", colour: "#c1a0e8", tooltip: "Checks if an item exists within a collection.",
    args0: [{ type: "input_value", name: "ITEM" }, { type: "input_value", name: "COLLECTION" }], inputsInline: true, output: "Boolean" },
  { type: "list_slice_advanced", message0: "slice list %1 from index %2 to %3", style: "list_blocks", tooltip: "Python list slicing. Leave inputs blank to default to the beginning or end of the list.",
    args0: [{ type: "input_value", name: "LIST", check: "Array" }, { type: "input_value", name: "START" }, { type: "input_value", name: "END" }], inputsInline: true, output: "Array" },
  { type: "list_concat", message0: "join list %1 and list %2", style: "list_blocks", tooltip: "Concatenates two arrays together.",
    args0: [{ type: "input_value", name: "LIST1", check: "Array" }, { type: "input_value", name: "LIST2", check: "Array" }], inputsInline: true, output: "Array" },
  { type: "list_remove_value", message0: "remove first occurrence of %1 from list %2", style: "list_blocks", tooltip: "Removes the first matching value from an array.",
    args0: [{ type: "input_value", name: "ITEM" }, { type: "input_value", name: "LIST", check: "Array" }], inputsInline: true, previousStatement: null, nextStatement: null },
  { type: "list_pop", message0: "remove and get last item from list %1", style: "list_blocks", tooltip: "Removes the last item from a list and returns it.",
    args0: [{ type: "input_value", name: "LIST", check: "Array" }], output: null },
  { type: "list_pop_statement", message0: "remove last item from list %1", style: "list_blocks", tooltip: "Removes the last item from a list without returning it.",
    args0: [{ type: "input_value", name: "LIST", check: "Array" }], previousStatement: null, nextStatement: null },
  { type: "dict_keys_values", message0: "get %1 from dict %2", style: "dict_blocks", tooltip: "Returns the keys, values, or items from a dictionary as a list.",
    args0: [{ type: "field_dropdown", name: "OP", options: [["keys", "keys"], ["values", "values"], ["items", "items"]] }, { type: "input_value", name: "DICT" }], inputsInline: true, output: "Array" },
  { type: "controls_pass", message0: "pass", colour: "#8bcf8b", tooltip: "The pass statement does nothing. Used as a placeholder.", previousStatement: null, nextStatement: null },
  { type: "list_sort", message0: "sort list %1 %2", style: "list_blocks", tooltip: "Sorts the list in-place.",
    args0: [{ type: "input_value", name: "LIST", check: "Array" }, { type: "field_dropdown", name: "REVERSE", options: [["in ascending order", "FALSE"], ["in descending order", "TRUE"]] }], previousStatement: null, nextStatement: null },
  { type: "list_sorted", message0: "get sorted copy of list %1 %2", style: "list_blocks", tooltip: "Returns a new sorted list from the given list.",
    args0: [{ type: "input_value", name: "LIST", check: "Array" }, { type: "field_dropdown", name: "REVERSE", options: [["in ascending order", "FALSE"], ["in descending order", "TRUE"]] }], output: "Array" },
  { type: "list_insert", message0: "insert %1 at index %2 in list %3", style: "list_blocks", tooltip: "Inserts an item into a list at a specified index.",
    args0: [{ type: "input_value", name: "ITEM" }, { type: "input_value", name: "INDEX", check: "Number" }, { type: "input_value", name: "LIST", check: "Array" }], inputsInline: true, previousStatement: null, nextStatement: null },
  { type: "string_split", message0: "split string %1 by delimiter %2", colour: "#d5a52a", tooltip: "Splits a string into a list using the given delimiter.",
    args0: [{ type: "input_value", name: "STRING", check: "String" }, { type: "input_value", name: "DELIMITER", check: "String" }], inputsInline: true, output: "Array" },
  { type: "math_abs_round", message0: "%1 of %2", colour: "#4C97FF", tooltip: "Calculates the absolute value or rounds a number.",
    args0: [{ type: "field_dropdown", name: "OP", options: [["absolute value", "abs"], ["round", "round"]] }, { type: "input_value", name: "VALUE", check: "Number" }], output: "Number" },
  { type: "type_cast_advanced", message0: "convert %1 to %2", colour: "#c1a0e8", tooltip: "Converts a value to the specified type.",
    args0: [{ type: "input_value", name: "VALUE" }, { type: "field_dropdown", name: "TYPE", options: [["float", "float"], ["boolean", "bool"], ["string", "str"], ["list", "list"]] }], inputsInline: true, output: null },
  { type: "string_case_formatting", message0: "convert text %1 to %2", colour: "#d5a52a", tooltip: "Converts text to uppercase, lowercase, title case, or capitalized.",
    args0: [{ type: "input_value", name: "STRING", check: "String" }, { type: "field_dropdown", name: "CASE", options: [["UPPERCASE", "upper"], ["lowercase", "lower"], ["Title Case", "title"], ["Capitalized", "capitalize"]] }], inputsInline: true, output: "String" },
  { type: "stack_push", message0: "push %1 to stack %2", style: "stack_queue_blocks", tooltip: "Pushes an item onto the top of the stack (equivalent to list.append).",
    args0: [{ type: "input_value", name: "ITEM" }, { type: "input_value", name: "STACK", check: "Array" }], inputsInline: true, previousStatement: null, nextStatement: null },
  { type: "stack_pop", message0: "pop and get top of stack %1", style: "stack_queue_blocks", tooltip: "Pops the top item off the stack and returns it (equivalent to list.pop()).",
    args0: [{ type: "input_value", name: "STACK", check: "Array" }], output: null },
  { type: "stack_pop_statement", message0: "pop from stack %1", style: "stack_queue_blocks", tooltip: "Pops the top item off the stack.",
    args0: [{ type: "input_value", name: "STACK", check: "Array" }], previousStatement: null, nextStatement: null },
  { type: "stack_peek", message0: "peek top of stack %1", style: "stack_queue_blocks", tooltip: "Returns the top item of the stack without removing it.",
    args0: [{ type: "input_value", name: "STACK", check: "Array" }], output: null },
  { type: "queue_enqueue", message0: "enqueue %1 to queue %2", style: "stack_queue_blocks", tooltip: "Adds an item to the back of the queue (equivalent to list.append).",
    args0: [{ type: "input_value", name: "ITEM" }, { type: "input_value", name: "QUEUE", check: "Array" }], inputsInline: true, previousStatement: null, nextStatement: null },
  { type: "queue_dequeue", message0: "dequeue and get front of queue %1", style: "stack_queue_blocks", tooltip: "Removes and returns the front item of the queue (equivalent to list.pop(0)).",
    args0: [{ type: "input_value", name: "QUEUE", check: "Array" }], output: null },
  { type: "queue_dequeue_statement", message0: "dequeue from queue %1", style: "stack_queue_blocks", tooltip: "Removes the front item of the queue.",
    args0: [{ type: "input_value", name: "QUEUE", check: "Array" }], previousStatement: null, nextStatement: null },
  { type: "queue_peek", message0: "peek front of queue %1", style: "stack_queue_blocks", tooltip: "Returns the front item of the queue without removing it.",
    args0: [{ type: "input_value", name: "QUEUE", check: "Array" }], output: null },
];

if (Blockly.common && Blockly.common.defineBlocksWithJsonArray) { Blockly.common.defineBlocksWithJsonArray(customBlocks); } 
else { Blockly.defineBlocksWithJsonArray(customBlocks); }

const toolbox = {
  kind: "categoryToolbox",
  contents: [
    { kind: "search", name: "Search", contents: [] },
    {
      kind: "category", name: "Logic", categorystyle: "logic_category",
      contents: [
        { kind: "block", type: "controls_if" }, { kind: "block", type: "logic_compare" },
        { kind: "block", type: "logic_operation" }, { kind: "block", type: "logic_in" },
        { kind: "block", type: "logic_negate" }, { kind: "block", type: "logic_boolean" },
        { kind: "block", type: "logic_null" }, { kind: "block", type: "logic_ternary" },
        { kind: "block", type: "procedure_return_value" }, { kind: "block", type: "python_type" },
        { kind: "block", type: "python_type_primitive" }, { kind: "block", type: "python_isinstance" },
        { kind: "block", type: "type_cast_advanced" }
      ]
    },
    {
      kind: "category", name: "Loops", categorystyle: "loop_category",
      contents: [
        { kind: "block", type: "controls_repeat_ext", inputs: { TIMES: { shadow: { type: "math_number", fields: { NUM: 10 } } } } },
        { kind: "block", type: "controls_whileUntil" },
        { kind: "block", type: "controls_for", inputs: { FROM: { shadow: { type: "math_number", fields: { NUM: 1 } } }, TO: { shadow: { type: "math_number", fields: { NUM: 10 } } }, BY: { shadow: { type: "math_number", fields: { NUM: 1 } } } } },
        { kind: "block", type: "controls_forEach" }, { kind: "block", type: "controls_flow_statements" }, { kind: "block", type: "controls_pass" }
      ]
    },
    {
      kind: "category", name: "Math", categorystyle: "math_category",
      contents: [
        { kind: "block", type: "math_number", fields: { NUM: 1 } },
        { kind: "block", type: "math_arithmetic", inputs: { A: { shadow: { type: "math_number", fields: { NUM: 1 } } }, B: { shadow: { type: "math_number", fields: { NUM: 1 } } } } },
        { kind: "block", type: "math_advanced_operators" },
        { kind: "block", type: "math_assignment", inputs: { DELTA: { shadow: { type: "math_number", fields: { NUM: 1 } } } } },
        { kind: "block", type: "type_cast_int" }, { kind: "block", type: "math_min_max" },
        { kind: "block", type: "math_abs_round" }, { kind: "block", type: "math_single" },
        { kind: "block", type: "math_trig" }, { kind: "block", type: "math_constant" },
        { kind: "block", type: "math_number_property" }, { kind: "block", type: "math_round" },
        { kind: "block", type: "math_on_list" }, { kind: "block", type: "math_modulo" },
        { kind: "block", type: "math_constrain", inputs: { LOW: { shadow: { type: "math_number", fields: { NUM: 1 } } }, HIGH: { shadow: { type: "math_number", fields: { NUM: 100 } } } } },
        { kind: "block", type: "math_random_int", inputs: { FROM: { shadow: { type: "math_number", fields: { NUM: 1 } } }, TO: { shadow: { type: "math_number", fields: { NUM: 100 } } } } },
        { kind: "block", type: "math_random_float" }
      ]
    },
    {
      kind: "category", name: "Text", categorystyle: "text_category",
      contents: [
        { kind: "block", type: "comment_block" }, { kind: "block", type: "multi_line_comment" },
        { kind: "block", type: "text" }, { kind: "block", type: "text_newline" },
        { kind: "block", type: "text_multiply", inputs: { MULTIPLIER: { shadow: { type: "math_number", fields: { NUM: 2 } } } } },
        { kind: "block", type: "custom_string_join" }, { kind: "block", type: "string_split" },
        { kind: "block", type: "string_case_formatting" }, { kind: "block", type: "text_join" },
        { kind: "block", type: "text_append" }, { kind: "block", type: "text_length" },
        { kind: "block", type: "text_isEmpty" }, { kind: "block", type: "text_indexOf" },
        { kind: "block", type: "text_charAt" }, { kind: "block", type: "text_getSubstring" },
        { kind: "block", type: "text_changeCase" }, { kind: "block", type: "text_trim" }
      ]
    },
    {
      kind: "category", name: "Input / Output", categorystyle: "io_category",
      contents: [
        { kind: "block", type: "text_print" },
        { kind: "block", type: "python_input", inputs: { PROMPT: { shadow: { type: "text", fields: { TEXT: "Enter your name: " } } } } }
      ]
    },
    {
      kind: "category", name: "Lists (Built-in Type)", categorystyle: "list_category",
      contents: [
        { kind: "block", type: "string_to_list" }, { kind: "block", type: "lists_create_with", extraState: { itemCount: 0 } },
        { kind: "block", type: "lists_create_with" }, { kind: "block", type: "list_append" },
        { kind: "block", type: "list_concat" }, { kind: "block", type: "list_remove_value" },
        { kind: "block", type: "list_pop" }, { kind: "block", type: "list_pop_statement" },
        { kind: "block", type: "list_slice_advanced" }, { kind: "block", type: "list_sort" },
        { kind: "block", type: "list_sorted" }, { kind: "block", type: "list_reverse" },
        { kind: "block", type: "list_clear" }, { kind: "block", type: "list_insert" },
        { kind: "block", type: "list_count" },
        { kind: "block", type: "list_range", inputs: { START: { shadow: { type: "math_number", fields: { NUM: 1 } } }, END: { shadow: { type: "math_number", fields: { NUM: 10 } } } } },
        { kind: "block", type: "lists_repeat", inputs: { NUM: { shadow: { type: "math_number", fields: { NUM: 5 } } } } },
        { kind: "block", type: "lists_length" }, { kind: "block", type: "lists_isEmpty" },
        { kind: "block", type: "lists_indexOf" }, { kind: "block", type: "lists_getIndex" },
        { kind: "block", type: "lists_setIndex" }, { kind: "block", type: "lists_getSublist" },
        { kind: "block", type: "lists_split" }, { kind: "block", type: "lists_sort" }
      ]
    },
    {
      kind: "category", name: "Dictionaries (Built-in Type)", categorystyle: "dict_category",
      contents: [
        { kind: "block", type: "dict_create_empty" },
        { kind: "block", type: "dict_set", inputs: { KEY: { shadow: { type: "text", fields: { TEXT: "key_name" } } }, VALUE: { shadow: { type: "text", fields: { TEXT: "value" } } } } },
        { kind: "block", type: "dict_get", inputs: { KEY: { shadow: { type: "text", fields: { TEXT: "key_name" } } } } },
        { kind: "block", type: "dict_pop" }, { kind: "block", type: "list_clear" },
        { kind: "block", type: "dict_keys_values" },
        { kind: "block", type: "dict_from_pairs", inputs: { LIST: { block: { type: "lists_create_with", extraState: { itemCount: 2 } } } } },
        { kind: "block", type: "dict_pair", inputs: { KEY: { shadow: { type: "text", fields: { TEXT: "key_name" } } }, VALUE: { shadow: { type: "text", fields: { TEXT: "value" } } } } }
      ]
    },
    {
      kind: "category", name: "Sets & Tuples (Core Built-in Types)", categorystyle: "set_tuple_category",
      contents: [
        { kind: "block", type: "tuple_create" }, { kind: "block", type: "set_create_empty" },
        { kind: "block", type: "set_from_list" }, { kind: "block", type: "set_add" },
        { kind: "block", type: "set_remove" }, { kind: "block", type: "set_operations" }
      ]
    },
    {
      kind: "category", name: "Stacks & Queues (Abstract Data Types)", categorystyle: "stack_queue_category",
      contents: [
        { kind: "block", type: "stack_push" }, { kind: "block", type: "stack_pop" },
        { kind: "block", type: "stack_pop_statement" }, { kind: "block", type: "stack_peek" },
        { kind: "block", type: "queue_enqueue" }, { kind: "block", type: "queue_dequeue" },
        { kind: "block", type: "queue_dequeue_statement" }, { kind: "block", type: "queue_peek" }
      ]
    },
    {
      kind: "category", name: "Variables", categorystyle: "variable_category", custom: "VARIABLE",
      contents: [
        { kind: "button", text: "Create variable...", callbackKey: "createVariable" },
        { kind: "block", type: "variable_swap" }
      ]
    },
    { kind: "category", name: "Functions", categorystyle: "procedure_category", custom: "PROCEDURE" },
    {
      kind: "category", name: "Raw Python", categorystyle: "raw_category",
      contents: [
        { kind: "block", type: "raw_python_statement" },
        { kind: "block", type: "raw_python_expression" },
        { kind: "block", type: "raw_python_multiline" }
      ]
    }
  ]
};

const BlocklyWorkspace = forwardRef(({ onChange, syntaxError, initialJson }, ref) => {
  const blocklyDiv = useRef(null);
  const workspace = useRef(null);
  const onChangeRef = useRef(onChange);
  const pendingLoadRef = useRef(null); 

  const executeLoad = (json, preservePythonCode) => {
    if (!workspace.current) return;
    try {
      Blockly.Events.disable(); 
      workspace.current.clear();
      
      let parsedJson = json;
      if (typeof json === "string") {
        try { parsedJson = JSON.parse(json); } 
        catch (e) { console.warn("Failed to parse JSON string"); }
      }

      if (parsedJson && typeof parsedJson === "object" && Object.keys(parsedJson).length > 0) {
        if (Array.isArray(parsedJson)) {
          Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: parsedJson } }, workspace.current);
        } else if (parsedJson.blocks && Array.isArray(parsedJson.blocks) && !parsedJson.blocks.blocks) {
          Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: parsedJson.blocks } }, workspace.current);
        } else {
          Blockly.serialization.workspaces.load(parsedJson, workspace.current);
        }
      }
    } catch (e) {
      console.error("Error loading workspace JSON:", e);
    } finally {
      Blockly.Events.enable();
    }

    setTimeout(() => {
      if (!workspace.current) return;
      const code = pythonGenerator.workspaceToCode(workspace.current);
      const currentJson = Blockly.serialization.workspaces.save(workspace.current);

      if (preservePythonCode !== undefined && preservePythonCode !== null) {
        const isUnsynced = preservePythonCode.trim() !== code.trim() && preservePythonCode !== "# Drag blocks to generate Python code";
        if (onChangeRef.current) onChangeRef.current(currentJson, preservePythonCode, isUnsynced);
      } else {
        if (onChangeRef.current) onChangeRef.current(currentJson, code, false);
      }
    }, 100);
  };

  useImperativeHandle(ref, () => ({
    clear: () => {
      if (!workspace.current) return;
      Blockly.Events.disable();
      try { workspace.current.clear(); } finally { Blockly.Events.enable(); }
    },
    loadTemplate: (json, preservePythonCode = undefined) => {
      if (!workspace.current) {
        pendingLoadRef.current = { json, preservePythonCode };
        return;
      }
      executeLoad(json, preservePythonCode);
    },
    setTheme: (themeName) => {
      if (workspace.current) workspace.current.setTheme(themeName === "dark" ? DarkTheme : pastelTheme);
    },
    loadFromPython: async (pythonCode) => {
      if (!workspace.current || !pythonCode) return;
      const cleanCode = sanitizePythonCode(pythonCode);
      try {
        const data = await convertPythonToBlocks(cleanCode);
        if (data.status === "error") throw new Error(data.message || "Failed to parse Python code.");
        
        Blockly.Events.disable();
        try { 
          workspace.current.clear(); 
          if (data.status === "success" && data.blocks) {
            Blockly.serialization.workspaces.load(data.blocks, workspace.current);
          }
        } finally { Blockly.Events.enable(); }

        setTimeout(() => {
          if (workspace.current && onChangeRef.current) {
            onChangeRef.current(Blockly.serialization.workspaces.save(workspace.current), pythonCode);
          }
        }, 100);
      } catch (e) { throw e; }
    },
    resize: () => { if (workspace.current) { Blockly.svgResize(workspace.current); workspace.current.markFocused(); } }
  }));

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (workspace.current) return;

    let searchPlugin, minimapPlugin, modalPlugin, backpackPlugin, highlightPlugin, minimapDelay;

    if (!crossTabPluginInitialized) {
      try { 
        const crossTabPlugin = new CrossTabCopyPaste(); 
        crossTabPlugin.init({ contextMenu: true, shortcut: true }); 
        crossTabPluginInitialized = true; 
      } catch (e) { }
    }

    if (blocklyDiv.current) {
      if (Blockly.ShortcutRegistry.registry.getRegistry()["startSearch"]) Blockly.ShortcutRegistry.registry.unregister("startSearch");

      Blockly.Variables.flyoutCategory = function (ws) {
        let xmlList = [];
        let btn = document.createElement("button");
        btn.setAttribute("text", "Create variable..."); 
        btn.setAttribute("callbackKey", "CREATE_VARIABLE");
        ws.registerButtonCallback("CREATE_VARIABLE", (b) => Blockly.Variables.createVariableButtonHandler(b.getTargetWorkspace()));
        xmlList.push(btn);
        let blk = document.createElement("block"); 
        blk.setAttribute("type", "variable_swap"); 
        xmlList.push(blk);
        return xmlList.concat(Blockly.Variables.flyoutCategoryBlocks(ws));
      };

      workspace.current = Blockly.inject(blocklyDiv.current, {
        toolbox: toolbox, trashcan: true, move: { scrollbars: true, drag: true, wheel: true },
        zoom: { controls: true, wheel: true, startScale: 1.0, maxScale: 3, minScale: 0.3, scaleSpeed: 1.2 },
        renderer: "geras", theme: pastelTheme, grid: { spacing: 25, length: 3, colour: "#6e6e6e", snap: true }
      });

      try {
        (searchPlugin = new WorkspaceSearch(workspace.current)).init(); 
        (modalPlugin = new Modal(workspace.current)).init(); 
        (backpackPlugin = new Backpack(workspace.current)).init(); 
        (highlightPlugin = new ContentHighlight(workspace.current)).init();
        workspace.current.addChangeListener(shadowBlockConversionChangeListener);
      } catch (e) { }

      minimapDelay = setTimeout(() => {
        if (workspace.current && blocklyDiv.current) {
          Blockly.svgResize(workspace.current);
          try { (minimapPlugin = new PositionedMinimap(workspace.current)).init(); } catch (e) { }
        }
      }, 150);

      if (!pythonGenerator.__originalInit) {
        pythonGenerator.__originalInit = pythonGenerator.init;
        pythonGenerator.init = function (ws) { 
          pythonGenerator.INDENT = "    "; 
          pythonGenerator.__originalInit.call(this, ws); 
          if (this.definitions_["variables"]) delete this.definitions_["variables"]; 
        };
      }

      if (!pythonGenerator.__originalFinish) {
        pythonGenerator.__originalFinish = pythonGenerator.finish;
        pythonGenerator.finish = function (code) {
          return pythonGenerator.__originalFinish.call(this, code)
            .replace(/^[ \t]*global[ \t]+.*\n?/gm, "")
            .replace(/^[ \t]*"""Describe this function\.\.\."""\n?/gm, "")
            .replace(/^[ \t]*# Describe this function\.\.\.\n?/gm, "")
            .replace(/([^\n])\n+(def )/g, "$1\n\n\n$2")
            .replace(/([^:\n][ \t]*)\n+([ \t]*(?:for |while |if |return |#))/g, "$1\n\n$2")
            .replace(/\n{4,}/g, "\n\n\n").trim() + "\n";
        };
      }

      const getCode = (b, n, o = pythonGenerator.ORDER_NONE) => pythonGenerator.valueToCode(b, n, o);
      
      pythonGenerator.forBlock["math_assignment"] = function (block) {
        const v = pythonGenerator.getVariableName(block.getFieldValue("VAR"));
        const op = block.getFieldValue("OP");
        const val = getCode(block, "DELTA", pythonGenerator.ORDER_ATOMIC) || "0";
        const sym = op === "MINUS" ? "-=" : op === "MULTIPLY" ? "*=" : op === "DIVIDE" ? "/=" : "+=";
        return `${v} ${sym} ${val}\n`;
      };

      pythonGenerator.forBlock["controls_for"] = function (block) {
        const v = pythonGenerator.getVariableName(block.getFieldValue("VAR"));
        const from = getCode(block, "FROM") || "0", to = getCode(block, "TO") || "0", step = getCode(block, "BY") || "1";
        const rangeCode = step.trim() === "1" ? (from.trim() === "0" ? `range(${to})` : `range(${from}, ${to})`) : `range(${from}, ${to}, ${step})`;
        return `for ${v} in ${rangeCode}:\n${pythonGenerator.statementToCode(block, "DO") || pythonGenerator.PASS}`;
      };

      pythonGenerator.forBlock["lists_getIndex"] = function (block) {
        const mode = block.getFieldValue("MODE") || "GET", where = block.getFieldValue("WHERE") || "FROM_START";
        const list = getCode(block, "VALUE", pythonGenerator.ORDER_MEMBER) || "[]";
        let idx = "0";
        if (where === "LAST") idx = "-1"; 
        else if (where === "FROM_START") idx = getCode(block, "AT") || "0"; 
        else if (where === "FROM_END") idx = "-" + (getCode(block, "AT") || "1");
        
        if (mode === "GET_REMOVE") return [where === "LAST" ? `${list}.pop()` : `${list}.pop(${idx})`, pythonGenerator.ORDER_FUNCTION_CALL];
        if (mode === "REMOVE") return where === "LAST" ? `${list}.pop()\n` : `${list}.pop(${idx})\n`;
        return [`${list}[${idx}]`, pythonGenerator.ORDER_MEMBER];
      };

      pythonGenerator.forBlock["lists_setIndex"] = function (block) {
        const list = getCode(block, "LIST", pythonGenerator.ORDER_MEMBER) || "[]";
        const mode = block.getFieldValue("MODE") || "SET", where = block.getFieldValue("WHERE") || "FROM_START";
        const val = getCode(block, "TO") || "None";
        
        if (mode === "INSERT") {
          if (where === "LAST") return `${list}.append(${val})\n`; 
          if (where === "FIRST") return `${list}.insert(0, ${val})\n`;
          const at = getCode(block, "AT") || (where === "FROM_END" ? "1" : "0");
          return `${list}.insert(${where === "FROM_END" ? "-" : ""}${at}, ${val})\n`;
        }
        
        let idx = "0"; 
        if (where === "LAST") idx = "-1"; 
        else if (where === "FROM_START") idx = getCode(block, "AT") || "0"; 
        else if (where === "FROM_END") idx = "-" + (getCode(block, "AT") || "1");
        
        return `${list}[${idx}] = ${val}\n`;
      };

      pythonGenerator.forBlock["procedure_return_value"] = b => `return ${getCode(b, "VALUE") || "None"}\n`;
      pythonGenerator.forBlock["custom_string_join"] = b => [`${getCode(b, "DELIMITER", pythonGenerator.ORDER_MEMBER) || "''"}.join(${getCode(b, "LIST") || "[]"})`, pythonGenerator.ORDER_FUNCTION_CALL];
      pythonGenerator.forBlock["string_to_list"] = b => [`list(${getCode(b, "STRING") || "''"})`, pythonGenerator.ORDER_FUNCTION_CALL];
      pythonGenerator.forBlock["type_cast_int"] = b => [`int(${getCode(b, "VALUE") || "0"})`, pythonGenerator.ORDER_FUNCTION_CALL];

      pythonGenerator.forBlock["math_advanced_operators"] = function (block) {
        const opMap = { FLOOR_DIV: ["//", pythonGenerator.ORDER_MULTIPLICATIVE], POWER: ["**", pythonGenerator.ORDER_EXPONENTIATION], RSHIFT: [">>", pythonGenerator.ORDER_BITWISE_SHIFT], LSHIFT: ["<<", pythonGenerator.ORDER_BITWISE_SHIFT], BIT_AND: ["&", pythonGenerator.ORDER_BITWISE_AND], BIT_OR: ["|", pythonGenerator.ORDER_BITWISE_OR] };
        const [sym, order] = opMap[block.getFieldValue("OP")] || ["", pythonGenerator.ORDER_NONE];
        return [`${getCode(block, "A", order) || "0"} ${sym} ${getCode(block, "B", order) || "0"}`, order];
      };

      pythonGenerator.forBlock["math_min_max"] = b => [`${b.getFieldValue("OP") === "MAX" ? "max" : "min"}(${getCode(b, "A") || "0"}, ${getCode(b, "B") || "0"})`, pythonGenerator.ORDER_FUNCTION_CALL];
      pythonGenerator.forBlock["comment_block"] = b => `# ${b.getFieldValue("TEXT") || ""}\n`;
      pythonGenerator.forBlock["multi_line_comment"] = b => `"""\n${b.getFieldValue("TEXT") || ""}\n"""\n`;
      
      pythonGenerator.forBlock["text_join"] = function (block) {
        let fStr = "";
        for (let i = 0; i < block.itemCount_; i++) {
          let el = getCode(block, "ADD" + i);
          if (el) fStr += (el.startsWith("'") && el.endsWith("'")) ? el.slice(1, -1) : `{${el}}`;
        }
        return [`f"${fStr}"`, pythonGenerator.ORDER_ATOMIC];
      };

      pythonGenerator.forBlock["dict_create_empty"] = () => ["{}", pythonGenerator.ORDER_ATOMIC];
      pythonGenerator.forBlock["dict_set"] = b => `${getCode(b, "DICT", pythonGenerator.ORDER_MEMBER) || "{}"}[${getCode(b, "KEY") || '""'}] = ${getCode(b, "VALUE") || "None"}\n`;
      pythonGenerator.forBlock["dict_get"] = b => [`${getCode(b, "DICT", pythonGenerator.ORDER_MEMBER) || "{}"}[${getCode(b, "KEY") || '""'}]`, pythonGenerator.ORDER_MEMBER];
      pythonGenerator.forBlock["dict_pair"] = b => [`${getCode(b, "KEY") || '""'}: ${getCode(b, "VALUE") || "None"}`, pythonGenerator.ORDER_NONE];

      pythonGenerator.forBlock["dict_from_pairs"] = function (block) {
        const lb = block.getInputTargetBlock("LIST");
        if (!lb || lb.type !== "lists_create_with") return ["{}", pythonGenerator.ORDER_ATOMIC];
        let pairs = [];
        for (let i = 0; i < lb.itemCount_; i++) { 
          let p = getCode(lb, "ADD" + i); 
          if (p) pairs.push(p); 
        }
        return pairs.length === 0 ? ["{}", pythonGenerator.ORDER_ATOMIC] : ["{\n    " + pairs.join(",\n    ") + "\n}", pythonGenerator.ORDER_ATOMIC];
      };

      pythonGenerator.forBlock["dict_pop"] = b => [`${getCode(b, "DICT", pythonGenerator.ORDER_MEMBER) || "{}"}.pop(${getCode(b, "KEY") || '""'})`, pythonGenerator.ORDER_FUNCTION_CALL];
      pythonGenerator.forBlock["set_create_empty"] = () => ["set()", pythonGenerator.ORDER_FUNCTION_CALL];
      pythonGenerator.forBlock["set_from_list"] = b => [`set(${getCode(b, "LIST") || "[]"})`, pythonGenerator.ORDER_FUNCTION_CALL];
      pythonGenerator.forBlock["set_add"] = b => `${getCode(b, "SET", pythonGenerator.ORDER_MEMBER) || "set()"}.add(${getCode(b, "ITEM") || "None"})\n`;
      pythonGenerator.forBlock["set_remove"] = b => `${getCode(b, "SET", pythonGenerator.ORDER_MEMBER) || "set()"}.remove(${getCode(b, "ITEM") || "None"})\n`;
      pythonGenerator.forBlock["set_operations"] = b => [`${getCode(b, "SET1", pythonGenerator.ORDER_MEMBER) || "set()"}.${b.getFieldValue("OP").toLowerCase()}(${getCode(b, "SET2") || "set()"})`, pythonGenerator.ORDER_FUNCTION_CALL];
      pythonGenerator.forBlock["tuple_create"] = b => [`(${getCode(b, "A") || "None"}, ${getCode(b, "B") || "None"})`, pythonGenerator.ORDER_ATOMIC];
      pythonGenerator.forBlock["python_type"] = b => [`type(${getCode(b, "VALUE") || "None"})`, pythonGenerator.ORDER_FUNCTION_CALL];
      pythonGenerator.forBlock["python_type_primitive"] = b => [b.getFieldValue("TYPE"), pythonGenerator.ORDER_ATOMIC];
      pythonGenerator.forBlock["python_isinstance"] = b => [`isinstance(${getCode(b, "VALUE") || "None"}, ${getCode(b, "TYPE") || "type(None)"})`, pythonGenerator.ORDER_FUNCTION_CALL];
      pythonGenerator.forBlock["text_multiply"] = b => [`${getCode(b, "TEXT", pythonGenerator.ORDER_MULTIPLICATIVE) || "''"} * ${getCode(b, "MULTIPLIER", pythonGenerator.ORDER_MULTIPLICATIVE) || "0"}`, pythonGenerator.ORDER_MULTIPLICATIVE];
      pythonGenerator.forBlock["text_newline"] = () => ["'\\n'", pythonGenerator.ORDER_ATOMIC];
      
      pythonGenerator.forBlock["list_append"] = b => `${getCode(b, "LIST", pythonGenerator.ORDER_MEMBER) || "[]"}.append(${getCode(b, "ITEM") || "None"})\n`;
      pythonGenerator.forBlock["list_count"] = b => [`${getCode(b, "LIST", pythonGenerator.ORDER_MEMBER) || "[]"}.count(${getCode(b, "ITEM") || "None"})`, pythonGenerator.ORDER_FUNCTION_CALL];
      pythonGenerator.forBlock["list_reverse"] = b => `${getCode(b, "LIST", pythonGenerator.ORDER_MEMBER) || "[]"}.reverse()\n`;
      pythonGenerator.forBlock["list_clear"] = b => `${getCode(b, "LIST", pythonGenerator.ORDER_MEMBER) || "[]"}.clear()\n`;
      pythonGenerator.forBlock["list_range"] = b => [`list(range(${getCode(b, "START") || "0"}, ${getCode(b, "END") || "0"}))`, pythonGenerator.ORDER_FUNCTION_CALL];
      pythonGenerator.forBlock["variable_swap"] = b => `${pythonGenerator.getVariableName(b.getFieldValue("VAR1"))}, ${pythonGenerator.getVariableName(b.getFieldValue("VAR2"))} = ${pythonGenerator.getVariableName(b.getFieldValue("VAR2"))}, ${pythonGenerator.getVariableName(b.getFieldValue("VAR1"))}\n`;
      pythonGenerator.forBlock["logic_in"] = b => [`${getCode(b, "ITEM", pythonGenerator.ORDER_RELATIONAL) || "None"} in ${getCode(b, "COLLECTION", pythonGenerator.ORDER_RELATIONAL) || "[]"}`, pythonGenerator.ORDER_RELATIONAL];
      pythonGenerator.forBlock["list_slice_advanced"] = b => [`${getCode(b, "LIST", pythonGenerator.ORDER_MEMBER) || "[]"}[${getCode(b, "START") || ""}:${getCode(b, "END") || ""}]`, pythonGenerator.ORDER_MEMBER];
      pythonGenerator.forBlock["list_concat"] = b => [`${getCode(b, "LIST1", pythonGenerator.ORDER_ADDITIVE) || "[]"} + ${getCode(b, "LIST2", pythonGenerator.ORDER_ADDITIVE) || "[]"}`, pythonGenerator.ORDER_ADDITIVE];
      pythonGenerator.forBlock["list_remove_value"] = b => `${getCode(b, "LIST", pythonGenerator.ORDER_MEMBER) || "[]"}.remove(${getCode(b, "ITEM") || "None"})\n`;
      pythonGenerator.forBlock["list_pop"] = b => [`${getCode(b, "LIST", pythonGenerator.ORDER_MEMBER) || "[]"}.pop()`, pythonGenerator.ORDER_FUNCTION_CALL];
      pythonGenerator.forBlock["list_pop_statement"] = b => `${getCode(b, "LIST", pythonGenerator.ORDER_MEMBER) || "[]"}.pop()\n`;
      pythonGenerator.forBlock["dict_keys_values"] = b => [`list(${getCode(b, "DICT", pythonGenerator.ORDER_MEMBER) || "{}"}.${b.getFieldValue("OP")}())`, pythonGenerator.ORDER_FUNCTION_CALL];
      pythonGenerator.forBlock["controls_pass"] = () => "pass\n";
      pythonGenerator.forBlock["list_sort"] = b => `${getCode(b, "LIST", pythonGenerator.ORDER_MEMBER) || "[]"}.sort(${b.getFieldValue("REVERSE") === "TRUE" ? "reverse=True" : ""})\n`;
      pythonGenerator.forBlock["list_sorted"] = b => [`sorted(${getCode(b, "LIST") || "[]"}${b.getFieldValue("REVERSE") === "TRUE" ? ", reverse=True" : ""})`, pythonGenerator.ORDER_FUNCTION_CALL];
      pythonGenerator.forBlock["list_insert"] = b => `${getCode(b, "LIST", pythonGenerator.ORDER_MEMBER) || "[]"}.insert(${getCode(b, "INDEX") || "0"}, ${getCode(b, "ITEM") || "None"})\n`;
      pythonGenerator.forBlock["string_split"] = b => [`${getCode(b, "STRING", pythonGenerator.ORDER_MEMBER) || "''"}.split(${getCode(b, "DELIMITER") || "''"})`, pythonGenerator.ORDER_FUNCTION_CALL];
      pythonGenerator.forBlock["math_abs_round"] = b => [`${b.getFieldValue("OP")}(${getCode(b, "VALUE") || "0"})`, pythonGenerator.ORDER_FUNCTION_CALL];
      pythonGenerator.forBlock["type_cast_advanced"] = b => [`${b.getFieldValue("TYPE")}(${getCode(b, "VALUE") || "None"})`, pythonGenerator.ORDER_FUNCTION_CALL];
      pythonGenerator.forBlock["string_case_formatting"] = b => [`${getCode(b, "STRING", pythonGenerator.ORDER_MEMBER) || "''"}.${b.getFieldValue("CASE")}()`, pythonGenerator.ORDER_FUNCTION_CALL];
      
      pythonGenerator.forBlock["stack_push"] = b => `${getCode(b, "STACK", pythonGenerator.ORDER_MEMBER) || "[]"}.append(${getCode(b, "ITEM") || "None"})\n`;
      pythonGenerator.forBlock["stack_pop"] = b => [`${getCode(b, "STACK", pythonGenerator.ORDER_MEMBER) || "[]"}.pop()`, pythonGenerator.ORDER_FUNCTION_CALL];
      pythonGenerator.forBlock["stack_pop_statement"] = b => `${getCode(b, "STACK", pythonGenerator.ORDER_MEMBER) || "[]"}.pop()\n`;
      pythonGenerator.forBlock["stack_peek"] = b => [`${getCode(b, "STACK", pythonGenerator.ORDER_MEMBER) || "[]"}[-1]`, pythonGenerator.ORDER_MEMBER];
      pythonGenerator.forBlock["queue_enqueue"] = b => `${getCode(b, "QUEUE", pythonGenerator.ORDER_MEMBER) || "[]"}.append(${getCode(b, "ITEM") || "None"})\n`;
      pythonGenerator.forBlock["queue_dequeue"] = b => [`${getCode(b, "QUEUE", pythonGenerator.ORDER_MEMBER) || "[]"}.pop(0)`, pythonGenerator.ORDER_FUNCTION_CALL];
      pythonGenerator.forBlock["queue_dequeue_statement"] = b => `${getCode(b, "QUEUE", pythonGenerator.ORDER_MEMBER) || "[]"}.pop(0)\n`;
      pythonGenerator.forBlock["queue_peek"] = b => [`${getCode(b, "QUEUE", pythonGenerator.ORDER_MEMBER) || "[]"}[0]`, pythonGenerator.ORDER_MEMBER];
      
      pythonGenerator.forBlock["raw_python_statement"] = b => b.getFieldValue("CODE") + "\n";
      pythonGenerator.forBlock["raw_python_expression"] = b => [b.getFieldValue("CODE"), pythonGenerator.ORDER_ATOMIC];
      pythonGenerator.forBlock["raw_python_multiline"] = b => b.getFieldValue("CODE") + "\n";
      pythonGenerator.forBlock["python_input"] = b => [`input(${getCode(b, "PROMPT") || "''"})`, pythonGenerator.ORDER_FUNCTION_CALL];

      let changeTimeout = null;
      workspace.current.addChangeListener((event) => {
        if (event.isUiEvent) return;
        if (changeTimeout) clearTimeout(changeTimeout);
        changeTimeout = setTimeout(() => {
          try { 
            if (onChangeRef.current) onChangeRef.current(Blockly.serialization.workspaces.save(workspace.current), pythonGenerator.workspaceToCode(workspace.current)); 
          } catch (e) {}
        }, 400);
      });

      let resizeFrame;
      const observer = new ResizeObserver(() => { 
        if (resizeFrame) cancelAnimationFrame(resizeFrame); 
        resizeFrame = requestAnimationFrame(() => workspace.current && Blockly.svgResize(workspace.current)); 
      });
      observer.observe(blocklyDiv.current); 
      blocklyDiv.current.resizeObserver = observer;

      // Declarative Initialization Load
      if (initialJson) {
         executeLoad(initialJson);
      } else if (pendingLoadRef.current) {
         executeLoad(pendingLoadRef.current.json, pendingLoadRef.current.preservePythonCode);
         pendingLoadRef.current = null;
      }
    }

    return () => {
      if (minimapDelay) clearTimeout(minimapDelay);
      try { [searchPlugin, minimapPlugin, modalPlugin, backpackPlugin, highlightPlugin].forEach(p => p?.dispose && p.dispose()); } catch (e) {}
      if (workspace.current) { workspace.current.dispose(); workspace.current = null; }
      if (blocklyDiv.current?.resizeObserver) blocklyDiv.current.resizeObserver.disconnect();
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={blocklyDiv} style={{ height: "100%", width: "100%" }} />
      {syntaxError && (
        <div style={{ position: "absolute", top: "20px", right: "20px", backgroundColor: "#3A2A6B", borderLeft: "4px solid #bc11ff", color: "#EBE4FF", padding: "12px 16px", borderRadius: "0 8px 8px 0", boxShadow: "0 4px 15px rgba(0,0,0,0.3)", display: "flex", alignItems: "center", gap: "12px", zIndex: 1000, maxWidth: "300px" }}>
          <div>
            <div style={{ fontWeight: "bold", fontSize: "0.9rem", color: "#bc11ff" }}>Syntax Error (Line {syntaxError.line})</div>
            <div style={{ fontSize: "0.8rem", marginTop: "4px", opacity: 0.9 }}>{syntaxError.message}</div>
          </div>
        </div>
      )}
    </div>
  );
});

export default BlocklyWorkspace;