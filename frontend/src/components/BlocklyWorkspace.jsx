import * as Blockly from "blockly";
import "blockly/blocks";
import * as En from "blockly/msg/en";
import { pythonGenerator } from "blockly/python";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { registerFieldMultilineInput } from '@blockly/field-multilineinput';
import { CrossTabCopyPaste } from '@blockly/plugin-cross-tab-copy-paste';
import { Modal } from "@blockly/plugin-modal";
import { WorkspaceSearch } from "@blockly/plugin-workspace-search";
import { shadowBlockConversionChangeListener } from "@blockly/shadow-block-converter";
import "@blockly/toolbox-search";
import { Backpack } from "@blockly/workspace-backpack";
import { ContentHighlight } from "@blockly/workspace-content-highlight";
import { PositionedMinimap } from "@blockly/workspace-minimap";
import { convertPythonToBlocks } from "../workers/analyzerInstance";

registerFieldMultilineInput();
Blockly.setLocale(En);

let crossTabPluginInitialized = false;

const DarkTheme = Blockly.Themes.Dark;
const ModernTheme = Blockly.Themes.Modern;

const pastelTheme = Blockly.Theme.defineTheme('pastelTheme', {
  base: ModernTheme,
  categoryStyles: {
    logic_category: { colour: "#c1a0e8" },
    loop_category: { colour: "#8bcf8b" },
    math_category: { colour: "#4C97FF" },
    text_category: { colour: "#d5a52a" },
    io_category: { colour: "#FF8A65" },
    list_category: { colour: "#4DB6AC" },
    dict_category: { colour: "#BA68C8" },
    set_tuple_category: { colour: "#7986CB" },
    stack_queue_category: { colour: "#F06292" },
    variable_category: { colour: "#f38286" },
    procedure_category: { colour: "#7a6b66" },
    raw_category: { colour: "#FF6B6B" }
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
  fontStyle: {
    family: "'Outfit', 'Inter', sans-serif",
    weight: "500",
    size: 13
  }
});

const customBlocks = [
  {
    type: "comment_block",
    message0: "Comment %1",
    args0: [{ type: "field_input", name: "TEXT", text: "write note here" }],
    previousStatement: null,
    nextStatement: null,
    colour: "#999999",
    tooltip: "Adds a comment to the Python code"
  },
  {
    type: "math_assignment",
    message0: "%1 %2 %3",
    args0: [
      { type: "field_variable", name: "VAR", variable: "item" },
      { type: "field_dropdown", name: "OP", options: [["+=", "ADD"], ["-=", "MINUS"], ["*=", "MULTIPLY"], ["/=", "DIVIDE"]] },
      { type: "input_value", name: "DELTA", check: "Number" }
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: "#4C97FF",
    tooltip: "Modify a variable using Add, Subtract, Multiply, or Divide"
  },
  {
    type: "procedure_return_value",
    message0: "return %1",
    args0: [{ type: "input_value", name: "VALUE" }],
    previousStatement: null,
    nextStatement: null,
    colour: "#7a6b66",
    tooltip: "Returns the value from this function"
  },
  {
    type: "custom_string_join",
    message0: "join list %1 with delimiter %2",
    args0: [
      { type: "input_value", name: "LIST", check: "Array" },
      { type: "input_value", name: "DELIMITER", check: "String" }
    ],
    output: "String",
    colour: "#d5a52a",
    tooltip: "Joins a list of strings into one string using a specified delimiter"
  },
  {
    type: "string_to_list",
    message0: "create list from string %1",
    args0: [{ type: "input_value", name: "STRING", check: "String" }],
    output: "Array",
    style: "list_blocks",
    tooltip: "Converts a string into a list of its characters"
  },
  {
    type: "math_advanced_operators",
    message0: "%1 %2 %3",
    args0: [
      { type: "input_value", name: "A", check: "Number" },
      { type: "field_dropdown", name: "OP", options: [["//", "FLOOR_DIV"], ["**", "POWER"], [">>", "RSHIFT"], ["<<", "LSHIFT"], ["&", "BIT_AND"], ["|", "BIT_OR"]] },
      { type: "input_value", name: "B", check: "Number" }
    ],
    inputsInline: true,
    output: "Number",
    colour: "#4C97FF",
    tooltip: "Performs advanced math operations such as Floor Division, Power, Bitwise Shifts, and Bitwise Logic"
  },
  {
    type: "type_cast_int",
    message0: "int %1",
    args0: [{ type: "input_value", name: "VALUE" }],
    output: "Number",
    colour: "#4C97FF",
    tooltip: "Converts the given value to an integer"
  },
  {
    type: "math_min_max",
    message0: "%1 of %2 and %3",
    args0: [
      { type: "field_dropdown", name: "OP", options: [["max", "MAX"], ["min", "MIN"]] },
      { type: "input_value", name: "A", check: "Number" },
      { type: "input_value", name: "B", check: "Number" }
    ],
    inputsInline: true,
    output: "Number",
    colour: "#4C97FF",
    tooltip: "Returns the maximum or minimum of two numbers"
  },
  {
    type: "dict_create_empty",
    message0: "create empty dictionary",
    output: null,
    style: "dict_blocks",
    tooltip: "Creates a new, empty Python dictionary"
  },
  {
    type: "dict_set",
    message0: "in dictionary %1 set key %2 to %3",
    args0: [
      { type: "input_value", name: "DICT" },
      { type: "input_value", name: "KEY" },
      { type: "input_value", name: "VALUE" }
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: "dict_blocks",
    tooltip: "Sets a key-value pair in a dictionary"
  },
  {
    type: "dict_get",
    message0: "in dictionary %1 get key %2",
    args0: [
      { type: "input_value", name: "DICT" },
      { type: "input_value", name: "KEY" },
    ],
    inputsInline: true,
    output: null,
    style: "dict_blocks",
    tooltip: "Retrieves the value for a specific key in a dictionary"
  },
  {
    type: "dict_pair",
    message0: "key %1 : value %2",
    args0: [
      { type: "input_value", "name": "KEY" },
      { type: "input_value", "name": "VALUE" }
    ],
    inputsInline: true,
    output: "DictPair",
    style: "dict_blocks",
    tooltip: "Creates a single Key-Value pair"
  },
  {
    type: "dict_from_pairs",
    message0: "create dictionary with %1",
    args0: [
      { type: "input_value", "name": "LIST", check: "Array" }
    ],
    output: null,
    style: "dict_blocks",
    tooltip: "Converts a list of key-value pairs into a dictionary literal"
  },
  {
    type: "dict_pop",
    message0: "remove and get value for key/index %1 in %2",
    args0: [
      { type: "input_value", name: "KEY" },
      { type: "input_value", name: "DICT" }
    ],
    inputsInline: true,
    output: null,
    style: "dict_blocks",
    tooltip: "Removes the specified key or index and returns the corresponding value."
  },
  {
    type: "set_create_empty",
    message0: "create empty set",
    output: null,
    style: "set_tuple_blocks",
    tooltip: "Creates a new, empty Python set"
  },
  {
    type: "set_from_list",
    message0: "create set from list %1",
    args0: [{ type: "input_value", name: "LIST", check: "Array" }],
    output: null,
    style: "set_tuple_blocks",
    tooltip: "Converts a list into a set, removing duplicates and enabling O(1) lookups"
  },
  {
    type: "set_add",
    message0: "add %1 to set %2",
    args0: [
      { type: "input_value", name: "ITEM" },
      { type: "input_value", name: "SET" }
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: "set_tuple_blocks",
    tooltip: "Adds an item to a set in constant time"
  },
  {
    type: "set_remove",
    message0: "remove %1 from set %2",
    args0: [
      { type: "input_value", name: "ITEM" },
      { type: "input_value", name: "SET" }
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: "set_tuple_blocks",
    tooltip: "Removes an item from a set in constant time"
  },
  {
    type: "set_operations",
    message0: "set %1 of %2 and %3",
    args0: [
      { type: "field_dropdown", name: "OP", options: [["union", "UNION"], ["intersection", "INTERSECTION"], ["difference", "DIFFERENCE"]] },
      { type: "input_value", name: "SET1" },
      { type: "input_value", name: "SET2" }
    ],
    inputsInline: true,
    output: null,
    style: "set_tuple_blocks",
    tooltip: "Performs mathematical set operations (union, intersection, difference)."
  },
  {
    type: "tuple_create",
    message0: "create tuple with %1 and %2",
    args0: [
      { type: "input_value", name: "A" },
      { type: "input_value", name: "B" }
    ],
    inputsInline: true,
    output: null,
    style: "set_tuple_blocks",
    tooltip: "Creates an immutable tuple containing two elements"
  },
  {
    type: "multi_line_comment",
    message0: 'comment %1',
    args0: [{
      type: "field_multilinetext",
      name: "TEXT",
      text: "Write multi-line note here",
      spellcheck: false
    }],
    previousStatement: null,
    nextStatement: null,
    colour: "#999999",
    tooltip: "Adds a multi-line comment to the Python code"
  },
  {
    type: "raw_python_statement",
    message0: "Raw Code \n %1",
    args0: [{
      type: "field_multilinetext",
      name: "CODE",
      text: "print('Hello World')",
      spellcheck: false
    }],
    previousStatement: null,
    nextStatement: null,
    style: "raw_blocks",
    tooltip: "Dumps exact text string to Python code"
  },
  {
    type: "raw_python_expression",
    message0: "Raw Eval \n %1",
    args0: [{
      type: "field_multilinetext",
      name: "CODE",
      text: "x + y",
      spellcheck: false
    }],
    output: null,
    style: "raw_blocks",
    tooltip: "Evaluates exact text string as a value"
  },
  {
    type: "raw_python_multiline",
    message0: "Raw Block \n %1",
    args0: [{
      type: "field_multilinetext",
      name: "CODE",
      text: "def custom_func():\n    pass",
      spellcheck: false
    }],
    previousStatement: null,
    nextStatement: null,
    style: "raw_blocks",
    tooltip: "Dumps multi-line exact text string to Python code"
  },
  {
    type: "python_input",
    message0: "ask user for input with prompt %1",
    args0: [
      { type: "input_value", name: "PROMPT", check: "String" }
    ],
    output: "String",
    style: "io_blocks",
    tooltip: "Displays a message and waits for the user to type something in the console."
  },
  {
    type: "python_type",
    message0: "type of %1",
    args0: [{ type: "input_value", name: "VALUE" }],
    output: null,
    colour: "#c1a0e8",
    tooltip: "Returns the type of the given value"
  },
  {
    type: "python_type_primitive",
    message0: "type %1",
    args0: [{
      type: "field_dropdown",
      name: "TYPE",
      options: [
        ["int", "int"], ["float", "float"], ["str", "str"],
        ["list", "list"], ["dict", "dict"], ["bool", "bool"],
        ["tuple", "tuple"], ["set", "set"]
      ]
    }],
    output: null,
    colour: "#c1a0e8",
    tooltip: "Python primitive types"
  },
  {
    type: "python_isinstance",
    message0: "is %1 a %2?",
    args0: [
      { type: "input_value", name: "VALUE" },
      { type: "input_value", name: "TYPE" }
    ],
    inputsInline: true,
    output: "Boolean",
    colour: "#c1a0e8",
    tooltip: "Checks if a value is of a specific type"
  },
  {
    type: "text_multiply",
    message0: "repeat text %1 %2 times",
    args0: [
      { type: "input_value", name: "TEXT", check: "String" },
      { type: "input_value", name: "MULTIPLIER", check: "Number" }
    ],
    inputsInline: true,
    output: "String",
    colour: "#d5a52a",
    tooltip: "Repeats a string a given number of times"
  },
  {
    type: "text_newline",
    message0: "Line Break",
    output: "String",
    colour: "#d5a52a",
    tooltip: "Returns a newline character"
  },
  {
    type: "list_append",
    message0: "append %1 to list %2",
    args0: [
      { type: "input_value", name: "ITEM" },
      { type: "input_value", name: "LIST", check: "Array" }
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: "list_blocks",
    tooltip: "Appends an item to the end of a list"
  },
  {
    type: "list_count",
    message0: "count occurrences of %1 in list %2",
    args0: [
      { type: "input_value", name: "ITEM" },
      { type: "input_value", name: "LIST", check: "Array" }
    ],
    inputsInline: true,
    output: "Number",
    style: "list_blocks",
    tooltip: "Counts how many times an item appears in a list."
  },
  {
    type: "list_reverse",
    message0: "reverse list %1",
    args0: [{ type: "input_value", name: "LIST", check: "Array" }],
    previousStatement: null,
    nextStatement: null,
    style: "list_blocks",
    tooltip: "Reverses the items of a list in place."
  },
  {
    type: "list_clear",
    message0: "clear all items from %1",
    args0: [{ type: "input_value", name: "LIST" }],
    previousStatement: null,
    nextStatement: null,
    style: "list_blocks",
    tooltip: "Removes all elements from the list or dictionary."
  },
  {
    type: "list_range",
    message0: "create list from %1 to %2 (exclusive)",
    args0: [
      { type: "input_value", name: "START", check: "Number" },
      { type: "input_value", name: "END", check: "Number" }
    ],
    inputsInline: true,
    output: "Array",
    style: "list_blocks",
    tooltip: "Creates a list of numbers from start to end"
  },
  {
    type: "variable_swap",
    message0: "swap variable %1 and %2",
    args0: [
      { type: "field_variable", name: "VAR1", variable: "a" },
      { type: "field_variable", name: "VAR2", variable: "b" }
    ],
    previousStatement: null,
    nextStatement: null,
    style: "variable_blocks",
    tooltip: "Swaps the values of two variables"
  },
  {
    type: "logic_in",
    message0: "%1 is in %2",
    args0: [
      { type: "input_value", name: "ITEM" },
      { type: "input_value", name: "COLLECTION" }
    ],
    inputsInline: true,
    output: "Boolean",
    colour: "#c1a0e8",
    tooltip: "Checks if an item exists within a collection."
  },
  {
    type: "list_slice_advanced",
    message0: "slice list %1 from index %2 to %3",
    args0: [
      { type: "input_value", name: "LIST", check: "Array" },
      { type: "input_value", name: "START" },
      { type: "input_value", name: "END" }
    ],
    inputsInline: true,
    output: "Array",
    style: "list_blocks",
    tooltip: "Python list slicing. Leave inputs blank to default to the beginning or end of the list."
  },
  {
    type: "list_concat",
    message0: "join list %1 and list %2",
    args0: [
      { type: "input_value", name: "LIST1", check: "Array" },
      { type: "input_value", name: "LIST2", check: "Array" }
    ],
    inputsInline: true,
    output: "Array",
    style: "list_blocks",
    tooltip: "Concatenates two arrays together."
  },
  {
    type: "list_remove_value",
    message0: "remove first occurrence of %1 from list %2",
    args0: [
      { type: "input_value", name: "ITEM" },
      { type: "input_value", name: "LIST", check: "Array" }
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: "list_blocks",
    tooltip: "Removes the first matching value from an array."
  },
  {
    type: "list_pop",
    message0: "remove and get last item from list %1",
    args0: [{ type: "input_value", name: "LIST", check: "Array" }],
    output: null,
    style: "list_blocks",
    tooltip: "Removes the last item from a list and returns it."
  },
  {
    type: "list_pop_statement",
    message0: "remove last item from list %1",
    args0: [{ type: "input_value", name: "LIST", check: "Array" }],
    previousStatement: null,
    nextStatement: null,
    style: "list_blocks",
    tooltip: "Removes the last item from a list without returning it."
  },
  {
    type: "dict_keys_values",
    message0: "get %1 from dict %2",
    args0: [
      { type: "field_dropdown", name: "OP", options: [["keys", "keys"], ["values", "values"], ["items", "items"]] },
      { type: "input_value", name: "DICT" }
    ],
    inputsInline: true,
    output: "Array",
    style: "dict_blocks",
    tooltip: "Returns the keys, values, or items from a dictionary as a list."
  },
  {
    type: "controls_pass",
    message0: "pass",
    previousStatement: null,
    nextStatement: null,
    colour: "#8bcf8b",
    tooltip: "The pass statement does nothing. Used as a placeholder."
  },
  {
    type: "list_sort",
    message0: "sort list %1 %2",
    args0: [
      { type: "input_value", name: "LIST", check: "Array" },
      { type: "field_dropdown", name: "REVERSE", options: [["in ascending order", "FALSE"], ["in descending order", "TRUE"]] }
    ],
    previousStatement: null,
    nextStatement: null,
    style: "list_blocks",
    tooltip: "Sorts the list in-place."
  },
  {
    type: "list_sorted",
    message0: "get sorted copy of list %1 %2",
    args0: [
      { type: "input_value", name: "LIST", check: "Array" },
      { type: "field_dropdown", name: "REVERSE", options: [["in ascending order", "FALSE"], ["in descending order", "TRUE"]] }
    ],
    output: "Array",
    style: "list_blocks",
    tooltip: "Returns a new sorted list from the given list."
  },
  {
    type: "list_insert",
    message0: "insert %1 at index %2 in list %3",
    args0: [
      { type: "input_value", name: "ITEM" },
      { type: "input_value", name: "INDEX", check: "Number" },
      { type: "input_value", name: "LIST", check: "Array" }
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: "list_blocks",
    tooltip: "Inserts an item into a list at a specified index."
  },
  {
    type: "string_split",
    message0: "split string %1 by delimiter %2",
    args0: [
      { type: "input_value", name: "STRING", check: "String" },
      { type: "input_value", name: "DELIMITER", check: "String" }
    ],
    inputsInline: true,
    output: "Array",
    colour: "#d5a52a",
    tooltip: "Splits a string into a list using the given delimiter."
  },
  {
    type: "math_abs_round",
    message0: "%1 of %2",
    args0: [
      { type: "field_dropdown", name: "OP", options: [["absolute value", "abs"], ["round", "round"]] },
      { type: "input_value", name: "VALUE", check: "Number" }
    ],
    output: "Number",
    colour: "#4C97FF",
    tooltip: "Calculates the absolute value or rounds a number."
  },
  {
    type: "type_cast_advanced",
    message0: "convert %1 to %2",
    args0: [
      { type: "input_value", name: "VALUE" },
      { type: "field_dropdown", name: "TYPE", options: [["float", "float"], ["boolean", "bool"], ["string", "str"], ["list", "list"]] }
    ],
    inputsInline: true,
    output: null,
    colour: "#c1a0e8",
    tooltip: "Converts a value to the specified type."
  },
  {
    type: "string_case_formatting",
    message0: "convert text %1 to %2",
    args0: [
      { type: "input_value", name: "STRING", check: "String" },
      { type: "field_dropdown", name: "CASE", options: [["UPPERCASE", "upper"], ["lowercase", "lower"], ["Title Case", "title"], ["Capitalized", "capitalize"]] }
    ],
    inputsInline: true,
    output: "String",
    colour: "#d5a52a",
    tooltip: "Converts text to uppercase, lowercase, title case, or capitalized."
  },
  {
    type: "stack_push",
    message0: "push %1 to stack %2",
    args0: [
      { type: "input_value", name: "ITEM" },
      { type: "input_value", name: "STACK", check: "Array" }
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: "stack_queue_blocks",
    tooltip: "Pushes an item onto the top of the stack (equivalent to list.append)."
  },
  {
    type: "stack_pop",
    message0: "pop and get top of stack %1",
    args0: [{ type: "input_value", name: "STACK", check: "Array" }],
    output: null,
    style: "stack_queue_blocks",
    tooltip: "Pops the top item off the stack and returns it (equivalent to list.pop())."
  },
  {
    type: "stack_pop_statement",
    message0: "pop from stack %1",
    args0: [{ type: "input_value", name: "STACK", check: "Array" }],
    previousStatement: null,
    nextStatement: null,
    style: "stack_queue_blocks",
    tooltip: "Pops the top item off the stack."
  },
  {
    type: "stack_peek",
    message0: "peek top of stack %1",
    args0: [{ type: "input_value", name: "STACK", check: "Array" }],
    output: null,
    style: "stack_queue_blocks",
    tooltip: "Returns the top item of the stack without removing it."
  },
  {
    type: "queue_enqueue",
    message0: "enqueue %1 to queue %2",
    args0: [
      { type: "input_value", name: "ITEM" },
      { type: "input_value", name: "QUEUE", check: "Array" }
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: "stack_queue_blocks",
    tooltip: "Adds an item to the back of the queue (equivalent to list.append)."
  },
  {
    type: "queue_dequeue",
    message0: "dequeue and get front of queue %1",
    args0: [{ type: "input_value", name: "QUEUE", check: "Array" }],
    output: null,
    style: "stack_queue_blocks",
    tooltip: "Removes and returns the front item of the queue (equivalent to list.pop(0))."
  },
  {
    type: "queue_dequeue_statement",
    message0: "dequeue from queue %1",
    args0: [{ type: "input_value", name: "QUEUE", check: "Array" }],
    previousStatement: null,
    nextStatement: null,
    style: "stack_queue_blocks",
    tooltip: "Removes the front item of the queue."
  },
  {
    type: "queue_peek",
    message0: "peek front of queue %1",
    args0: [{ type: "input_value", name: "QUEUE", check: "Array" }],
    output: null,
    style: "stack_queue_blocks",
    tooltip: "Returns the front item of the queue without removing it."
  }
];

if (Blockly.common && Blockly.common.defineBlocksWithJsonArray) {
  Blockly.common.defineBlocksWithJsonArray(customBlocks);
} else {
  Blockly.defineBlocksWithJsonArray(customBlocks);
}

const toolbox = {
  kind: "categoryToolbox",
  contents: [
    { kind: "search", name: "Search", contents: [] },
    {
      kind: "category",
      name: "Logic",
      categorystyle: "logic_category",
      contents: [
        { kind: "block", type: "controls_if" },
        { kind: "block", type: "logic_compare" },
        { kind: "block", type: "logic_operation" },
        { kind: "block", type: "logic_in" },
        { kind: "block", type: "logic_negate" },
        { kind: "block", type: "logic_boolean" },
        { kind: "block", type: "logic_null" },
        { kind: "block", type: "logic_ternary" },
        { kind: "block", type: "procedure_return_value" },
        { kind: "block", type: "python_type" },
        { kind: "block", type: "python_type_primitive" },
        { kind: "block", type: "python_isinstance" },
        { kind: "block", type: "type_cast_advanced" }
      ]
    },
    {
      kind: "category",
      name: "Loops",
      categorystyle: "loop_category",
      contents: [
        { kind: "block", type: "controls_repeat_ext", inputs: { TIMES: { shadow: { type: "math_number", fields: { NUM: 10 } } } } },
        { kind: "block", type: "controls_whileUntil" },
        {
          kind: "block", type: "controls_for", inputs: {
            FROM: { shadow: { type: "math_number", fields: { NUM: 1 } } },
            TO: { shadow: { type: "math_number", fields: { NUM: 10 } } },
            BY: { shadow: { type: "math_number", fields: { NUM: 1 } } }
          }
        },
        { kind: "block", type: "controls_forEach" },
        { kind: "block", type: "controls_flow_statements" },
        { kind: "block", type: "controls_pass" }
      ]
    },
    {
      kind: "category",
      name: "Math",
      categorystyle: "math_category",
      contents: [
        { kind: "block", type: "math_number", fields: { NUM: 1 } },
        {
          kind: "block", type: "math_arithmetic", inputs: {
            A: { shadow: { type: "math_number", fields: { NUM: 1 } } },
            B: { shadow: { type: "math_number", fields: { NUM: 1 } } }
          }
        },
        { kind: "block", type: "math_advanced_operators" },
        { kind: "block", type: "math_assignment", inputs: { DELTA: { shadow: { type: "math_number", fields: { NUM: 1 } } } } },
        { kind: "block", type: "type_cast_int" },
        { kind: "block", type: "math_min_max" },
        { kind: "block", type: "math_abs_round" },
        { kind: "block", type: "math_single" },
        { kind: "block", type: "math_trig" },
        { kind: "block", type: "math_constant" },
        { kind: "block", type: "math_number_property" },
        { kind: "block", type: "math_round" },
        { kind: "block", type: "math_on_list" },
        { kind: "block", type: "math_modulo" },
        {
          kind: "block", type: "math_constrain", inputs: {
            LOW: { shadow: { type: "math_number", fields: { NUM: 1 } } },
            HIGH: { shadow: { type: "math_number", fields: { NUM: 100 } } }
          }
        },
        {
          kind: "block", type: "math_random_int", inputs: {
            FROM: { shadow: { type: "math_number", fields: { NUM: 1 } } },
            TO: { shadow: { type: "math_number", fields: { NUM: 100 } } }
          }
        },
        { kind: "block", type: "math_random_float" }
      ]
    },
    {
      kind: "category",
      name: "Text",
      categorystyle: "text_category",
      contents: [
        { kind: "block", type: "comment_block" },
        { kind: "block", type: "multi_line_comment" },
        { kind: "block", type: "text" },
        { kind: "block", type: "text_newline" },
        { kind: "block", type: "text_multiply", inputs: { MULTIPLIER: { shadow: { type: "math_number", fields: { NUM: 2 } } } } },
        { kind: "block", type: "custom_string_join" },
        { kind: "block", type: "string_split" },
        { kind: "block", type: "string_case_formatting" },
        { kind: "block", type: "text_join" },
        { kind: "block", type: "text_append" },
        { kind: "block", type: "text_length" },
        { kind: "block", type: "text_isEmpty" },
        { kind: "block", type: "text_indexOf" },
        { kind: "block", type: "text_charAt" },
        { kind: "block", type: "text_getSubstring" },
        { kind: "block", type: "text_changeCase" },
        { kind: "block", type: "text_trim" }
      ]
    },
    {
      kind: "category",
      name: "Input / Output",
      categorystyle: "io_category",
      contents: [
        { kind: "block", type: "text_print" },
        {
          kind: "block",
          type: "python_input",
          inputs: {
            PROMPT: { shadow: { type: "text", fields: { TEXT: "Enter your name: " } } }
          }
        }
      ]
    },
    {
      kind: "category",
      name: "Lists (Built-in Type)",
      categorystyle: "list_category",
      contents: [
        { kind: "block", type: "string_to_list" },
        { kind: "block", type: "lists_create_with", extraState: { itemCount: 0 } },
        { kind: "block", type: "lists_create_with" },
        { kind: "block", type: "list_append" },
        { kind: "block", type: "list_concat" },
        { kind: "block", type: "list_remove_value" },
        { kind: "block", type: "list_pop" },
        { kind: "block", type: "list_pop_statement" },
        { kind: "block", type: "list_slice_advanced" },
        { kind: "block", type: "list_sort" },
        { kind: "block", type: "list_sorted" },
        { kind: "block", type: "list_reverse" },
        { kind: "block", type: "list_clear" },
        { kind: "block", type: "list_insert" },
        { kind: "block", type: "list_count" },
        {
          kind: "block", type: "list_range", inputs: {
            START: { shadow: { type: "math_number", fields: { NUM: 1 } } },
            END: { shadow: { type: "math_number", fields: { NUM: 10 } } }
          }
        },
        { kind: "block", type: "lists_repeat", inputs: { NUM: { shadow: { type: "math_number", fields: { NUM: 5 } } } } },
        { kind: "block", type: "lists_length" },
        { kind: "block", type: "lists_isEmpty" },
        { kind: "block", type: "lists_indexOf" },
        { kind: "block", type: "lists_getIndex" },
        { kind: "block", type: "lists_setIndex" },
        { kind: "block", type: "lists_getSublist" },
        { kind: "block", type: "lists_split" },
        { kind: "block", type: "lists_sort" }
      ]
    },
    {
      kind: "category",
      name: "Dictionaries (Built-in Type)",
      categorystyle: "dict_category",
      contents: [
        { kind: "block", type: "dict_create_empty" },
        {
          kind: "block", type: "dict_set", inputs: {
            KEY: { shadow: { type: "text", fields: { TEXT: "key_name" } } },
            VALUE: { shadow: { type: "text", fields: { TEXT: "value" } } }
          }
        },
        {
          kind: "block", type: "dict_get", inputs: {
            KEY: { shadow: { type: "text", fields: { TEXT: "key_name" } } }
          }
        },
        { kind: "block", type: "dict_pop" },
        { kind: "block", type: "list_clear" },
        { kind: "block", type: "dict_keys_values" },
        {
          kind: "block", type: "dict_from_pairs", inputs: {
            LIST: { block: { type: "lists_create_with", extraState: { itemCount: 2 } } }
          }
        },
        {
          kind: "block", type: "dict_pair", inputs: {
            KEY: { shadow: { type: "text", fields: { TEXT: "key_name" } } },
            VALUE: { shadow: { type: "text", fields: { TEXT: "value" } } }
          }
        }
      ]
    },
    {
      kind: "category",
      name: "Sets & Tuples (Core Built-in Types)",
      categorystyle: "set_tuple_category",
      contents: [
        { kind: "block", type: "tuple_create" },
        { kind: "block", type: "set_create_empty" },
        { kind: "block", type: "set_from_list" },
        { kind: "block", type: "set_add" },
        { kind: "block", type: "set_remove" },
        { kind: "block", type: "set_operations" }
      ]
    },
    {
      kind: "category",
      name: "Stacks & Queues (Abstract Data Types)",
      categorystyle: "stack_queue_category",
      contents: [
        { kind: "block", type: "stack_push" },
        { kind: "block", type: "stack_pop" },
        { kind: "block", type: "stack_pop_statement" },
        { kind: "block", type: "stack_peek" },
        { kind: "block", type: "queue_enqueue" },
        { kind: "block", type: "queue_dequeue" },
        { kind: "block", type: "queue_dequeue_statement" },
        { kind: "block", type: "queue_peek" }
      ]
    },
    {
      kind: "category",
      name: "Variables",
      categorystyle: "variable_category",
      contents: [
        { kind: "button", text: "Create variable...", callbackKey: "createVariable" },
        { kind: "block", type: "variable_swap" }
      ],
      custom: "VARIABLE"
    },
    { kind: "category", name: "Functions", categorystyle: "procedure_category", custom: "PROCEDURE" },
    {
      kind: "category",
      name: "Raw Python",
      categorystyle: "raw_category",
      contents: [
        { kind: "block", type: "raw_python_statement" },
        { kind: "block", type: "raw_python_expression" },
        { kind: "block", type: "raw_python_multiline" }
      ]
    }
  ]
};

const BlocklyWorkspace = forwardRef(({ onChange, syntaxError }, ref) => {
  const blocklyDiv = useRef(null);
  const workspace = useRef(null);
  const onChangeRef = useRef(onChange);

  useImperativeHandle(ref, () => ({
    clear: () => {
      if (workspace.current) {
        Blockly.Events.disable();
        try {
          workspace.current.clear();
        } finally {
          Blockly.Events.enable();
        }
      }
    },
    loadTemplate: (json, preservePythonCode = undefined) => {
      if (workspace.current) {
        try {
          workspace.current.clear();
          if (json && Object.keys(json).length > 0) {
            Blockly.serialization.workspaces.load(json, workspace.current);
          }
        } catch (err) {
          console.error("Error loading workspace JSON:", err);
        }

        setTimeout(() => {
          const code = pythonGenerator.workspaceToCode(workspace.current);
          const currentJson = Blockly.serialization.workspaces.save(workspace.current);

          // FIX: Compare preserved custom code with block-generated code on boot
          if (preservePythonCode !== undefined && preservePythonCode !== null) {
            const isUnsynced = preservePythonCode.trim() !== code.trim() && preservePythonCode !== "# Drag blocks to generate Python code";
            if (onChangeRef.current) onChangeRef.current(currentJson, preservePythonCode, isUnsynced);
          } else {
            if (onChangeRef.current) onChangeRef.current(currentJson, code, false);
          }
        }, 100);
      }
    },

    setTheme: (themeName) => {
      if (workspace.current) {
        workspace.current.setTheme(themeName === 'dark' ? DarkTheme : pastelTheme);
      }
    },

    loadFromPython: async (pythonCode) => {
      if (!workspace.current) return;
      try {
        const data = await convertPythonToBlocks(pythonCode);
        if (data.status === "error") throw new Error(data.message || "Failed to parse Python code.");
        Blockly.Events.disable();
        try {
          workspace.current.clear();
          if (data.status === "success" && data.blocks) {
            Blockly.serialization.workspaces.load(data.blocks, workspace.current);
          }
        } finally {
          Blockly.Events.enable();
        }

        // --- FIXED: Preserve original code instead of overwriting ---
        setTimeout(() => {
          if (workspace.current) {
            const currentJson = Blockly.serialization.workspaces.save(workspace.current);

            // Do NOT call workspaceToCode() here! It causes a lossy round-trip 
            // that destroys the user's handwritten Python formatting and syntax.
            // Instead, pass the original `pythonCode` back to the state:
            if (onChangeRef.current) onChangeRef.current(currentJson, pythonCode);
          }
        }, 100);
        // ----------------------------------------------------------

      } catch (error) {
        console.error("AST Parsing failed:", error.message);
        throw error;
      }
    },
    resize: () => {
      if (workspace.current) {
        Blockly.svgResize(workspace.current);
        workspace.current.markFocused();
      }
    }
  }));

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (workspace.current) return;

    let searchPlugin, minimapPlugin, modalPlugin, backpackPlugin, highlightPlugin;
    let minimapDelay;

    if (!crossTabPluginInitialized) {
      try {
        const crossTabPlugin = new CrossTabCopyPaste();
        crossTabPlugin.init({ contextMenu: true, shortcut: true });
        crossTabPluginInitialized = true;
      } catch (e) {
        console.warn("CrossTabCopyPaste init skipped:", e.message);
      }
    }

    if (blocklyDiv.current) {
      if (Blockly.ShortcutRegistry.registry.getRegistry()['startSearch']) {
        Blockly.ShortcutRegistry.registry.unregister('startSearch');
      }

      Blockly.Variables.flyoutCategory = function (workspace) {
        let xmlList = new Array();
        let button = document.createElement('button');
        button.setAttribute('text', 'Create variable...');
        button.setAttribute('callbackKey', 'CREATE_VARIABLE');
        workspace.registerButtonCallback('CREATE_VARIABLE', function (button) {
          Blockly.Variables.createVariableButtonHandler(button.getTargetWorkspace());
        });
        xmlList.push(button);

        let block = document.createElement('block');
        block.setAttribute('type', 'variable_swap');
        xmlList.push(block);

        let blockList = Blockly.Variables.flyoutCategoryBlocks(workspace);
        xmlList = xmlList.concat(blockList);
        return xmlList;
      };

      workspace.current = Blockly.inject(blocklyDiv.current, {
        toolbox: toolbox,
        trashcan: true,
        move: { scrollbars: true, drag: true, wheel: true },
        zoom: { controls: true, wheel: true, startScale: 1.0, maxScale: 3, minScale: 0.3, scaleSpeed: 1.2 },
        renderer: "geras",
        theme: pastelTheme,
        grid: { spacing: 25, length: 3, colour: '#6e6e6e', snap: true }
      });

      try {
        searchPlugin = new WorkspaceSearch(workspace.current);
        searchPlugin.init();
        modalPlugin = new Modal(workspace.current);
        modalPlugin.init();
        backpackPlugin = new Backpack(workspace.current);
        backpackPlugin.init();
        highlightPlugin = new ContentHighlight(workspace.current);
        highlightPlugin.init();
        workspace.current.addChangeListener(shadowBlockConversionChangeListener);
      } catch (e) {
        console.warn("Plugin init skipped:", e.message);
      }

      minimapDelay = setTimeout(() => {
        if (workspace.current && blocklyDiv.current) {
          Blockly.svgResize(workspace.current);
          try {
            minimapPlugin = new PositionedMinimap(workspace.current);
            minimapPlugin.init();
          } catch (e) {
            console.warn("Minimap instance skipped:", e.message);
          }
        }
      }, 150);

      if (!pythonGenerator.__originalInit) {
        pythonGenerator.__originalInit = pythonGenerator.init;
        pythonGenerator.init = function (workspace) {
          pythonGenerator.INDENT = "    ";
          pythonGenerator.__originalInit.call(this, workspace);
          if (this.definitions_['variables']) delete this.definitions_['variables'];
        };
      }

      if (!pythonGenerator.__originalFinish) {
        pythonGenerator.__originalFinish = pythonGenerator.finish;
        pythonGenerator.finish = function (code) {
          let finalCode = pythonGenerator.__originalFinish.call(this, code);
          finalCode = finalCode.replace(/^[ \t]*global[ \t]+.*\n?/gm, '');
          finalCode = finalCode.replace(/^[ \t]*"""Describe this function\.\.\."""\n?/gm, '');
          finalCode = finalCode.replace(/^[ \t]*# Describe this function\.\.\.\n?/gm, '');
          finalCode = finalCode.replace(/([^\n])\n+(def )/g, '$1\n\n\n$2');
          finalCode = finalCode.replace(/([^:\n][ \t]*)\n+([ \t]*(?:for |while |if |return |#))/g, '$1\n\n$2');
          finalCode = finalCode.replace(/\n{4,}/g, '\n\n\n');
          return finalCode.trim() + '\n';
        };
      }

      pythonGenerator.forBlock['math_assignment'] = function (block) {
        const variable = pythonGenerator.getVariableName(block.getFieldValue('VAR'));
        const operator = block.getFieldValue('OP');
        const value = pythonGenerator.valueToCode(block, 'DELTA', pythonGenerator.ORDER_ATOMIC) || '0';
        let symbol = "+=";
        if (operator === "MINUS") symbol = "-=";
        else if (operator === "MULTIPLY") symbol = "*=";
        else if (operator === "DIVIDE") symbol = "/=";
        return `${variable} ${symbol} ${value}\n`;
      };

      pythonGenerator.forBlock['controls_for'] = function (block) {
        const variable = pythonGenerator.getVariableName(block.getFieldValue('VAR'));
        const from = pythonGenerator.valueToCode(block, 'FROM', pythonGenerator.ORDER_NONE) || '0';
        const to = pythonGenerator.valueToCode(block, 'TO', pythonGenerator.ORDER_NONE) || '0';
        const step = pythonGenerator.valueToCode(block, 'BY', pythonGenerator.ORDER_NONE) || '1';
        let rangeCode;
        if (step.trim() === '1') rangeCode = from.trim() === '0' ? `range(${to})` : `range(${from}, ${to})`;
        else rangeCode = `range(${from}, ${to}, ${step})`;
        let branch = pythonGenerator.statementToCode(block, 'DO') || pythonGenerator.PASS;
        return `for ${variable} in ${rangeCode}:\n${branch}`;
      };

      pythonGenerator.forBlock['lists_getIndex'] = function (block) {
        const mode = block.getFieldValue('MODE') || 'GET';
        const where = block.getFieldValue('WHERE') || 'FROM_START';
        const list = pythonGenerator.valueToCode(block, 'VALUE', pythonGenerator.ORDER_MEMBER) || '[]';
        let indexCode = '0';
        if (where === 'FIRST') indexCode = '0';
        else if (where === 'LAST') indexCode = '-1';
        else if (where === 'FROM_START') indexCode = pythonGenerator.valueToCode(block, 'AT', pythonGenerator.ORDER_NONE) || '0';
        else if (where === 'FROM_END') {
          const at = pythonGenerator.valueToCode(block, 'AT', pythonGenerator.ORDER_NONE) || '1';
          indexCode = '-' + at;
        }
        if (mode === 'GET_REMOVE') {
          if (where === 'LAST') return [`${list}.pop()`, pythonGenerator.ORDER_FUNCTION_CALL];
          return [`${list}.pop(${indexCode})`, pythonGenerator.ORDER_FUNCTION_CALL];
        }
        if (mode === 'REMOVE') {
          if (where === 'LAST') return `${list}.pop()\n`;
          return `${list}.pop(${indexCode})\n`;
        }
        return [`${list}[${indexCode}]`, pythonGenerator.ORDER_MEMBER];
      };

      pythonGenerator.forBlock['lists_setIndex'] = function (block) {
        const list = pythonGenerator.valueToCode(block, 'LIST', pythonGenerator.ORDER_MEMBER) || '[]';
        const mode = block.getFieldValue('MODE') || 'SET';
        const where = block.getFieldValue('WHERE') || 'FROM_START';
        const value = pythonGenerator.valueToCode(block, 'TO', pythonGenerator.ORDER_NONE) || 'None';

        if (mode === 'INSERT') {
          if (where === 'LAST') return `${list}.append(${value})\n`;
          else if (where === 'FIRST') return `${list}.insert(0, ${value})\n`;
          else if (where === 'FROM_START') {
            const at = pythonGenerator.valueToCode(block, 'AT', pythonGenerator.ORDER_NONE) || '0';
            return `${list}.insert(${at}, ${value})\n`;
          } else if (where === 'FROM_END') {
            const at = pythonGenerator.valueToCode(block, 'AT', pythonGenerator.ORDER_NONE) || '1';
            return `${list}.insert(-${at}, ${value})\n`;
          }
        }
        let indexCode = '0';
        if (where === 'FIRST') indexCode = '0';
        else if (where === 'LAST') indexCode = '-1';
        else if (where === 'FROM_START') indexCode = pythonGenerator.valueToCode(block, 'AT', pythonGenerator.ORDER_NONE) || '0';
        else if (where === 'FROM_END') {
          const at = pythonGenerator.valueToCode(block, 'AT', pythonGenerator.ORDER_NONE) || '1';
          indexCode = '-' + at;
        }
        return `${list}[${indexCode}] = ${value}\n`;
      };

      pythonGenerator.forBlock['procedure_return_value'] = function (block) {
        const value = pythonGenerator.valueToCode(block, 'VALUE', pythonGenerator.ORDER_NONE) || 'None';
        return `return ${value}\n`;
      };

      pythonGenerator.forBlock['custom_string_join'] = function (block) {
        const list = pythonGenerator.valueToCode(block, 'LIST', pythonGenerator.ORDER_NONE) || '[]';
        const delimiter = pythonGenerator.valueToCode(block, 'DELIMITER', pythonGenerator.ORDER_MEMBER) || "''";
        return [`${delimiter}.join(${list})`, pythonGenerator.ORDER_FUNCTION_CALL];
      };

      pythonGenerator.forBlock['string_to_list'] = function (block) {
        const stringVal = pythonGenerator.valueToCode(block, 'STRING', pythonGenerator.ORDER_NONE) || "''";
        return [`list(${stringVal})`, pythonGenerator.ORDER_FUNCTION_CALL];
      };

      pythonGenerator.forBlock['type_cast_int'] = function (block) {
        const value = pythonGenerator.valueToCode(block, 'VALUE', pythonGenerator.ORDER_NONE) || '0';
        return [`int(${value})`, pythonGenerator.ORDER_FUNCTION_CALL];
      };

      pythonGenerator.forBlock['math_advanced_operators'] = function (block) {
        const operator = block.getFieldValue('OP');
        let opSymbol = '';
        let order = pythonGenerator.ORDER_NONE;

        switch (operator) {
          case 'FLOOR_DIV': opSymbol = '//'; order = pythonGenerator.ORDER_MULTIPLICATIVE; break;
          case 'POWER': opSymbol = '**'; order = pythonGenerator.ORDER_EXPONENTIATION; break;
          case 'RSHIFT': opSymbol = '>>'; order = pythonGenerator.ORDER_BITWISE_SHIFT; break;
          case 'LSHIFT': opSymbol = '<<'; order = pythonGenerator.ORDER_BITWISE_SHIFT; break;
          case 'BIT_AND': opSymbol = '&'; order = pythonGenerator.ORDER_BITWISE_AND; break;
          case 'BIT_OR': opSymbol = '|'; order = pythonGenerator.ORDER_BITWISE_OR; break;
        }
        const a = pythonGenerator.valueToCode(block, 'A', order) || '0';
        const b = pythonGenerator.valueToCode(block, 'B', order) || '0';
        return [`${a} ${opSymbol} ${b}`, order];
      };

      pythonGenerator.forBlock['math_min_max'] = function (block) {
        const op = block.getFieldValue('OP') === 'MAX' ? 'max' : 'min';
        const a = pythonGenerator.valueToCode(block, 'A', pythonGenerator.ORDER_NONE) || '0';
        const b = pythonGenerator.valueToCode(block, 'B', pythonGenerator.ORDER_NONE) || '0';
        return [`${op}(${a}, ${b})`, pythonGenerator.ORDER_FUNCTION_CALL];
      };

      pythonGenerator.forBlock['comment_block'] = function (block) {
        const text = block.getFieldValue('TEXT') || '';
        return `# ${text}\n`;
      };

      pythonGenerator.forBlock['text_join'] = function (block) {
        const itemCount = block.itemCount_;
        let fStringContent = "";
        for (let i = 0; i < itemCount; i++) {
          let elementCode = pythonGenerator.valueToCode(block, 'ADD' + i, pythonGenerator.ORDER_NONE);
          if (!elementCode) continue;
          if (elementCode.startsWith("'") && elementCode.endsWith("'")) fStringContent += elementCode.slice(1, -1);
          else fStringContent += `{${elementCode}}`;
        }
        return [`f"${fStringContent}"`, pythonGenerator.ORDER_ATOMIC];
      };

      pythonGenerator.forBlock['dict_create_empty'] = function (block) {
        return ['{}', pythonGenerator.ORDER_ATOMIC];
      };

      pythonGenerator.forBlock['dict_set'] = function (block) {
        const dict = pythonGenerator.valueToCode(block, 'DICT', pythonGenerator.ORDER_MEMBER) || '{}';
        const key = pythonGenerator.valueToCode(block, 'KEY', pythonGenerator.ORDER_NONE) || '""';
        const value = pythonGenerator.valueToCode(block, 'VALUE', pythonGenerator.ORDER_NONE) || 'None';
        return `${dict}[${key}] = ${value}\n`;
      };

      pythonGenerator.forBlock['dict_get'] = function (block) {
        const dict = pythonGenerator.valueToCode(block, 'DICT', pythonGenerator.ORDER_MEMBER) || '{}';
        const key = pythonGenerator.valueToCode(block, 'KEY', pythonGenerator.ORDER_NONE) || '""';
        return [`${dict}[${key}]`, pythonGenerator.ORDER_MEMBER];
      };

      pythonGenerator.forBlock['multi_line_comment'] = function (block) {
        const text = block.getFieldValue('TEXT') || '';
        return `"""\n${text}\n"""\n`;
      };

      pythonGenerator.forBlock['dict_pair'] = function (block) {
        const key = pythonGenerator.valueToCode(block, 'KEY', pythonGenerator.ORDER_NONE) || '""';
        const value = pythonGenerator.valueToCode(block, 'VALUE', pythonGenerator.ORDER_NONE) || 'None';
        return [`${key}: ${value}`, pythonGenerator.ORDER_NONE];
      };

      pythonGenerator.forBlock['dict_from_pairs'] = function (block) {
        const listBlock = block.getInputTargetBlock('LIST');
        if (!listBlock || listBlock.type !== 'lists_create_with') return ['{}', pythonGenerator.ORDER_ATOMIC];
        let pairs = [];
        for (let i = 0; i < listBlock.itemCount_; i++) {
          let pairCode = pythonGenerator.valueToCode(listBlock, 'ADD' + i, pythonGenerator.ORDER_NONE);
          if (pairCode) pairs.push(pairCode);
        }
        if (pairs.length === 0) return ['{}', pythonGenerator.ORDER_ATOMIC];
        const code = '{\n    ' + pairs.join(',\n    ') + '\n}';
        return [code, pythonGenerator.ORDER_ATOMIC];
      };

      pythonGenerator.forBlock['dict_pop'] = function (block) {
        const key = pythonGenerator.valueToCode(block, 'KEY', pythonGenerator.ORDER_NONE) || '""';
        const dict = pythonGenerator.valueToCode(block, 'DICT', pythonGenerator.ORDER_MEMBER) || '{}';
        return [`${dict}.pop(${key})`, pythonGenerator.ORDER_FUNCTION_CALL];
      };

      pythonGenerator.forBlock['set_create_empty'] = function (block) {
        return ['set()', pythonGenerator.ORDER_FUNCTION_CALL];
      };

      pythonGenerator.forBlock['set_from_list'] = function (block) {
        const list = pythonGenerator.valueToCode(block, 'LIST', pythonGenerator.ORDER_NONE) || '[]';
        return [`set(${list})`, pythonGenerator.ORDER_FUNCTION_CALL];
      };

      pythonGenerator.forBlock['set_add'] = function (block) {
        const item = pythonGenerator.valueToCode(block, 'ITEM', pythonGenerator.ORDER_NONE) || 'None';
        const setVal = pythonGenerator.valueToCode(block, 'SET', pythonGenerator.ORDER_MEMBER) || 'set()';
        return `${setVal}.add(${item})\n`;
      };

      pythonGenerator.forBlock['set_remove'] = function (block) {
        const item = pythonGenerator.valueToCode(block, 'ITEM', pythonGenerator.ORDER_NONE) || 'None';
        const setVal = pythonGenerator.valueToCode(block, 'SET', pythonGenerator.ORDER_MEMBER) || 'set()';
        return `${setVal}.remove(${item})\n`;
      };

      pythonGenerator.forBlock['set_operations'] = function (block) {
        const op = block.getFieldValue('OP');
        const set1 = pythonGenerator.valueToCode(block, 'SET1', pythonGenerator.ORDER_MEMBER) || 'set()';
        const set2 = pythonGenerator.valueToCode(block, 'SET2', pythonGenerator.ORDER_NONE) || 'set()';
        const method = op.toLowerCase();
        return [`${set1}.${method}(${set2})`, pythonGenerator.ORDER_FUNCTION_CALL];
      };

      pythonGenerator.forBlock['tuple_create'] = function (block) {
        const a = pythonGenerator.valueToCode(block, 'A', pythonGenerator.ORDER_NONE) || 'None';
        const b = pythonGenerator.valueToCode(block, 'B', pythonGenerator.ORDER_NONE) || 'None';
        return [`(${a}, ${b})`, pythonGenerator.ORDER_ATOMIC];
      };

      pythonGenerator.forBlock['python_type'] = function (block) {
        const value = pythonGenerator.valueToCode(block, 'VALUE', pythonGenerator.ORDER_NONE) || 'None';
        return [`type(${value})`, pythonGenerator.ORDER_FUNCTION_CALL];
      };

      pythonGenerator.forBlock['python_type_primitive'] = function (block) {
        const typeVal = block.getFieldValue('TYPE');
        return [typeVal, pythonGenerator.ORDER_ATOMIC];
      };

      pythonGenerator.forBlock['python_isinstance'] = function (block) {
        const value = pythonGenerator.valueToCode(block, 'VALUE', pythonGenerator.ORDER_NONE) || 'None';
        const typeVal = pythonGenerator.valueToCode(block, 'TYPE', pythonGenerator.ORDER_NONE) || 'type(None)';
        return [`isinstance(${value}, ${typeVal})`, pythonGenerator.ORDER_FUNCTION_CALL];
      };

      pythonGenerator.forBlock['text_multiply'] = function (block) {
        const text = pythonGenerator.valueToCode(block, 'TEXT', pythonGenerator.ORDER_MULTIPLICATIVE) || "''";
        const multiplier = pythonGenerator.valueToCode(block, 'MULTIPLIER', pythonGenerator.ORDER_MULTIPLICATIVE) || '0';
        return [`${text} * ${multiplier}`, pythonGenerator.ORDER_MULTIPLICATIVE];
      };

      pythonGenerator.forBlock['text_newline'] = function (block) {
        return ["'\\n'", pythonGenerator.ORDER_ATOMIC];
      };

      pythonGenerator.forBlock['list_append'] = function (block) {
        const list = pythonGenerator.valueToCode(block, 'LIST', pythonGenerator.ORDER_MEMBER) || '[]';
        const item = pythonGenerator.valueToCode(block, 'ITEM', pythonGenerator.ORDER_NONE) || 'None';
        return `${list}.append(${item})\n`;
      };

      pythonGenerator.forBlock['list_count'] = function (block) {
        const item = pythonGenerator.valueToCode(block, 'ITEM', pythonGenerator.ORDER_NONE) || 'None';
        const list = pythonGenerator.valueToCode(block, 'LIST', pythonGenerator.ORDER_MEMBER) || '[]';
        return [`${list}.count(${item})`, pythonGenerator.ORDER_FUNCTION_CALL];
      };

      pythonGenerator.forBlock['list_reverse'] = function (block) {
        const list = pythonGenerator.valueToCode(block, 'LIST', pythonGenerator.ORDER_MEMBER) || '[]';
        return `${list}.reverse()\n`;
      };

      pythonGenerator.forBlock['list_clear'] = function (block) {
        const list = pythonGenerator.valueToCode(block, 'LIST', pythonGenerator.ORDER_MEMBER) || '[]';
        return `${list}.clear()\n`;
      };

      pythonGenerator.forBlock['list_range'] = function (block) {
        const start = pythonGenerator.valueToCode(block, 'START', pythonGenerator.ORDER_NONE) || '0';
        const end = pythonGenerator.valueToCode(block, 'END', pythonGenerator.ORDER_NONE) || '0';
        return [`list(range(${start}, ${end}))`, pythonGenerator.ORDER_FUNCTION_CALL];
      };

      pythonGenerator.forBlock['variable_swap'] = function (block) {
        const var1 = pythonGenerator.getVariableName(block.getFieldValue('VAR1'));
        const var2 = pythonGenerator.getVariableName(block.getFieldValue('VAR2'));
        return `${var1}, ${var2} = ${var2}, ${var1}\n`;
      };

      pythonGenerator.forBlock['logic_in'] = function (block) {
        const item = pythonGenerator.valueToCode(block, 'ITEM', pythonGenerator.ORDER_RELATIONAL) || 'None';
        const collection = pythonGenerator.valueToCode(block, 'COLLECTION', pythonGenerator.ORDER_RELATIONAL) || '[]';
        return [`${item} in ${collection}`, pythonGenerator.ORDER_RELATIONAL];
      };

      pythonGenerator.forBlock['list_slice_advanced'] = function (block) {
        const list = pythonGenerator.valueToCode(block, 'LIST', pythonGenerator.ORDER_MEMBER) || '[]';
        const start = pythonGenerator.valueToCode(block, 'START', pythonGenerator.ORDER_NONE) || '';
        const end = pythonGenerator.valueToCode(block, 'END', pythonGenerator.ORDER_NONE) || '';
        return [`${list}[${start}:${end}]`, pythonGenerator.ORDER_MEMBER];
      };

      pythonGenerator.forBlock['list_concat'] = function (block) {
        const list1 = pythonGenerator.valueToCode(block, 'LIST1', pythonGenerator.ORDER_ADDITIVE) || '[]';
        const list2 = pythonGenerator.valueToCode(block, 'LIST2', pythonGenerator.ORDER_ADDITIVE) || '[]';
        return [`${list1} + ${list2}`, pythonGenerator.ORDER_ADDITIVE];
      };

      pythonGenerator.forBlock['list_remove_value'] = function (block) {
        const item = pythonGenerator.valueToCode(block, 'ITEM', pythonGenerator.ORDER_NONE) || 'None';
        const list = pythonGenerator.valueToCode(block, 'LIST', pythonGenerator.ORDER_MEMBER) || '[]';
        return `${list}.remove(${item})\n`;
      };

      pythonGenerator.forBlock['list_pop'] = function (block) {
        const list = pythonGenerator.valueToCode(block, 'LIST', pythonGenerator.ORDER_MEMBER) || '[]';
        return [`${list}.pop()`, pythonGenerator.ORDER_FUNCTION_CALL];
      };

      pythonGenerator.forBlock['list_pop_statement'] = function (block) {
        const list = pythonGenerator.valueToCode(block, 'LIST', pythonGenerator.ORDER_MEMBER) || '[]';
        return `${list}.pop()\n`;
      };

      pythonGenerator.forBlock['dict_keys_values'] = function (block) {
        const op = block.getFieldValue('OP');
        const dict = pythonGenerator.valueToCode(block, 'DICT', pythonGenerator.ORDER_MEMBER) || '{}';
        return [`list(${dict}.${op}())`, pythonGenerator.ORDER_FUNCTION_CALL];
      };

      pythonGenerator.forBlock['controls_pass'] = function (block) {
        return 'pass\n';
      };

      pythonGenerator.forBlock['list_sort'] = function (block) {
        const list = pythonGenerator.valueToCode(block, 'LIST', pythonGenerator.ORDER_MEMBER) || '[]';
        const reverse = block.getFieldValue('REVERSE') === 'TRUE';
        if (reverse) {
          return `${list}.sort(reverse=True)\n`;
        }
        return `${list}.sort()\n`;
      };

      pythonGenerator.forBlock['list_sorted'] = function (block) {
        const list = pythonGenerator.valueToCode(block, 'LIST', pythonGenerator.ORDER_NONE) || '[]';
        const reverse = block.getFieldValue('REVERSE') === 'TRUE';
        if (reverse) {
          return [`sorted(${list}, reverse=True)`, pythonGenerator.ORDER_FUNCTION_CALL];
        }
        return [`sorted(${list})`, pythonGenerator.ORDER_FUNCTION_CALL];
      };

      pythonGenerator.forBlock['list_insert'] = function (block) {
        const item = pythonGenerator.valueToCode(block, 'ITEM', pythonGenerator.ORDER_NONE) || 'None';
        const index = pythonGenerator.valueToCode(block, 'INDEX', pythonGenerator.ORDER_NONE) || '0';
        const list = pythonGenerator.valueToCode(block, 'LIST', pythonGenerator.ORDER_MEMBER) || '[]';
        return `${list}.insert(${index}, ${item})\n`;
      };

      pythonGenerator.forBlock['string_split'] = function (block) {
        const string = pythonGenerator.valueToCode(block, 'STRING', pythonGenerator.ORDER_MEMBER) || "''";
        const delimiter = pythonGenerator.valueToCode(block, 'DELIMITER', pythonGenerator.ORDER_NONE) || "''";
        return [`${string}.split(${delimiter})`, pythonGenerator.ORDER_FUNCTION_CALL];
      };

      pythonGenerator.forBlock['math_abs_round'] = function (block) {
        const op = block.getFieldValue('OP');
        const value = pythonGenerator.valueToCode(block, 'VALUE', pythonGenerator.ORDER_NONE) || '0';
        return [`${op}(${value})`, pythonGenerator.ORDER_FUNCTION_CALL];
      };

      pythonGenerator.forBlock['type_cast_advanced'] = function (block) {
        const type = block.getFieldValue('TYPE');
        const value = pythonGenerator.valueToCode(block, 'VALUE', pythonGenerator.ORDER_NONE) || 'None';
        return [`${type}(${value})`, pythonGenerator.ORDER_FUNCTION_CALL];
      };

      pythonGenerator.forBlock['string_case_formatting'] = function (block) {
        const string = pythonGenerator.valueToCode(block, 'STRING', pythonGenerator.ORDER_MEMBER) || "''";
        const caseType = block.getFieldValue('CASE');
        return [`${string}.${caseType}()`, pythonGenerator.ORDER_FUNCTION_CALL];
      };

      // --- New Stack and Queue Code Generators ---
      pythonGenerator.forBlock['stack_push'] = function (block) {
        const item = pythonGenerator.valueToCode(block, 'ITEM', pythonGenerator.ORDER_NONE) || 'None';
        const stackVal = pythonGenerator.valueToCode(block, 'STACK', pythonGenerator.ORDER_MEMBER) || '[]';
        return `${stackVal}.append(${item})\n`;
      };

      pythonGenerator.forBlock['stack_pop'] = function (block) {
        const stackVal = pythonGenerator.valueToCode(block, 'STACK', pythonGenerator.ORDER_MEMBER) || '[]';
        return [`${stackVal}.pop()`, pythonGenerator.ORDER_FUNCTION_CALL];
      };

      pythonGenerator.forBlock['stack_pop_statement'] = function (block) {
        const stackVal = pythonGenerator.valueToCode(block, 'STACK', pythonGenerator.ORDER_MEMBER) || '[]';
        return `${stackVal}.pop()\n`;
      };

      pythonGenerator.forBlock['stack_peek'] = function (block) {
        const stackVal = pythonGenerator.valueToCode(block, 'STACK', pythonGenerator.ORDER_MEMBER) || '[]';
        return [`${stackVal}[-1]`, pythonGenerator.ORDER_MEMBER];
      };

      pythonGenerator.forBlock['queue_enqueue'] = function (block) {
        const item = pythonGenerator.valueToCode(block, 'ITEM', pythonGenerator.ORDER_NONE) || 'None';
        const queueVal = pythonGenerator.valueToCode(block, 'QUEUE', pythonGenerator.ORDER_MEMBER) || '[]';
        return `${queueVal}.append(${item})\n`;
      };

      pythonGenerator.forBlock['queue_dequeue'] = function (block) {
        const queueVal = pythonGenerator.valueToCode(block, 'QUEUE', pythonGenerator.ORDER_MEMBER) || '[]';
        return [`${queueVal}.pop(0)`, pythonGenerator.ORDER_FUNCTION_CALL];
      };

      pythonGenerator.forBlock['queue_dequeue_statement'] = function (block) {
        const queueVal = pythonGenerator.valueToCode(block, 'QUEUE', pythonGenerator.ORDER_MEMBER) || '[]';
        return `${queueVal}.pop(0)\n`;
      };

      pythonGenerator.forBlock['queue_peek'] = function (block) {
        const queueVal = pythonGenerator.valueToCode(block, 'QUEUE', pythonGenerator.ORDER_MEMBER) || '[]';
        return [`${queueVal}[0]`, pythonGenerator.ORDER_MEMBER];
      };

      pythonGenerator.forBlock['raw_python_statement'] = function (block) { return block.getFieldValue('CODE') + '\n'; };
      pythonGenerator.forBlock['raw_python_expression'] = function (block) { return [block.getFieldValue('CODE'), pythonGenerator.ORDER_ATOMIC]; };
      pythonGenerator.forBlock['raw_python_multiline'] = function (block) { return block.getFieldValue('CODE') + '\n'; };

      pythonGenerator.forBlock['python_input'] = function (block) {
        const promptMsg = pythonGenerator.valueToCode(block, 'PROMPT', pythonGenerator.ORDER_NONE) || "''";
        return [`input(${promptMsg})`, pythonGenerator.ORDER_FUNCTION_CALL];
      };

      let changeTimeout = null;
      workspace.current.addChangeListener((event) => {
        if (event.isUiEvent) return;
        if (changeTimeout) clearTimeout(changeTimeout);

        changeTimeout = setTimeout(() => {
          try {
            const json = Blockly.serialization.workspaces.save(workspace.current);
            const code = pythonGenerator.workspaceToCode(workspace.current);
            if (onChangeRef.current) onChangeRef.current(json, code);
          } catch (e) {
            console.warn("Blockly Workspace Update Error: ", e);
          }
        }, 400);
      });

      let resizeFrame;
      const observer = new ResizeObserver(() => {
        if (resizeFrame) cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          if (workspace.current) Blockly.svgResize(workspace.current);
        });
      });
      observer.observe(blocklyDiv.current);
      blocklyDiv.current.resizeObserver = observer;
    }

    return () => {
      if (minimapDelay) clearTimeout(minimapDelay);
      try {
        if (searchPlugin?.dispose) searchPlugin.dispose();
        if (minimapPlugin?.dispose) minimapPlugin.dispose();
        if (modalPlugin?.dispose) modalPlugin.dispose();
        if (backpackPlugin?.dispose) backpackPlugin.dispose();
        if (highlightPlugin?.dispose) highlightPlugin.dispose();
      } catch (e) {
        console.warn("Plugin dispose skipped:", e.message);
      }
      if (workspace.current) {
        workspace.current.dispose();
        workspace.current = null;
      }
      if (blocklyDiv.current?.resizeObserver) {
        blocklyDiv.current.resizeObserver.disconnect();
      }
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={blocklyDiv} style={{ height: "100%", width: "100%" }} />
      {syntaxError && (
        <div style={{
          position: 'absolute', top: '20px', right: '20px', backgroundColor: '#3A2A6B',
          borderLeft: '4px solid #bc11ff', color: '#EBE4FF', padding: '12px 16px',
          borderRadius: '0 8px 8px 0', boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', gap: '12px', zIndex: 1000, maxWidth: '300px'
        }}>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#bc11ff' }}>Syntax Error (Line {syntaxError.line})</div>
            <div style={{ fontSize: '0.8rem', marginTop: '4px', opacity: 0.9 }}>{syntaxError.message}</div>
          </div>
        </div>
      )}
    </div>
  );
});

export default BlocklyWorkspace;