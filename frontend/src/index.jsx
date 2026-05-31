/*frontend\src\index.jsx*/
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import './index.css';

// =====================================================================
// GLOBAL API INTERCEPTOR (THE MASTER FIX)
// =====================================================================
// This intercepts every single fetch() call made by ActivityApp.jsx, 
// Dashboard.jsx, AssessmentPage.jsx, and all other components to 
// automatically inject the Authorization token. 
const originalFetch = window.fetch;
window.fetch = async (...args) => {
    let [resource, config] = args;
    
    // 1. STOP THE 404 SPAM: Intercept /api/run locally
    // Since Pyodide handles Python in the browser, we intercept the old 
    // run calls so they don't flood the backend with 404 Not Found errors.
    if (typeof resource === 'string' && resource.includes('/api/run')) {
        console.log("Global Fetch: Intercepted /api/run. Execution handled by Pyodide.");
        return new Response(JSON.stringify({ 
            status: "success", 
            message: "Execution handled by browser." 
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // 2. FIX 401 UNAUTHORIZED: Auto-inject the Bearer Token
    if (typeof resource === 'string' && resource.includes('/api')) {
        config = config || {};
        config.headers = {
            ...config.headers,
            'Content-Type': 'application/json'
        };
        
        const token = localStorage.getItem('token');
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
    }
    
    try {
        const response = await originalFetch(resource, config);
        
        // 3. HANDLE EXPIRED SESSIONS
        // If a token expires while they are using the app, gracefully clear it
        if (response.status === 401) {
            console.warn("Global Fetch: 401 Unauthorized detected. Token has expired.");
            localStorage.removeItem('token');
            // If you want to automatically kick them to the login screen when it expires,
            // uncomment the line below:
            // window.location.href = '/signin';
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