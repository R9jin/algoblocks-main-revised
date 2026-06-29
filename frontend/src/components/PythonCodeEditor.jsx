// frontend/src/components/PythonCodeEditor.jsx
import Editor from "@monaco-editor/react";
import { handleEditorWillMount } from "../utils/asymptoticParser.jsx";
import FloatingErrorDropdown from "./FloatingErrorDropdown.jsx";

export default function PythonCodeEditor({
  viewMode = "workspace",
  pythonCode = "",
  isEditingCode = false,
  syntaxErrors = [],
  onSyncToBlocks,
  onChangeCode,
  onMountEditor
}) {
  const hasSyntaxErrors = syntaxErrors && syntaxErrors.length > 0;

  return (
    <div className={viewMode === "python" ? "python-view d-flex" : "python-view d-none"}>
      <div className="python-header">
        <span className="python-sync-status">
          {isEditingCode ? "Unsaved code changes..." : "Code is synced with blocks."}
        </span>
        <button
          onClick={onSyncToBlocks}
          disabled={!isEditingCode || hasSyntaxErrors}
          className={`python-sync-btn ${isEditingCode && !hasSyntaxErrors ? "active" : "disabled"}`}
        >
          Sync to Blocks
        </button>
      </div>

      <div className="editor-wrapper">
        <Editor
          height="100%"
          language="python"
          theme="algoblocks-light"
          beforeMount={handleEditorWillMount}
          onMount={onMountEditor}
          value={pythonCode}
          onChange={onChangeCode}
          options={{
            minimap: { enabled: false },
            fontSize: 15,
            fontFamily: "Consolas, 'Courier New', monospace",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            padding: { top: 16 }
          }}
        />
        <FloatingErrorDropdown syntaxErrors={syntaxErrors} />
      </div>
    </div>
  );
}