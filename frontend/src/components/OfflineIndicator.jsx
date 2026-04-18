import { useEffect, useState } from 'react';

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // Event handlers to update state
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    // Listen for network changes
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cleanup listeners on unmount
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Don't render anything if the user is connected
  if (isOnline) return null;

  return (
    <div className="offline-global-indicator">
      <span className="offline-icon">⚠️</span>
      <span>
        <strong>You are offline.</strong> Changes are saving locally and will sync when you reconnect.
      </span>
    </div>
  );
}