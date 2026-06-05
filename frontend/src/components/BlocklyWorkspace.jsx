// frontend/src/components/BlocklyWorkspace.jsx
import { registerFieldMultilineInput } from "@blockly/field-multilineinput";
import * as Blockly from "blockly";
import "blockly/blocks";
import * as En from "blockly/msg/en";
import { pythonGenerator } from "blockly/python";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// Optional: standard plugins
import { CrossTabCopyPaste } from "@blockly/plugin-cross-tab-copy-paste";

Blockly.setLocale(En);

// Define custom Docstring Block
Blockly.Blocks["python_docstring"] = {
  init: function () {
    this.appendDummyInput()
      .appendField('"""')
      .appendField(new Blockly.FieldMultilineInput("Comment here..."), "TEXT")
      .appendField('"""');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    // Green comment color
    this.setColour(120);
    this.setTooltip("Multi-line Python docstring or comment");
  },
};

// Generator for Docstring Block
pythonGenerator.forBlock["python_docstring"] = function (block, generator) {
  const text = block.getFieldValue("TEXT");
  return '"""\n' + text + '\n"""\n';
};

const toolbox = {
  kind: "categoryToolbox",
  contents: [
    {
      kind: "category",
      name: "Logic",
      colour: "%{BKY_LOGIC_HUE}",
      contents: [
        { kind: "block", type: "controls_if" },
        { kind: "block", type: "logic_compare" },
        { kind: "block", type: "logic_operation" },
        { kind: "block", type: "logic_negate" },
        { kind: "block", type: "logic_boolean" },
        { kind: "block", type: "logic_null" },
      ],
    },
    {
      kind: "category",
      name: "Loops",
      colour: "%{BKY_LOOPS_HUE}",
      contents: [
        { kind: "block", type: "controls_whileUntil" },
        { kind: "block", type: "controls_for" },
        { kind: "block", type: "controls_forEach" },
        { kind: "block", type: "controls_flow_statements" },
      ],
    },
    {
      kind: "category",
      name: "Math",
      colour: "%{BKY_MATH_HUE}",
      contents: [
        { kind: "block", type: "math_number" },
        { kind: "block", type: "math_arithmetic" },
        { kind: "block", type: "math_modulo" },
      ],
    },
    {
      kind: "category",
      name: "Text",
      colour: "%{BKY_TEXTS_HUE}",
      contents: [
        { kind: "block", type: "text" },
        { kind: "block", type: "text_print" },
        { kind: "block", type: "text_prompt_ext" },
        { kind: "block", type: "python_docstring" },
      ],
    },
    {
      kind: "category",
      name: "Lists",
      colour: "%{BKY_LISTS_HUE}",
      contents: [
        { kind: "block", type: "lists_create_with" },
        { kind: "block", type: "lists_getIndex" },
        { kind: "block", type: "lists_setIndex" },
        { kind: "block", type: "lists_length" },
      ],
    },
    {
      kind: "category",
      name: "Variables",
      colour: "%{BKY_VARIABLES_HUE}",
      custom: "VARIABLE",
    },
    {
      kind: "category",
      name: "Functions",
      colour: "%{BKY_PROCEDURES_HUE}",
      custom: "PROCEDURE",
    },
  ],
};

const BlocklyWorkspace = forwardRef(({ onChange }, ref) => {
  const blocklyDiv = useRef(null);
  const workspaceRef = useRef(null);
  const isInternalChange = useRef(false);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    getWorkspace: () => workspaceRef.current,
    clear: () => {
      if (workspaceRef.current) {
        workspaceRef.current.clear();
      }
    },
    resize: () => {
      if (workspaceRef.current) {
        Blockly.svgResize(workspaceRef.current);
      }
    },
    loadTemplate: (json, pythonCodeToPreserve = null) => {
      if (!workspaceRef.current) return;
      isInternalChange.current = true;
      try {
        workspaceRef.current.clear();
        if (json && Object.keys(json).length > 0) {
          Blockly.serialization.workspaces.load(json, workspaceRef.current);
        }

        // If a specific Python string is passed, invoke onChange with it to prevent overriding
        if (pythonCodeToPreserve && onChange) {
          onChange(json, pythonCodeToPreserve, false);
        }
      } catch (err) {
        console.error("Failed to load blocks:", err);
      }
      setTimeout(() => {
        isInternalChange.current = false;
      }, 100);
    },
    loadFromPython: async (code) => {
      if (!workspaceRef.current || !code) return;
      try {
        const response = await fetch("/api/convert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const data = await response.json();

        if (data.status === "success" && data.blocks) {
          isInternalChange.current = true;
          workspaceRef.current.clear();
          Blockly.serialization.workspaces.load(
            data.blocks,
            workspaceRef.current,
          );
          setTimeout(() => {
            isInternalChange.current = false;
          }, 100);
        } else {
          throw new Error(data.message || "Failed to convert code to blocks.");
        }
      } catch (err) {
        console.error("AST Conversion Error:", err);
        throw err; // Re-throw so parent UI can show the modal
      }
    },
  }));

  useEffect(() => {
    if (!blocklyDiv.current) return;

    try {
      // Register multiline field for our docstring
      registerFieldMultilineInput();
    } catch (e) {}

    try {
      // Register cross tab copy paste plugin
      const plugin = new CrossTabCopyPaste();
      plugin.init({ contextMenu: true, shortcut: true });
    } catch (e) {}

    const workspace = Blockly.inject(blocklyDiv.current, {
      toolbox: toolbox,
      grid: { spacing: 20, length: 3, colour: "#ccc", snap: true },
      zoom: {
        controls: true,
        wheel: true,
        startScale: 1.0,
        maxScale: 3,
        minScale: 0.3,
        scaleSpeed: 1.2,
      },
      trashcan: true,
      theme: Blockly.Theme.defineTheme("modern", {
        base: Blockly.Themes.Classic,
        componentStyles: {
          workspaceBackgroundColour: "#1e1e1e",
          toolboxBackgroundColour: "#252526",
          toolboxForegroundColour: "#fff",
          flyoutBackgroundColour: "#252526",
          flyoutForegroundColour: "#ccc",
          scrollbarColour: "#797979",
        },
      }),
    });
    workspaceRef.current = workspace;

    const handleWorkspaceEvent = (event) => {
      if (isInternalChange.current) return;
      if (
        event.type === Blockly.Events.BLOCK_MOVE ||
        event.type === Blockly.Events.BLOCK_CHANGE ||
        event.type === Blockly.Events.BLOCK_DELETE ||
        event.type === Blockly.Events.BLOCK_CREATE
      ) {
        const state = Blockly.serialization.workspaces.save(workspace);
        const code = pythonGenerator.workspaceToCode(workspace);
        if (onChange) {
          onChange(state, code, false);
        }
      }
    };

    workspace.addChangeListener(handleWorkspaceEvent);

    return () => {
      workspace.dispose();
    };
  }, []);

  return (
    <div
      ref={blocklyDiv}
      className="blockly-workspace-container"
      style={{ width: "100%", height: "100%" }}
    />
  );
});

BlocklyWorkspace.displayName = "BlocklyWorkspace";

export default BlocklyWorkspace;
