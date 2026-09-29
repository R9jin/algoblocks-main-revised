# Offline mode fixes

Symptoms: with the service worker set to Offline, built-in templates and saved
projects would not load into the workspace, the Python view sat on "Loading...",
fonts disappeared, and the Python engine never recovered.

## Fixed
| Area | Problem | Fix |
|---|---|---|
| Python code editor | Monaco was loaded from cdn.jsdelivr.net at runtime, so the Python view never opened offline (and could not be precached). | `utils/monacoSetup.js` bundles Monaco (core + Python + editor worker) and is imported by `PythonCodeEditor.jsx`. `monaco-editor` (and `idb`, previously only a transitive dependency) are now declared in `package.json`. |
| Built-in templates | `fetch('/templates/...')` had no fallback. | `utils/staticJsonCache.js`: network/service worker, then Cache Storage, then IndexedDB. Templates are warmed into IndexedDB on workspace mount. Clear message if a template was never cached. |
| Saved projects / templates in the sidebar | Items were keyed by the server row number (`_id`), which differs from the IndexedDB key (`projectId`). Loading, re-saving and deleting used the wrong id, so offline edits created duplicates and deletes hit nothing. | `MainApp.jsx` now uses `projectId` / `templateId` as the identity. |
| Offline edits lost on reconnect | Opening the workspace or Projects page online replaced unsynced local projects with the server copy (lookup used the wrong key). | Cloud copies no longer overwrite a local copy that is unsynced and newer (`MainApp.jsx`, `Projects.jsx`). |
| Python engine | Files under `/pyodide` were only cached if the first download went through the service worker; a first visit often bypassed it. A failed start was permanent for the tab. | `utils/offlineReadiness.js` fills the cache once the engine is ready. `pyodideEngine.js` retries automatically on reconnect and shows an accurate offline message, which `MainApp.jsx` now surfaces in its toasts. |
| Fonts | Google Fonts had no runtime cache. | `vite.config.js`: StaleWhileRevalidate for the stylesheets, CacheFirst for font files. |
| App-shell fallback | `index.html` was returned for any navigation, including `/api`, `/pyodide`, `/templates`, `/data`. | `navigateFallbackDenylist` added. |

## Testing offline
1. `npm run build && npm run preview` (the dev server has no service worker).
2. Sign in online and wait until the Python engine reports Ready. Open the workspace once.
3. DevTools > Application > Service Workers > Offline (or Network > Offline), then reload.
4. Note: the Service Worker "Offline" checkbox does not change `navigator.onLine`; both paths are handled.

First-ever visit still needs one online session to download the app and the Python runtime (about 25 MB total).
