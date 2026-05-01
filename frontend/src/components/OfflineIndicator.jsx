import { useEffect, useRef, useState } from 'react';

export default function OfflineIndicator() {
    const [status, setStatus] = useState('online'); // 'online', 'offline', 'restored'
    const [isVisible, setIsVisible] = useState(false);
    
    // NEW: Track if the banner should be faded out
    const [isFaded, setIsFaded] = useState(false); 

    const statusRef = useRef('online');

    useEffect(() => {
        let hideTimeout;
        let fadeTimeout; // NEW: Timeout for fading

        const triggerOnline = () => {
            if (statusRef.current === 'offline') {
                statusRef.current = 'restored';
                setStatus('restored');
                setIsVisible(true);
                setIsFaded(false); // Reset fade when coming back online

                clearTimeout(hideTimeout);
                clearTimeout(fadeTimeout);

                hideTimeout = setTimeout(() => {
                    setIsVisible(false);
                    setTimeout(() => {
                        statusRef.current = 'online';
                        setStatus('online');
                    }, 400);
                }, 3000);
            }
        };

        const triggerOffline = () => {
            if (statusRef.current !== 'offline') {
                statusRef.current = 'offline';
                setStatus('offline');
                setIsVisible(true);
                setIsFaded(false); // Start fully visible
                
                clearTimeout(hideTimeout);
                clearTimeout(fadeTimeout);

                // NEW: Fade the indicator out after 5 seconds
                // (Change 5000 to 60000 if you really want 1 full minute)
                fadeTimeout = setTimeout(() => {
                    setIsFaded(true);
                }, 5000);
            }
        };

        window.addEventListener('online', triggerOnline);
        window.addEventListener('offline', triggerOffline);

        const checkRealConnectivity = async () => {
            if (!navigator.onLine) {
                triggerOffline();
                return;
            }
            try {
                await fetch('https://www.google.com/favicon.ico?t=' + Date.now(), {
                    mode: 'no-cors',
                    cache: 'no-store',
                });
                triggerOnline();
            } catch (error) {
                triggerOffline();
            }
        };

        const pollingInterval = setInterval(checkRealConnectivity, 5000);
        checkRealConnectivity();

        return () => {
            window.removeEventListener('online', triggerOnline);
            window.removeEventListener('offline', triggerOffline);
            clearInterval(pollingInterval);
            clearTimeout(hideTimeout);
            clearTimeout(fadeTimeout); // Cleanup
        };
    }, []);

    if (!isVisible && status === 'online') return null;

    return (
        // NEW: Apply the 'faded' class dynamically
        <div className={`network-popup ${status} ${isVisible ? 'show' : 'hide'} ${isFaded ? 'faded' : ''}`}>
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