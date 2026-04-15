import * as Blockly from "blockly";
import "blockly/blocks";
import * as En from "blockly/msg/en";
import { pythonGenerator } from "blockly/python";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// --- STABLE PLUGIN IMPORTS ---
import { registerFieldMultilineInput } from '@blockly/field-multilineinput';
import { Modal } from "@blockly/plugin-modal";
import { WorkspaceSearch } from "@blockly/plugin-workspace-search";
import { shadowBlockConversionChangeListener } from "@blockly/shadow-block-converter";
import "@blockly/toolbox-search";
import { Backpack } from "@blockly/workspace-backpack";
import { ContentHighlight } from "@blockly/workspace-content-highlight";
import { PositionedMinimap } from "@blockly/workspace-minimap";

registerFieldMultilineInput();
Blockly.setLocale(En);

const DarkTheme = Blockly.Themes.Dark;
const ModernTheme = Blockly.Themes.Modern;

// --- DEFINE CUSTOM PASTEL THEME ---
const pastelTheme = Blockly.Theme.defineTheme('pastelTheme', {
  base: ModernTheme,
  categoryStyles: {
    logic_category: { colour: "#c1a0e8" },
    loop_category: { colour: "#8bcf8b" },
    math_category: { colour: "#4C97FF" },
    text_category: { colour: "#d5a52a" },
    list_category: { colour: "#4DB6AC" },
    variable_category: { colour: "#f38286" },
    procedure_category: { colour: "#7a6b66" },
    raw_category: { colour: "#FF6B6B" }
  },
  blockStyles: {
    logic_blocks: { colourPrimary: "#c1a0e8", colourSecondary: "#B8A0D6", colourTertiary: "#A38CC1" },
    loop_blocks: { colourPrimary: "#8bcf8b", colourSecondary: "#90BC90", colourTertiary: "#7CA77C" },
    math_blocks: { colourPrimary: "#4C97FF", colourSecondary: "#2c80f5", colourTertiary: "#2A70CC" },
    text_blocks: { colourPrimary: "#d5a52a", colourSecondary: "#E5AF2C", colourTertiary: "#CC9A26" },
    list_blocks: { colourPrimary: "#4DB6AC", colourSecondary: "#42A097", colourTertiary: "#388C83" },
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

// --- 1. DEFINE CUSTOM BLOCKS ---
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
    colour: "#4DB6AC",
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
    style: "list_blocks",
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
    style: "list_blocks",
    tooltip: "Sets a key-value pair in a dictionary (e.g., dict['key'] = value)"
  },
  {
    type: "dict_get",
    message0: "in dictionary %1 get key %2",
    args0: [
      { type: "input_value", name: "DICT" },
      { type: "input_value", name: "KEY" }
    ],
    inputsInline: true,
    output: null,
    style: "list_blocks",
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
    style: "list_blocks",
    tooltip: "Creates a single Key-Value pair (e.g., 'A': 1)"
  },
  {
    type: "dict_from_pairs",
    message0: "create dictionary with %1",
    args0: [
      { type: "input_value", "name": "LIST", check: "Array" }
    ],
    output: null,
    style: "list_blocks",
    tooltip: "Converts a list of key-value pairs into a dictionary literal"
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
    tooltip: "Adds a multi-line comment (docstring) to the Python code"
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
    message0: "ask user for input with prompt %1", // More human-readable label
    args0: [
      { type: "input_value", name: "PROMPT", check: "String" }
    ],
    output: "String",
    colour: "#d5a52a",
    tooltip: "Displays a message and waits for the user to type something in the console."
  }
];

if (Blockly.common && Blockly.common.defineBlocksWithJsonArray) {
  Blockly.common.defineBlocksWithJsonArray(customBlocks);
} else {
  Blockly.defineBlocksWithJsonArray(customBlocks);
}

// --- 2. TOOLBOX CONFIGURATION ---
const toolbox = {
  kind: "categoryToolbox",
  contents: [
    { kind: "search", name: "Search", contents: [] },
    // Logic
    {
      kind: "category",
      name: "Logic",
      categorystyle: "logic_category",
      contents: [
        { kind: "block", type: "controls_if" },
        { kind: "block", type: "logic_compare" },
        { kind: "block", type: "logic_operation" },
        { kind: "block", type: "logic_negate" },
        { kind: "block", type: "logic_boolean" },
        { kind: "block", type: "logic_null" },
        { kind: "block", type: "logic_ternary" },
        { kind: "block", type: "procedure_return_value" }
      ]
    },
    // Loops
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
        { kind: "block", type: "controls_flow_statements" }
      ]
    },
    // Math
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
    // Text
    {
      kind: "category",
      name: "Text",
      categorystyle: "text_category",
      contents: [
        { kind: "block", type: "comment_block" },
        { kind: "block", type: "multi_line_comment" },
        { kind: "block", type: "text" },
        { kind: "block", type: "custom_string_join" },
        { kind: "block", type: "text_join" },
        { kind: "block", type: "text_append" },
        { kind: "block", type: "text_length" },
        { kind: "block", type: "text_isEmpty" },
        { kind: "block", type: "text_indexOf" },
        { kind: "block", type: "text_charAt" },
        { kind: "block", type: "text_getSubstring" },
        { kind: "block", type: "text_changeCase" },
        { kind: "block", type: "text_trim" },
        { kind: "block", type: "text_print" },
        {
          kind: "block",
          type: "python_input",
          inputs: {
            PROMPT: {
              shadow: {
                type: "text",
                fields: { TEXT: "Enter your name: " } // Example of a clear default
              }
            }
          }
        }
      ]
    },
    // Lists and Dictionaries
    {
      kind: "category",
      name: "Lists",
      categorystyle: "list_category",
      contents: [
        { kind: "block", type: "string_to_list" },
        { kind: "block", type: "lists_create_with", extraState: { itemCount: 0 } },
        { kind: "block", type: "lists_create_with" },
        { kind: "block", type: "lists_repeat", inputs: { NUM: { shadow: { type: "math_number", fields: { NUM: 5 } } } } },
        { kind: "block", type: "lists_length" },
        { kind: "block", type: "lists_isEmpty" },
        { kind: "block", type: "lists_indexOf" },
        { kind: "block", type: "lists_getIndex" },
        { kind: "block", type: "lists_setIndex" },
        { kind: "block", type: "lists_getSublist" },
        { kind: "block", type: "lists_split" },
        { kind: "block", type: "lists_sort" },
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
    // Variables & Functions
    { kind: "category", name: "Variables", categorystyle: "variable_category", custom: "VARIABLE" },
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

// Accept the syntaxError context prop here
const BlocklyWorkspace = forwardRef(({ onChange, syntaxError }, ref) => {
  const blocklyDiv = useRef(null);
  const workspace = useRef(null);
  const onChangeRef = useRef(onChange);

  const API_URL = import.meta.env.VITE_BACKEND_URL || ""

  // Inside your BlocklyWorkspace component

  const handleRunCode = async (studentCode) => {
    console.log("Sending code to Pyodide Worker...");

    try {
      const result = await runCodeWithWorker(studentCode);
      console.log("Analysis Result:", result);
      // TODO: Update your UI state with the result (Big O, frequency count, worst-case bottleneck)
    } catch (error) {
      console.error("Analysis Failed:", error);
      // TODO: Show an error modal or toast to the user
    }
  };

  const runCodeWithWorker = (studentCode) => {
    return new Promise((resolve, reject) => {
      // Spawn the worker
      const worker = new Worker(new URL('../workers/analyzer.worker.js', import.meta.url), { type: 'module' });

      // Panel Requirement: 3-Second Timeout for Infinite Loops
      const timeout = setTimeout(() => {
        worker.terminate(); // Force kill the thread
        reject({
          error: "Root Cause: Infinite Loop detected. Suggestion: Check your loop conditions to ensure they eventually terminate."
        });
      }, 3000);

      // Listen for the result
      worker.onmessage = (e) => {
        clearTimeout(timeout); // Cancel the kill switch if it finished in time
        if (e.data.status === 'success') {
          if (e.data.result.error) {
            reject(e.data.result.error);
          } else {
            resolve(e.data.result);
          }
        } else {
          reject(e.data.error);
        }
        worker.terminate(); // Clean up memory
      };

      // Fire off the code!
      worker.postMessage({ code: studentCode });
    });
  };

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
    // Inside BlocklyWorkspace.jsx
    loadTemplate: (json) => {
      if (workspace.current) {
        // 1. Removed Blockly.Events.disable();
        try {
          workspace.current.clear();
          Blockly.serialization.workspaces.load(json, workspace.current);
        } catch (err) {
          console.error("Error loading workspace JSON:", err);
        }
        // 2. Removed Blockly.Events.enable();

        setTimeout(() => {
          const code = pythonGenerator.workspaceToCode(workspace.current);
          const currentJson = Blockly.serialization.workspaces.save(workspace.current);
          if (onChangeRef.current) onChangeRef.current(currentJson, code);
        }, 100);
      }
    },
    setTheme: (themeName) => {
      if (workspace.current) {
        workspace.current.setTheme(themeName === 'dark' ? DarkTheme : pastelTheme);
      }
    },

    // Inside BlocklyWorkspace.jsx - replace loadFromPython
    // ... existing imports
    loadFromPython: async (pythonCode) => {
      if (!workspace.current) return;

      try {
        const response = await fetch(`${API_URL}/api/ast-to-blocks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: pythonCode })
        });
        const data = await response.json();

        if (data.status === "error") {
          // Use the actual error message from the backend
          throw new Error(data.message || "Failed to parse Python code.");
        }

        Blockly.Events.disable();
        try {
          workspace.current.clear();
          if (data.status === "success" && data.blocks) {
            Blockly.serialization.workspaces.load(data.blocks, workspace.current);
          }
        } finally {
          Blockly.Events.enable();
        }
      } catch (error) {
        console.error("AST Parsing failed:", error.message);
        throw error; // Re-throw so MainApp.jsx can display it
      }
    }
  }));

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (workspace.current) return;

    let searchPlugin, minimapPlugin, modalPlugin, backpackPlugin, highlightPlugin;

    if (blocklyDiv.current) {
      if (Blockly.ShortcutRegistry.registry.getRegistry()['startSearch']) {
        Blockly.ShortcutRegistry.registry.unregister('startSearch');
      }

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
        minimapPlugin = new PositionedMinimap(workspace.current);
        minimapPlugin.init();
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

      if (!pythonGenerator.__originalInit) {
        pythonGenerator.__originalInit = pythonGenerator.init;
        pythonGenerator.init = function (workspace) {
          pythonGenerator.__originalInit.call(this, workspace);
          if (this.definitions_['variables']) {
            delete this.definitions_['variables'];
          }
        };
      }

      if (!pythonGenerator.__originalFinish) {
        pythonGenerator.__originalFinish = pythonGenerator.finish;
        pythonGenerator.finish = function (code) {
          let finalCode = pythonGenerator.__originalFinish.call(this, code);
          finalCode = finalCode.replace(/^[ \t]*global[ \t]+.*\n?/gm, '');
          finalCode = finalCode.replace(/^[ \t]*"""Describe this function\.\.\."""\n?/gm, '');
          finalCode = finalCode.replace(/^[ \t]*# Describe this function\.\.\.\n?/gm, '');
          return finalCode.trim();
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
        if (step.trim() === '1') {
          rangeCode = from.trim() === '0' ? `range(${to})` : `range(${from}, ${to})`;
        } else {
          rangeCode = `range(${from}, ${to}, ${step})`;
        }
        let branch = pythonGenerator.statementToCode(block, 'DO') || pythonGenerator.PASS;
        return `for ${variable} in ${rangeCode}:\n${branch}`;
      };

      pythonGenerator.forBlock['lists_getIndex'] = function (block) {
        const mode = block.getFieldValue('MODE') || 'GET';
        const where = block.getFieldValue('WHERE') || 'FROM_START';
        const list = pythonGenerator.valueToCode(block, 'VALUE', pythonGenerator.ORDER_MEMBER) || '[]';
        let indexCode = '0';
        if (where === 'FIRST') {
          indexCode = '0';
        } else if (where === 'LAST') {
          indexCode = '-1';
        } else if (where === 'FROM_START') {
          indexCode = pythonGenerator.valueToCode(block, 'AT', pythonGenerator.ORDER_NONE) || '0';
        } else if (where === 'FROM_END') {
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

          if (elementCode.startsWith("'") && elementCode.endsWith("'")) {
            fStringContent += elementCode.slice(1, -1);
          } else {
            fStringContent += `{${elementCode}}`;
          }
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
        if (!listBlock || listBlock.type !== 'lists_create_with') {
          return ['{}', pythonGenerator.ORDER_ATOMIC];
        }

        let pairs = [];
        for (let i = 0; i < listBlock.itemCount_; i++) {
          let pairCode = pythonGenerator.valueToCode(listBlock, 'ADD' + i, pythonGenerator.ORDER_NONE);
          if (pairCode) pairs.push(pairCode);
        }

        if (pairs.length === 0) return ['{}', pythonGenerator.ORDER_ATOMIC];
        const code = '{\n    ' + pairs.join(',\n    ') + '\n}';
        return [code, pythonGenerator.ORDER_ATOMIC];
      };

      pythonGenerator.forBlock['raw_python_statement'] = function (block) {
        return block.getFieldValue('CODE') + '\n';
      };

      pythonGenerator.forBlock['raw_python_expression'] = function (block) {
        return [block.getFieldValue('CODE'), pythonGenerator.ORDER_ATOMIC];
      };

      pythonGenerator.forBlock['raw_python_multiline'] = function (block) {
        return block.getFieldValue('CODE') + '\n';
      };

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

      {/* VSCode-style Workspace Floating Syntax Error Indicator */}
      {syntaxError && (
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          backgroundColor: '#3A2A6B',
          borderLeft: '4px solid #bc11ff',
          color: '#EBE4FF',
          padding: '12px 16px',
          borderRadius: '0 8px 8px 0',
          boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          zIndex: 1000,
          maxWidth: '300px'
        }}>
          <div style={{ fontSize: '1.5rem' }}>❌</div>
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