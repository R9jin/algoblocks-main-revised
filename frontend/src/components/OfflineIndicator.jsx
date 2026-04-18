import { useEffect, useRef, useState } from 'react';

export default function OfflineIndicator() {
    const [status, setStatus] = useState('online'); // 'online', 'offline', 'restored'
    const [isVisible, setIsVisible] = useState(false);

    // We use a ref to track the current status inside the setInterval closure
    const statusRef = useRef('online');

    useEffect(() => {
        let hideTimeout;

        // Helper: Safely transition to "Online/Restored"
        const triggerOnline = () => {
            if (statusRef.current === 'offline') {
                statusRef.current = 'restored';
                setStatus('restored');
                setIsVisible(true);

                clearTimeout(hideTimeout);
                hideTimeout = setTimeout(() => {
                    setIsVisible(false);
                    // Wait for the CSS slide-out animation to finish before resetting
                    setTimeout(() => {
                        statusRef.current = 'online';
                        setStatus('online');
                    }, 400);
                }, 3000);
            }
        };

        // Helper: Safely transition to "Offline"
        const triggerOffline = () => {
            if (statusRef.current !== 'offline') {
                statusRef.current = 'offline';
                setStatus('offline');
                setIsVisible(true);
                clearTimeout(hideTimeout);
            }
        };

        // 1. Standard Browser Events (Fastest, but sometimes fooled by OS virtual adapters)
        window.addEventListener('online', triggerOnline);
        window.addEventListener('offline', triggerOffline);

        // 2. Active Polling (The safety net for Laptops with VPNs / Virtual Adapters)
        const checkRealConnectivity = async () => {
            // If the browser already admits it's offline, trust it immediately
            if (!navigator.onLine) {
                triggerOffline();
                return;
            }

            try {
                // Ping an external resource the Service Worker won't cache
                // mode: 'no-cors' prevents CORS errors.
                // ?t=Date.now() prevents the browser from caching the response.
                await fetch('https://www.google.com/favicon.ico?t=' + Date.now(), {
                    mode: 'no-cors',
                    cache: 'no-store',
                });

                // Fetch succeeded = real internet is active
                triggerOnline();
            } catch (error) {
                // Fetch failed = fake internet (Virtual Adapter/VPN is tricking the browser)
                triggerOffline();
            }
        };

        // Check the real connection every 5 seconds
        const pollingInterval = setInterval(checkRealConnectivity, 5000);

        // Do an immediate check on mount
        checkRealConnectivity();

        return () => {
            window.removeEventListener('online', triggerOnline);
            window.removeEventListener('offline', triggerOffline);
            clearInterval(pollingInterval);
            clearTimeout(hideTimeout);
        };
    }, []);

    // completely remove it from the DOM if we are safely online and not animating
    if (!isVisible && status === 'online') return null;

    return (
        <div className={`network-popup ${status} ${isVisible ? 'show' : 'hide'}`}>
            <div className="network-popup-content">
                {status === 'offline' ? (
                    <>
                        <span className="network-icon">⚠️</span>
                        <div>
                            <strong>Connection Lost</strong>
                            <p>You are working offline. Changes will sync later.</p>
                        </div>
                    </>
                ) : (
                    <>
                        <span className="network-icon">✅</span>
                        <div>
                            <strong>Back Online</strong>
                            <p>Your connection has been restored.</p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}