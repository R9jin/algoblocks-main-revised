/*frontend/src/index.jsx*/
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import './index.css';

// =====================================================================
// GLOBAL API INTERCEPTOR (THE MASTER FIX - BULLETPROOFED)
// =====================================================================
const originalFetch = window.fetch;

window.fetch = async (...args) => {
    // 1. Safely extract the URL regardless of whether it's a String, URL, or Request object
    let url = "";
    if (typeof args[0] === 'string') {
        url = args[0];
    } else if (args[0] instanceof URL) {
        url = args[0].toString();
    } else if (args[0] && typeof args[0] === 'object' && 'url' in args[0]) {
        url = args[0].url;
    }

    // 2. STOP THE 404 SPAM: Intercept /api/run locally
    if (url.includes('/api/run')) {
        console.log("Global Fetch: Intercepted /api/run. Execution handled by Pyodide.");
        return new Response(JSON.stringify({ 
            status: "success", 
            message: "Execution handled by browser." 
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // 3. FIX 401 UNAUTHORIZED: Auto-inject the Bearer Token safely
    if (url.includes('/api')) {
        let config = args[1] || {};
        
        // Safely manipulate headers using the native Headers API.
        let newHeaders = new Headers(config.headers);
        
        if (!newHeaders.has('Content-Type')) {
            newHeaders.set('Content-Type', 'application/json');
        }
        
        const token = localStorage.getItem('token');
        if (token) {
            newHeaders.set('Authorization', `Bearer ${token}`);
        }
        
        config.headers = newHeaders;
        args[1] = config;
    }
    
    try {
        const response = await originalFetch.apply(window, args);
        
        // 4. HANDLE EXPIRED SESSIONS
        // If the backend rejects the token, immediately clear it and force a re-login
        // This stops the infinite 401 spam loops in the background.
        if (response.status === 401) {
            console.warn("Global Fetch: 401 Unauthorized detected. Session expired.");
            localStorage.removeItem('token');
            localStorage.removeItem('user'); // Clear user data too just in case
            
            // Only redirect if they aren't already on the login/signup page
            if (!window.location.pathname.includes('/signin') && !window.location.pathname.includes('/signup')) {
                window.location.href = '/signin';
            }
        }
        
        return response;
    } catch (error) {
        console.error("Global Fetch Error:", error);
        throw error;
    }
};

// Start the Service Worker to cache files offline
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);