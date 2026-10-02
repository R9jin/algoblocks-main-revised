import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
// Self-hosted fonts (latin subset). These used to be pulled from Google Fonts,
// which meant the very first offline load had no fonts unless an earlier
// online visit had already been intercepted by the service worker. Bundled
// here, the woff2 files are part of the precache like every other asset.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import '@fontsource/outfit/latin-400.css';
import '@fontsource/outfit/latin-500.css';
import '@fontsource/outfit/latin-600.css';
import '@fontsource/outfit/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import '@fontsource/fira-code/latin-400.css';
import '@fontsource/fira-code/latin-500.css';
import '@fontsource/fira-code/latin-600.css';
import '@fontsource/fira-code/latin-700.css';
import App from './App.jsx';
import './index.css';
// Dark-surface text colours -- must stay last so it wins over component CSS.
import './styles/DarkSurfaces.css';
import './styles/LightSurfaces.css';
// Dark theme palette (active only under <html data-theme="dark">) -- keep last.
import './styles/DarkTheme.css';
// Dark theme coverage for every page / the code workspace (same gate: data-theme="dark").
import './styles/DarkPages.css';
import './styles/DarkWorkspace.css';
import { initTheme } from './utils/theme';

initTheme();

// =====================================================================
// GLOBAL API INTERCEPTOR
// =====================================================================
const originalFetch = window.fetch;
const API_TIMEOUT_READ_MS = 12000;
const API_TIMEOUT_WRITE_MS = 30000;

window.fetch = async (...args) => {
  let url = "";
  if (typeof args[0] === 'string') url = args[0];
  else if (args[0] instanceof URL) url = args[0].toString();
  else if (args[0] && typeof args[0] === 'object' && 'url' in args[0]) url = args[0].url;

  // 1. Intercept /api/run locally for Pyodide
  if (url.includes('/api/run')) {
    return new Response(JSON.stringify({ status: "success", message: "Execution handled by browser." }), { status: 200, headers: { 'Content-Type': 'application/json' }});
  }

  // 2. Inject Tokens
  if (url.includes('/api')) {
    let config = args[1] || {};
    let newHeaders = new Headers(config.headers);

    if (!newHeaders.has('Content-Type')) newHeaders.set('Content-Type', 'application/json');

    const token = localStorage.getItem('token') || sessionStorage.getItem('token') || localStorage.getItem('authToken');
    if (token) newHeaders.set('Authorization', `Bearer ${token}`);

    config.headers = newHeaders;
    args[1] = config;
  }

  // 2b. Bounded API calls.
  // A "connected but dead" network (captive portal, lie-fi, backend down)
  // leaves fetch() pending for minutes, and every page that awaits an /api
  // call before rendering (Profile, Dashboard, Learning Path...) sat on its
  // spinner the whole time. Give every /api request a deadline so the
  // offline/IndexedDB fallback each page already has actually gets a chance
  // to run. Calls that bring their own AbortSignal keep their own timing.
  let timedOut = false;
  let timer = null;
  if (url.includes('/api')) {
    const init = args[1] || {};
    const reqMethod = String(init.method || (args[0] && args[0].method) || 'GET').toUpperCase();
    const callerSignal = init.signal || (args[0] && typeof args[0] === 'object' ? args[0].signal : null);
    if (!callerSignal && typeof AbortController !== 'undefined') {
      const controller = new AbortController();
      timer = setTimeout(() => { timedOut = true; controller.abort(); }, reqMethod === 'GET' ? API_TIMEOUT_READ_MS : API_TIMEOUT_WRITE_MS);
      args[1] = { ...init, signal: controller.signal };
    }
  }

  try {
    const response = await originalFetch.apply(window, args);
    if (timer) clearTimeout(timer);

    // 3. Handle Expired Sessions
    // ONLY trigger if the request was not a login/signup attempt
    if (response.status === 401 && !url.includes('/login') && !url.includes('/signup') && !url.includes('/google-login')) {
      
      // FIX: Check if the user is a guest. If so, ignore the 401 kick-out.
      const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
      let isGuest = false;
      try {
        if (storedUser) isGuest = JSON.parse(storedUser).isGuest;
      } catch (e) {}

      if (!isGuest) {
        console.warn("Global Fetch: 401 Unauthorized detected. Session expired.");

        // Wipe everything completely
        localStorage.clear();
        sessionStorage.clear();

        // Only redirect if NOT already on an auth page
        const currentPath = window.location.pathname;

        if (currentPath !== '/' && !currentPath.includes('/signin') && !currentPath.includes('/signup')) {
          // Go straight to landing page
          window.location.href = '/';
        }
      } else {
        console.warn("Guest attempted to access protected backend resource. 401 Ignored.");
      }
    }

    return response;
  } catch (error) {
    if (timer) clearTimeout(timer);
    if (timedOut) {
      // Surface our own deadline as an ordinary network failure (not an
      // AbortError) so callers treat it like "offline" instead of ignoring it.
      throw new TypeError('Network request timed out');
    }
    // 4. Suppress Expected Abort Errors
    // Do NOT log AbortErrors to prevent console spam
    if (error.name === 'AbortError' || error.code === 20) {
      // Silently ignore expected network aborts
    } else {
      console.error("Global Fetch Error:", error);
    }
    throw error;
  }
};

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);