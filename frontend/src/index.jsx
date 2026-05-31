/*frontend/src/index.jsx*/
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import './index.css';

// =====================================================================
// GLOBAL API INTERCEPTOR
// =====================================================================
const originalFetch = window.fetch;

window.fetch = async (...args) => {
    let url = "";
    if (typeof args[0] === 'string') url = args[0];
    else if (args[0] instanceof URL) url = args[0].toString();
    else if (args[0] && typeof args[0] === 'object' && 'url' in args[0]) url = args[0].url;

    // 1. Intercept /api/run locally for Pyodide
    if (url.includes('/api/run')) {
        return new Response(JSON.stringify({ 
            status: "success", message: "Execution handled by browser." 
        }), { status: 200, headers: { 'Content-Type': 'application/json' }});
    }

    // 2. Inject Tokens
    if (url.includes('/api')) {
        let config = args[1] || {};
        let newHeaders = new Headers(config.headers);
        
        if (!newHeaders.has('Content-Type')) newHeaders.set('Content-Type', 'application/json');
        
        const token = localStorage.getItem('token');
        if (token) newHeaders.set('Authorization', `Bearer ${token}`);
        
        config.headers = newHeaders;
        args[1] = config;
    }
    
    try {
        const response = await originalFetch.apply(window, args);
        
        // 3. Handle Expired Sessions
        // ONLY trigger if the request was not a login/signup attempt
        if (response.status === 401 && !url.includes('/login') && !url.includes('/signup') && !url.includes('/google-login')) {
            console.warn("Global Fetch: 401 Unauthorized detected. Session expired.");
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            
            // Only redirect if NOT already on an auth page
            const currentPath = window.location.pathname;
            if (currentPath !== '/' && !currentPath.includes('/signin') && !currentPath.includes('/signup')) {
                window.location.href = '/signin';
            }
        }
        
        return response;
    } catch (error) {
        console.error("Global Fetch Error:", error);
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