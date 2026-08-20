// frontend/src/components/BlocklyWorkspace.jsx
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
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { convertPythonToBlocks } from "../workers/analyzerInstance";
import FloatingErrorDropdown from "./FloatingErrorDropdown.jsx";
import ScopeWarningModal from "./ScopeWarningModal.jsx";

registerFieldMultilineInput();
Blockly.setLocale(En);

let crossTabPluginInitialized = false;
const DarkTheme = Blockly.Themes.Dark;
const ModernTheme = Blockly.Themes.Modern;

export const pastelTheme = Blockly.Theme.defineTheme("pastelTheme", {
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
  { type: "comment_block", message0: "Comment %1", colour: "#d5a52a", tooltip: "Adds a single-line comment to the Python code. Comments are ignored by the computer but help human readers understand the logic of the code.",
    args0: [{ type: "field_input", name: "TEXT", text: "write note here" }], previousStatement: null, nextStatement: null },
  { type: "math_assignment", message0: "%1 %2 %3", colour: "#4C97FF", tooltip: "Modifies an existing variable using an assignment operator (+=, -=, *=, /=). For example, using '+=' with a value of 1 will increment the current value of the variable by 1.",
    args0: [{ type: "field_variable", name: "VAR", variable: "item" }, { type: "field_dropdown", name: "OP", options: [["+=", "ADD"], ["-=", "MINUS"], ["*=", "MULTIPLY"], ["/=", "DIVIDE"]] }, { type: "input_value", name: "DELTA", check: "Number" }], inputsInline: true, previousStatement: null, nextStatement: null },
  { type: "procedure_return_value", message0: "return %1", colour: "#7a6b66", tooltip: "Exits the current function and returns the specified value back to where the function was called. Any code written after this block inside the same function will not run.",
    args0: [{ type: "input_value", name: "VALUE" }], previousStatement: null, nextStatement: null },
  { type: "custom_string_join", message0: "join list %1 with delimiter %2", colour: "#d5a52a", tooltip: "Joins all items in a list into a single continuous string, placing the specified delimiter between each item. Great for converting arrays into readable, formatted text.",
    args0: [{ type: "input_value", name: "LIST", check: "Array" }, { type: "input_value", name: "DELIMITER", check: "String" }], output: "String" },
  { type: "string_to_list", message0: "create list from string %1", style: "list_blocks", tooltip: "Converts a string into a list where each character (or separated word) becomes an individual element in the newly created list array.",
    args0: [{ type: "input_value", name: "STRING", check: "String" }], output: "Array" },
  { type: "math_advanced_operators", message0: "%1 %2 %3", colour: "#4C97FF", tooltip: "Performs advanced mathematical operations: Floor Division (//) divides and discards the remainder, Power (**) calculates exponents, and Bitwise operators shift or logic-match binary bits.",
    args0: [{ type: "input_value", name: "A", check: "Number" }, { type: "field_dropdown", name: "OP", options: [["//", "FLOOR_DIV"], ["**", "POWER"], [">>", "RSHIFT"], ["<<", "LSHIFT"], ["&", "BIT_AND"], ["|", "BIT_OR"]] }, { type: "input_value", name: "B", check: "Number" }], inputsInline: true, output: "Number" },
  { type: "type_cast_int", message0: "int %1", colour: "#4C97FF", tooltip: "Converts a given value (like a float or a string containing numbers) into an integer (whole number). Decimals are completely truncated, not rounded.",
    args0: [{ type: "input_value", name: "VALUE" }], output: "Number" },
  { type: "math_min_max", message0: "%1 of %2 and %3", colour: "#4C97FF", tooltip: "Compares two numbers and returns either the highest (maximum) or the lowest (minimum) value among them depending on the selected dropdown.",
    args0: [{ type: "field_dropdown", name: "OP", options: [["max", "MAX"], ["min", "MIN"]] }, { type: "input_value", name: "A", check: "Number" }, { type: "input_value", name: "B", check: "Number" }], inputsInline: true, output: "Number" },
  { type: "dict_create_empty", message0: "create empty dictionary", style: "dict_blocks", tooltip: "Initializes a new, empty Python dictionary {}. Dictionaries store data in key-value pairs, allowing for extremely fast lookups by key.", output: null },
  { type: "dict_set", message0: "in dictionary %1 set key %2 to %3", style: "dict_blocks", tooltip: "Adds a new key-value pair to a dictionary or updates the value of an existing key. The key must be a unique, immutable type like a string or number.",
    args0: [{ type: "input_value", name: "DICT" }, { type: "input_value", name: "KEY" }, { type: "input_value", name: "VALUE" }], inputsInline: true, previousStatement: null, nextStatement: null },
  { type: "dict_get", message0: "in dictionary %1 get key %2", style: "dict_blocks", tooltip: "Retrieves the value associated with a specific key in a dictionary. If the key does not exist in the dictionary, Python will throw a KeyError.",
    args0: [{ type: "input_value", name: "DICT" }, { type: "input_value", name: "KEY" }], inputsInline: true, output: null },
  { type: "dict_pair", message0: "key %1 : value %2", style: "dict_blocks", tooltip: "Creates a single Key-Value pair block. This is specifically used to populate a new dictionary literal directly upon creation.",
    args0: [{ type: "input_value", name: "KEY" }, { type: "input_value", name: "VALUE" }], inputsInline: true, output: "DictPair" },
  { type: "dict_from_pairs", message0: "create dictionary with %1", style: "dict_blocks", tooltip: "Constructs a new dictionary populated with a given list of pre-defined key-value pairs.",
    args0: [{ type: "input_value", name: "LIST", check: "Array" }], output: null },
  { type: "dict_pop", message0: "remove and get value for key/index %1 in %2", style: "dict_blocks", tooltip: "Removes the specified key from the dictionary and returns its associated value. Helpful for extracting and deleting data in one step.",
    args0: [{ type: "input_value", name: "KEY" }, { type: "input_value", name: "DICT" }], inputsInline: true, output: null },
  { type: "set_create_empty", message0: "create empty set", style: "set_tuple_blocks", tooltip: "Initializes a new, empty Python set. Sets are unordered collections that strictly do not allow any duplicate elements.", output: null },
  { type: "set_from_list", message0: "create set from list %1", style: "set_tuple_blocks", tooltip: "Converts an existing list into a set. This automatically filters out and removes any duplicate values from the list and optimizes it for O(1) constant time lookups.",
    args0: [{ type: "input_value", name: "LIST", check: "Array" }], output: null },
  { type: "set_add", message0: "add %1 to set %2", style: "set_tuple_blocks", tooltip: "Adds a single item to a set. If the item already exists in the set, the set remains completely unchanged (no duplicates are added).",
    args0: [{ type: "input_value", name: "ITEM" }, { type: "input_value", name: "SET" }], inputsInline: true, previousStatement: null, nextStatement: null },
  { type: "set_remove", message0: "remove %1 from set %2", style: "set_tuple_blocks", tooltip: "Removes a specific item from a set. If the item is not found inside the set, Python will throw a KeyError and halt execution.",
    args0: [{ type: "input_value", name: "ITEM" }, { type: "input_value", name: "SET" }], inputsInline: true, previousStatement: null, nextStatement: null },
  { type: "set_operations", message0: "set %1 of %2 and %3", style: "set_tuple_blocks", tooltip: "Performs mathematical set operations: Union combines all elements from both sets, Intersection finds only the common elements, and Difference finds unique elements.",
    args0: [{ type: "field_dropdown", name: "OP", options: [["union", "UNION"], ["intersection", "INTERSECTION"], ["difference", "DIFFERENCE"]] }, { type: "input_value", name: "SET1" }, { type: "input_value", name: "SET2" }], inputsInline: true, output: null },
  { type: "tuple_create", message0: "create tuple with %1 and %2", style: "set_tuple_blocks", tooltip: "Creates a tuple, which is an ordered, unchangeable (immutable) collection of elements. Once created, its items cannot be modified or reassigned.",
    args0: [{ type: "input_value", name: "A" }, { type: "input_value", name: "B" }], inputsInline: true, output: null },
  { type: "multi_line_comment", message0: "comment %1", colour: "#d5a52a", tooltip: "Adds a multi-line docstring comment (wrapped in triple quotes) to the Python code. Often used to document entire functions or block out large text descriptions.",
    args0: [{ type: "field_multilinetext", name: "TEXT", text: "Write multi-line note here", spellcheck: false }], previousStatement: null, nextStatement: null },
  { type: "blank_line", message0: "\u00b7 \u00b7 \u00b7", colour: "#d5a52a", tooltip: "Represents a blank line for spacing/readability in the generated Python code. Purely visual -- it has no effect when the code runs.",
    previousStatement: null, nextStatement: null },
  { type: "raw_python_statement", message0: "Raw Code \n %1", style: "raw_blocks", tooltip: "Directly injects the exact text string as a raw Python statement into the generated code. Use with caution as it bypasses Blockly's syntax and safety checks.",
    args0: [{ type: "field_multilinetext", name: "CODE", text: "print('Hello World')", spellcheck: false }], previousStatement: null, nextStatement: null },
  { type: "raw_python_expression", message0: "Raw Eval \n %1", style: "raw_blocks", tooltip: "Evaluates an exact text string as a raw Python expression, returning a value that can be plugged into other blocks.",
    args0: [{ type: "field_multilinetext", name: "CODE", text: "x + y", spellcheck: false }], output: null },
  { type: "raw_python_multiline", message0: "Raw Block \n %1", style: "raw_blocks", tooltip: "Injects multiple lines of raw, unformatted Python code directly into the workspace generation. Useful for pasting complex custom logic.",
    args0: [{ type: "field_multilinetext", name: "CODE", text: "def custom_func():\n    pass", spellcheck: false }], previousStatement: null, nextStatement: null },
  { type: "python_input", message0: "ask user for input with prompt %1", style: "io_blocks", tooltip: "Halts program execution, prints the specified prompt message to the console, and waits for the user to type a response and press Enter. Returns the user input as a string.",
    args0: [{ type: "input_value", name: "PROMPT", check: "String" }], output: "String" },
  { type: "python_type", message0: "type of %1", colour: "#c1a0e8", tooltip: "Returns the data type of the provided value or variable (e.g., int, float, str, list, dict). Very useful for debugging and dynamic type checking.",
    args0: [{ type: "input_value", name: "VALUE" }], output: null },
  { type: "python_type_primitive", message0: "type %1", colour: "#c1a0e8", tooltip: "Selects a built-in Python primitive type class (like int, str, or list) to be used for type checking via isinstance or casting.",
    args0: [{ type: "field_dropdown", name: "TYPE", options: [["int", "int"], ["float", "float"], ["str", "str"], ["list", "list"], ["dict", "dict"], ["bool", "bool"], ["tuple", "tuple"], ["set", "set"]] }], output: null },
  { type: "python_isinstance", message0: "is %1 a %2?", colour: "#c1a0e8", tooltip: "Checks if a specific value or variable is exactly an instance of a given data type, returning True if it matches and False otherwise.",
    args0: [{ type: "input_value", name: "VALUE" }, { type: "input_value", name: "TYPE" }], inputsInline: true, output: "Boolean" },
  { type: "text_multiply", message0: "repeat text %1 %2 times", colour: "#d5a52a", tooltip: "Repeats a given string a specified number of times sequentially. For example, multiplying the string 'A' by 3 results in 'AAA'.",
    args0: [{ type: "input_value", name: "TEXT", check: "String" }, { type: "input_value", name: "MULTIPLIER", check: "Number" }], inputsInline: true, output: "String" },
  { type: "text_newline", message0: "Line Break", colour: "#d5a52a", tooltip: "Inserts a newline character (\\n) into a string, which forces subsequent text to drop down to the next line when printed to the console.", output: "String" },
  { type: "list_append", message0: "append %1 to list %2", style: "list_blocks", tooltip: "Adds a new item to the very end of an existing list. The list is modified in-place and its overall size increases by one.",
    args0: [{ type: "input_value", name: "ITEM" }, { type: "input_value", name: "LIST", check: "Array" }], inputsInline: true, previousStatement: null, nextStatement: null },
  { type: "list_count", message0: "count occurrences of %1 in list %2", style: "list_blocks", tooltip: "Scans the entire list from start to finish and counts exactly how many times the specified item appears within it.",
    args0: [{ type: "input_value", name: "ITEM" }, { type: "input_value", name: "LIST", check: "Array" }], inputsInline: true, output: "Number" },
  { type: "list_reverse", message0: "reverse list %1", style: "list_blocks", tooltip: "Reverses the order of the items in the list entirely in-place. The first item becomes the last, and the last becomes the first.",
    args0: [{ type: "input_value", name: "LIST", check: "Array" }], previousStatement: null, nextStatement: null },
  { type: "list_clear", message0: "clear all items from %1", style: "list_blocks", tooltip: "Empties the entire collection, aggressively removing all items from the list or dictionary and leaving it completely blank.",
    args0: [{ type: "input_value", name: "LIST" }], previousStatement: null, nextStatement: null },
  { type: "list_range", message0: "create list from %1 to %2 (exclusive)", style: "list_blocks", tooltip: "Generates a list of sequential numbers starting from the 'start' value up to, but strictly not including, the 'end' value.",
    args0: [{ type: "input_value", name: "START", check: "Number" }, { type: "input_value", name: "END", check: "Number" }], inputsInline: true, output: "Array" },
  { type: "variable_swap", message0: "swap variable %1 and %2", style: "variable_blocks", tooltip: "Exchanges the values of two variables simultaneously in a single, atomic Python operation, completely avoiding the need for a temporary third variable.",
    args0: [{ type: "field_variable", name: "VAR1", variable: "a" }, { type: "field_variable", name: "VAR2", variable: "b" }], previousStatement: null, nextStatement: null },
  { type: "logic_in", message0: "%1 is in %2", colour: "#c1a0e8", tooltip: "Checks if a specific item exists anywhere inside a collection (like a list, set, dictionary keys, or string). Returns True if found, False otherwise.",
    args0: [{ type: "input_value", name: "ITEM" }, { type: "input_value", name: "COLLECTION" }], inputsInline: true, output: "Boolean" },
  { type: "list_slice_advanced", message0: "slice list %1 from index %2 to %3", style: "list_blocks", tooltip: "Extracts a portion (slice) of a list starting from the start index and going up to the end index. Leave indices blank to default to the beginning or end of the list.",
    args0: [{ type: "input_value", name: "LIST", check: "Array" }, { type: "input_value", name: "START" }, { type: "input_value", name: "END" }], inputsInline: true, output: "Array" },
  { type: "list_concat", message0: "join list %1 and list %2", style: "list_blocks", tooltip: "Joins two separate lists together end-to-end to form a single, newly combined list array.",
    args0: [{ type: "input_value", name: "LIST1", check: "Array" }, { type: "input_value", name: "LIST2", check: "Array" }], inputsInline: true, output: "Array" },
  { type: "list_remove_value", message0: "remove first occurrence of %1 from list %2", style: "list_blocks", tooltip: "Searches for the very first exact match of the specified value in the list and removes it. Subsequent elements shift left to fill the gap.",
    args0: [{ type: "input_value", name: "ITEM" }, { type: "input_value", name: "LIST", check: "Array" }], inputsInline: true, previousStatement: null, nextStatement: null },
  { type: "list_pop", message0: "remove and get last item from list %1", style: "list_blocks", tooltip: "Removes the last item from the very end of the list and returns that item so it can be assigned to a variable or used immediately.",
    args0: [{ type: "input_value", name: "LIST", check: "Array" }], output: null },
  { type: "list_pop_statement", message0: "remove last item from list %1", style: "list_blocks", tooltip: "Removes the last item from the very end of the list but does not return it. The removed item is simply discarded.",
    args0: [{ type: "input_value", name: "LIST", check: "Array" }], previousStatement: null, nextStatement: null },
  { type: "dict_keys_values", message0: "get %1 from dict %2", style: "dict_blocks", tooltip: "Extracts all keys, all values, or all key-value pairs (items) from a dictionary and immediately converts them into a flat list format for easy looping.",
    args0: [{ type: "field_dropdown", name: "OP", options: [["keys", "keys"], ["values", "values"], ["items", "items"]] }, { type: "input_value", name: "DICT" }], inputsInline: true, output: "Array" },
  { type: "controls_pass", message0: "pass", colour: "#8bcf8b", tooltip: "The 'pass' statement does absolutely nothing. It is used as a syntactic placeholder in loops, conditionals, or functions where code is eventually intended to go but cannot be left entirely blank.", previousStatement: null, nextStatement: null },
  { type: "list_sort", message0: "sort list %1 %2", style: "list_blocks", tooltip: "Sorts the elements of the list permanently in-place (modifying the original list) in either standard ascending or reversed descending order.",
    args0: [{ type: "input_value", name: "LIST", check: "Array" }, { type: "field_dropdown", name: "REVERSE", options: [["in ascending order", "FALSE"], ["in descending order", "TRUE"]] }], previousStatement: null, nextStatement: null },
  { type: "list_sorted", message0: "get sorted copy of list %1 %2", style: "list_blocks", tooltip: "Creates and returns a brand new list containing the sorted elements, leaving the original list completely untouched and unmodified.",
    args0: [{ type: "input_value", name: "LIST", check: "Array" }, { type: "field_dropdown", name: "REVERSE", options: [["in ascending order", "FALSE"], ["in descending order", "TRUE"]] }], output: "Array" },
  { type: "list_insert", message0: "insert %1 at index %2 in list %3", style: "list_blocks", tooltip: "Inserts a new item into the list exactly at the given index position. All elements originally at or after this index are shifted one position to the right.",
    args0: [{ type: "input_value", name: "ITEM" }, { type: "input_value", name: "INDEX", check: "Number" }, { type: "input_value", name: "LIST", check: "Array" }], inputsInline: true, previousStatement: null, nextStatement: null },
  { type: "string_split", message0: "split string %1 by delimiter %2", colour: "#d5a52a", tooltip: "Divides a single string into a list of multiple strings, breaking the text apart wherever the specified delimiter substring occurs.",
    args0: [{ type: "input_value", name: "STRING", check: "String" }, { type: "input_value", name: "DELIMITER", check: "String" }], inputsInline: true, output: "Array" },
  { type: "math_abs_round", message0: "%1 of %2", colour: "#4C97FF", tooltip: "Performs standard mathematical formatting: 'absolute value' strictly strips away any negative signs, while 'round' snaps floating-point decimals to the nearest whole integer.",
    args0: [{ type: "field_dropdown", name: "OP", options: [["absolute value", "abs"], ["round", "round"]] }, { type: "input_value", name: "VALUE", check: "Number" }], output: "Number" },
  { type: "type_cast_advanced", message0: "convert %1 to %2", colour: "#4C97FF", tooltip: "Forcefully converts a given variable or value into the designated Python data type (for example, turning a text string '5' into a usable integer 5).",
    args0: [{ type: "input_value", name: "VALUE" }, { type: "field_dropdown", name: "TYPE", options: [["float", "float"], ["boolean", "bool"], ["string", "str"], ["list", "list"]] }], inputsInline: true, output: null },
  { type: "string_case_formatting", message0: "convert text %1 to %2", colour: "#d5a52a", tooltip: "Transforms the capitalization styling of a string. Options include forcing all letters to UPPERCASE, making all letters lowercase, Capitalizing Every Word (Title Case), or just capitalizing the first letter.",
    args0: [{ type: "input_value", name: "STRING", check: "String" }, { type: "field_dropdown", name: "CASE", options: [["UPPERCASE", "upper"], ["lowercase", "lower"], ["Title Case", "title"], ["Capitalized", "capitalize"]] }], inputsInline: true, output: "String" },
  { type: "stack_push", message0: "push %1 to stack %2", style: "stack_queue_blocks", tooltip: "Adds an element to the absolute top of the stack data structure. Under the hood in Python, this is functionally equivalent to appending an item to the end of a list.",
    args0: [{ type: "input_value", name: "ITEM" }, { type: "input_value", name: "STACK", check: "Array" }], inputsInline: true, previousStatement: null, nextStatement: null },
  { type: "stack_pop", message0: "pop and get top of stack %1", style: "stack_queue_blocks", tooltip: "Removes and explicitly returns the element currently at the top of the stack (the most recently added item), strictly following the Last-In-First-Out (LIFO) logical principle.",
    args0: [{ type: "input_value", name: "STACK", check: "Array" }], output: null },
  { type: "stack_pop_statement", message0: "pop from stack %1", style: "stack_queue_blocks", tooltip: "Removes the element currently at the top of the stack (the most recently added item) but instantly discards it without returning the value.",
    args0: [{ type: "input_value", name: "STACK", check: "Array" }], previousStatement: null, nextStatement: null },
  { type: "stack_peek", message0: "peek top of stack %1", style: "stack_queue_blocks", tooltip: "Looks at and returns the element currently at the top of the stack (the most recently added item) without actually modifying or removing it from the stack.",
    args0: [{ type: "input_value", name: "STACK", check: "Array" }], output: null },
  { type: "queue_enqueue", message0: "enqueue %1 to queue %2", style: "stack_queue_blocks", tooltip: "Adds an element to the back of the queue data structure. Under the hood in Python, this is equivalent to appending an item to the end of a list.",
    args0: [{ type: "input_value", name: "ITEM" }, { type: "input_value", name: "QUEUE", check: "Array" }], inputsInline: true, previousStatement: null, nextStatement: null },
  { type: "queue_dequeue", message0: "dequeue and get front of queue %1", style: "stack_queue_blocks", tooltip: "Removes and explicitly returns the element currently at the very front of the queue (the oldest item added), strictly following the First-In-First-Out (FIFO) logical principle.",
    args0: [{ type: "input_value", name: "QUEUE", check: "Array" }], output: null },
  { type: "queue_dequeue_statement", message0: "dequeue from queue %1", style: "stack_queue_blocks", tooltip: "Removes the element currently at the very front of the queue (the oldest item added) but instantly discards it without returning the value.",
    args0: [{ type: "input_value", name: "QUEUE", check: "Array" }], previousStatement: null, nextStatement: null },
  { type: "queue_peek", message0: "peek front of queue %1", style: "stack_queue_blocks", tooltip: "Looks at and returns the element currently at the very front of the queue (the oldest item added) without actually modifying or removing it from the queue.",
    args0: [{ type: "input_value", name: "QUEUE", check: "Array" }], output: null },
];

if (Blockly.common && Blockly.common.defineBlocksWithJsonArray) { Blockly.common.defineBlocksWithJsonArray(customBlocks); } 
else { Blockly.defineBlocksWithJsonArray(customBlocks); }

// Both of these patch Blockly's built-in dynamic ("custom") flyout
// categories to splice in blocks that only exist in this app --
// "variable_swap" into Variables, "procedure_return_value" (the standalone
// "return ___" block) into Functions. They used to live inside
// BlocklyWorkspace's mount effect, which meant the toolbox only actually
// had these two blocks in it once the real Activity workspace had been
// mounted at least once in the browser session. BlockPlaygroundWorkspace.jsx
// (the editable playground embedded in Lesson pages) imports this same
// `toolbox` config but is very often the FIRST Blockly workspace a learner
// ever opens -- e.g. clicking into a lesson's "Try it yourself" playground
// before ever visiting an actual Activity. In that order, these blocks were
// still fully defined and would render correctly if a saved/synced example
// already contained one, but neither flyout override had run yet, so
// neither block was ever actually draggable in from that toolbox.
//
// Moving the patches here -- module-level, evaluated exactly once as soon
// as anything imports this file (toolbox, pastelTheme, or the default
// export) -- means they're in place before the FIRST Blockly.inject() call
// anywhere in the app, regardless of which component makes it.
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

const defaultProceduresFlyoutCategory = Blockly.Procedures.flyoutCategory;
Blockly.Procedures.flyoutCategory = function (ws) {
  const xmlList = defaultProceduresFlyoutCategory(ws);
  const returnBlk = document.createElement("block");
  returnBlk.setAttribute("type", "procedure_return_value");
  xmlList.push(returnBlk);
  return xmlList;
};

// Exported so other surfaces (e.g. the editable lesson block playgrounds)
// can offer the exact same set of blocks, in the exact same categories, as
// the real workspace -- instead of maintaining a second, drifting copy.
export const toolbox = {
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
        { kind: "block", type: "python_type" },
        { kind: "block", type: "python_type_primitive" }, { kind: "block", type: "python_isinstance" }
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
        { kind: "block", type: "type_cast_int" }, { kind: "block", type: "type_cast_advanced" },
        { kind: "block", type: "math_min_max" },
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
        { kind: "block", type: "blank_line" },
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
      kind: "category", name: "Lists", categorystyle: "list_category",
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
      kind: "category", name: "Dictionaries", categorystyle: "dict_category",
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
      kind: "category", name: "Sets & Tuples", categorystyle: "set_tuple_category",
      contents: [
        { kind: "block", type: "tuple_create" }, { kind: "block", type: "set_create_empty" },
        { kind: "block", type: "set_from_list" }, { kind: "block", type: "set_add" },
        { kind: "block", type: "set_remove" }, { kind: "block", type: "set_operations" }
      ]
    },
    {
      kind: "category", name: "Stacks & Queues", categorystyle: "stack_queue_category",
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
    {
      kind: "category", name: "Functions", categorystyle: "procedure_category", custom: "PROCEDURE",
      // For a `custom` category, "contents" has ZERO effect on what actually
      // renders when the flyout opens -- that's entirely driven by the
      // Blockly.Procedures.flyoutCategory override below (which is how
      // "procedure_return_value" actually gets added, mirroring the
      // Variables override further down for the same reason).
      //
      // But "contents" is NOT purely decorative: the @blockly/toolbox-search
      // plugin builds its search index by walking ONLY the static toolbox
      // JSON's "contents" trees -- it never invokes flyoutCategory overrides,
      // so it has no way to discover blocks that only exist because a custom
      // category injects them at render time. With this category left empty,
      // every block in Functions -- including the four static ones that are
      // always available regardless of what the learner has defined --
      // was completely unsearchable via the toolbox's search bar, even
      // though clicking into Functions directly showed them just fine.
      //
      // Listed here: only the STATIC blocks (always available, not tied to
      // a specific user-defined function). "procedures_callnoreturn" /
      // "procedures_callreturn" are deliberately NOT listed -- those are
      // generated per actual function the learner has created (same as
      // "variables_get"/"variables_set" aren't listed under Variables
      // above), so there's no single generic block to search for.
      contents: [
        { kind: "block", type: "procedures_defnoreturn" },
        { kind: "block", type: "procedures_defreturn" },
        { kind: "block", type: "procedures_ifreturn" },
        { kind: "block", type: "procedure_return_value" }
      ]
    },
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

const BlocklyWorkspace = forwardRef(({ onChange, syntaxErrors = [], initialJson }, ref) => {
  const blocklyDiv = useRef(null);
  const workspace = useRef(null);
  const onChangeRef = useRef(onChange);
  const pendingLoadRef = useRef(null); 
  const scopeWarningResolveRef = useRef(null);
  const [scopeWarningState, setScopeWarningState] = useState({ isOpen: false, warnings: [] });

  // Shows the scope-warning modal and pauses until the user decides.
  // Resolves true ("Proceed anyway") or false ("Cancel").
  const confirmScopeWarnings = (warnings) => {
    return new Promise((resolve) => {
      scopeWarningResolveRef.current = resolve;
      setScopeWarningState({ isOpen: true, warnings });
    });
  };

  const closeScopeWarningModal = (proceed) => {
    setScopeWarningState({ isOpen: false, warnings: [] });
    if (scopeWarningResolveRef.current) {
      scopeWarningResolveRef.current(proceed);
      scopeWarningResolveRef.current = null;
    }
  };

  const executeLoad = (json, preservePythonCode) => {
    if (!workspace.current) return;
    try {
      Blockly.Events.setGroup(true); 
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
      Blockly.Events.setGroup(false);
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
      Blockly.Events.setGroup(true);
      try { workspace.current.clear(); } finally { Blockly.Events.setGroup(false); }
    },
    // FIX: Added imperative methods to fetch raw JSON manually so failsafes work perfectly
    getJson: () => {
      if (!workspace.current) return {};
      return Blockly.serialization.workspaces.save(workspace.current);
    },
    getBlocksJson: () => {
      if (!workspace.current) return {};
      return Blockly.serialization.workspaces.save(workspace.current);
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

        if (Array.isArray(data.scope_warnings) && data.scope_warnings.length > 0) {
          const proceed = await confirmScopeWarnings(data.scope_warnings);
          if (!proceed) return;
        }

        try { 
          Blockly.Events.setGroup(true);
          workspace.current.clear(); 
          if (data.status === "success" && data.blocks) {
            Blockly.serialization.workspaces.load(data.blocks, workspace.current);
          }
        } finally { Blockly.Events.setGroup(false); }

        // This delivers the just-loaded blocks/code back to the caller's
        // state via onChangeRef, and used to fire inside a bare, unawaited
        // setTimeout -- so the promise below resolved (and callers like
        // handleSyncToBlocks proceeded to flip viewMode to "workspace" and
        // show a success toast) up to 100ms *before* this actually ran.
        // The redirect to the Blocks view would then beat the real delivery
        // of the synced state, which is exactly backwards. Wrapping it in a
        // promise that the outer async function awaits keeps the 100ms
        // settle time Blockly needs (for block layout/connections to
        // stabilize before it's safe to read back workspaceToCode/save)
        // while guaranteeing loadFromPython() doesn't resolve until that
        // delivery has actually happened.
        await new Promise((resolve) => {
          setTimeout(() => {
            if (workspace.current && onChangeRef.current) {
              onChangeRef.current(Blockly.serialization.workspaces.save(workspace.current), pythonCode);
            }
            resolve();
          }, 100);
        });
      } catch (e) { throw e; }
    },
    resize: () => { if (workspace.current) { Blockly.svgResize(workspace.current); workspace.current.markFocused(); } }
  }));

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (workspace.current) return;

    let searchPlugin, minimapPlugin, modalPlugin, backpackPlugin, highlightPlugin;

    if (!crossTabPluginInitialized) {
      try { 
        const crossTabPlugin = new CrossTabCopyPaste(); 
        crossTabPlugin.init({ contextMenu: true, shortcut: true }); 
        crossTabPluginInitialized = true; 
      } catch (e) { }
    }

    if (blocklyDiv.current) {
      if (Blockly.ShortcutRegistry.registry.getRegistry()["startSearch"]) Blockly.ShortcutRegistry.registry.unregister("startSearch");

      // Variables' and Procedures' dynamic flyout categories (including the
      // "variable_swap" / "procedure_return_value" splices) are patched at
      // module load time now, above -- see the comment there for why.

      workspace.current = Blockly.inject(blocklyDiv.current, {
        toolbox: toolbox, trashcan: true, move: { scrollbars: true, drag: true, wheel: true },
        zoom: { controls: true, wheel: true, startScale: 1.0, maxScale: 3, minScale: 0.3, scaleSpeed: 1.2 },
        renderer: "geras", theme: pastelTheme, grid: { spacing: 25, length: 3, colour: "#6e6e6e", snap: true }
      });

      // Belt-and-braces: explicitly wire the built-in "VARIABLE"/"PROCEDURE"
      // custom categories to our patched flyouts on THIS workspace instance,
      // via Blockly's public registerToolboxCategoryCallback API, instead of
      // relying on Blockly to pick up the Blockly.Procedures.flyoutCategory /
      // Blockly.Variables.flyoutCategory monkey-patch above on its own. That
      // patch alone was the "fix" for this before, but it silently didn't
      // take effect for manual toolbox browsing (only toolbox-search, which
      // reads the static "contents" JSON directly, ever found
      // procedure_return_value / variable_swap) -- clicking into Functions
      // or Variables still rendered without them. Calling this directly
      // guarantees the callback actually used by this workspace is ours,
      // regardless of whatever Blockly does internally by default.
      workspace.current.registerToolboxCategoryCallback("VARIABLE", Blockly.Variables.flyoutCategory);
      workspace.current.registerToolboxCategoryCallback("PROCEDURE", Blockly.Procedures.flyoutCategory);

      try {
        (searchPlugin = new WorkspaceSearch(workspace.current)).init(); 
        (modalPlugin = new Modal(workspace.current)).init(); 
        (backpackPlugin = new Backpack(workspace.current)).init(); 
        (highlightPlugin = new ContentHighlight(workspace.current)).init();
        workspace.current.addChangeListener(shadowBlockConversionChangeListener);
        
        minimapPlugin = new PositionedMinimap(workspace.current);
        minimapPlugin.init();
      } catch (e) { 
        console.error("Plugin Init Error:", e);
      }

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
      
      pythonGenerator.forBlock["math_change"] = function (block) {
        const v = pythonGenerator.getVariableName(block.getFieldValue("VAR"));
        const val = getCode(block, "DELTA", pythonGenerator.ORDER_ATOMIC) || "0";
        return `${v} += ${val}\n`;
      };

      pythonGenerator.forBlock["controls_repeat_ext"] = function (block) {
        const repeats = getCode(block, "TIMES", pythonGenerator.ORDER_NONE) || "0";
        const branch = pythonGenerator.statementToCode(block, "DO") || pythonGenerator.PASS;
        return `for _ in range(${repeats}):\n${branch}`;
      };

      pythonGenerator.forBlock["controls_repeat"] = function (block) {
        const repeats = parseInt(block.getFieldValue("TIMES"), 10) || 0;
        const branch = pythonGenerator.statementToCode(block, "DO") || pythonGenerator.PASS;
        return `for _ in range(${repeats}):\n${branch}`;
      };

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
      pythonGenerator.forBlock["blank_line"] = () => `\n`;
      
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

      if (initialJson) {
         executeLoad(initialJson);
      } else if (pendingLoadRef.current) {
         executeLoad(pendingLoadRef.current.json, pendingLoadRef.current.preservePythonCode);
         pendingLoadRef.current = null;
      }
    }

    return () => {
      try { [searchPlugin, minimapPlugin, modalPlugin, backpackPlugin, highlightPlugin].forEach(p => p?.dispose && p.dispose()); } catch (e) {}
      if (workspace.current) { workspace.current.dispose(); workspace.current = null; }
      if (blocklyDiv.current?.resizeObserver) blocklyDiv.current.resizeObserver.disconnect();
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={blocklyDiv} style={{ height: "100%", width: "100%" }} />
      <FloatingErrorDropdown syntaxErrors={syntaxErrors} />
      <ScopeWarningModal
        isOpen={scopeWarningState.isOpen}
        warnings={scopeWarningState.warnings}
        onProceed={() => closeScopeWarningModal(true)}
        onCancel={() => closeScopeWarningModal(false)}
      />
    </div>
  );
});

export default BlocklyWorkspace;