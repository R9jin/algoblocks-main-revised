// frontend/src/utils/monacoSetup.js
//
// Serves the Python code editor from the app bundle instead of a CDN.
//
// @monaco-editor/react's default loader injects a <script> that pulls the
// whole editor from cdn.jsdelivr.net at runtime. Offline that request fails,
// so the Python view of the workspace sat on "Loading..." forever (and it was
// never in the service worker's precache, because it isn't ours to precache).
//
// Here we hand the loader a locally bundled Monaco instead. Only what the
// app uses is pulled in -- the editor core, the Python language and Monaco's
// own editor worker -- so it costs a few MB rather than the full IDE, and
// Workbox precaches the resulting chunks with everything else.
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/esm/vs/editor/edcore.main";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

loader.config({ monaco });
