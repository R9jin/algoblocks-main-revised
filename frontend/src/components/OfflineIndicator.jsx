import { useEffect, useState } from 'react';

export default function OfflineIndicator() {
    const [status, setStatus] = useState('online'); // 'online', 'offline', 'restored'
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const handleOnline = () => {
            // Show the success popup when connection returns
            setStatus('restored');
            setIsVisible(true);

            // Auto-hide the "restored" popup after 3 seconds
            setTimeout(() => {
                setIsVisible(false);
                // Wait for the slide-out animation to finish before resetting state completely
                setTimeout(() => setStatus('online'), 400);
            }, 3000);
        };

        const handleOffline = () => {
            // Show the error popup immediately when connection drops
            setStatus('offline');
            setIsVisible(true);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Check initial load state
        if (!navigator.onLine) {
            setStatus('offline');
            setIsVisible(true);
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
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