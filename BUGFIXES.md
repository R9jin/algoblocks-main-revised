# Workspace bug fixes

1. `PythonCodeEditor.jsx` - Monaco now uses `automaticLayout: true`. The editor sits in a dock panel that is `display:none` while another tab is active and is resized by the splitters, so it stayed 0x0 / stale-sized.
2. `MainApp.jsx` / `ActivityApp.jsx` - the delayed `resize()` calls (50 ms / 300 ms) now re-read the ref and use optional chaining, so closing a tab or unmounting inside that window no longer throws.
3. `MainApp.jsx` `closeTab` - no longer calls `setActiveTabId` / `createInitialTab` inside a `setTabs` updater (React may run updaters twice, which could leave the active tab pointing at a discarded tab).
4. `MainApp.jsx` `handleClear` - resets `isEditingCode` to false. Before, after typing Python and pressing Clear, new blocks never updated the Python panel.
5. `MainApp.jsx` `handleDeleteItem` - when the deleted project is open in a tab, the tab is fully reset (Python text, blocklyJson, analysis). Before, the deleted blocks could reappear when the Blocks panel remounted.
6. `MainApp.jsx` `handleImportJson` - rejects JSON that is not a Blockly workspace (it used to wipe the workspace and still show "imported successfully") and guards a missing `pythonCode`.
7. `BlocklyWorkspace.jsx` - `global` lines written in Raw Code blocks (or synced from Python) are now kept; only the ones Blockly auto-adds are stripped.
8. `DockableWorkspace.jsx` - splitters use pointer events (touch/pen work) and clean up listeners on unmount. `resize()` only takes focus when nothing else has it.
9. Removed leftovers: `DockedBottomPanel.jsx`, `temp_mainapp.css`, `PatternSignals`, `analyzer.py.orig`.
