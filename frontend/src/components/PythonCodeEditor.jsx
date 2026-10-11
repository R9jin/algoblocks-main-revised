// frontend/src/components/PythonCodeEditor.jsx
import Editor from "@monaco-editor/react";
import "../utils/monacoSetup"; // bundled Monaco -- no CDN, works offline
import { handleEditorWillMount } from "../utils/asymptoticParser.jsx";
import FloatingErrorDropdown from "./FloatingErrorDropdown.jsx";
import useResolvedTheme from "../hooks/useResolvedTheme";

export default function PythonCodeEditor({
  viewMode = "workspace",
  pythonCode = "",
  isEditingCode = false,
  syntaxErrors = [],
  onSyncToBlocks,
  isSyncingToBlocks = false,
  onChangeCode,
  onMountEditor
}) {
  const hasSyntaxErrors = syntaxErrors && syntaxErrors.length > 0;
  const editorTheme = useResolvedTheme() === "dark" ? "algoblocks-dark" : "algoblocks-light";

  return (
    <div className={viewMode === "python" ? "python-view d-flex" : "python-view d-none"}>
      <div className="python-header">
        <span className="python-sync-status">
          {isSyncingToBlocks
            ? "Converting to blocks..."
            : isEditingCode
              ? (hasSyntaxErrors ? "Fix the syntax errors to sync with blocks." : "Syncing to blocks automatically...")
              : "Code is synced with blocks."}
        </span>
        <button
          onClick={onSyncToBlocks}
          disabled={!isEditingCode || hasSyntaxErrors || isSyncingToBlocks}
          className={`python-sync-btn ${isEditingCode && !hasSyntaxErrors && !isSyncingToBlocks ? "active" : "disabled"} ${isSyncingToBlocks ? "syncing" : ""}`}
        >
          {isSyncingToBlocks ? (
            <>
              <span className="python-sync-spinner" aria-hidden="true" />
              Converting...
            </>
          ) : (
            "Sync to Blocks"
          )}
        </button>
      </div>

      <div className="editor-wrapper">
        <Editor
          height="100%"
          language="python"
          theme={editorTheme}
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