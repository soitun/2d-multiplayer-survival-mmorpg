import React, { useEffect, useState, useRef } from 'react';
import * as SpacetimeDB from '../generated';

interface LevelUpNotificationProps {
  notifications: SpacetimeDB.LevelUpNotification[];
}

const MAX_NOTIFICATIONS = 1; // Only show most recent level up
const NOTIFICATION_TIMEOUT_MS = 4000; // Level up stays for 4 seconds
const FADE_OUT_DURATION_MS = 500; // Fade out animation duration

const LevelUpNotification: React.FC<LevelUpNotificationProps> = ({ 
  notifications 
}) => {
  const [visibleNotifications, setVisibleNotifications] = useState<SpacetimeDB.LevelUpNotification[]>([]);
  const [fadingOutIds, setFadingOutIds] = useState<Set<bigint>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<bigint>>(new Set());
  const timeoutRefs = useRef<Map<bigint, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    // Display latest MAX_NOTIFICATIONS, excluding dismissed ones
    const latestNotifications = notifications
      .filter(notif => !dismissedIds.has(notif.id))
      .slice(-MAX_NOTIFICATIONS);
    setVisibleNotifications(latestNotifications);

    // Clear existing timeouts
    timeoutRefs.current.forEach(timeout => clearTimeout(timeout));
    timeoutRefs.current.clear();

    // Set up auto-dismiss timeouts for new notifications
    latestNotifications.forEach(notif => {
      const timeoutId = setTimeout(() => {
        // Start fade out
        setFadingOutIds(prev => new Set(prev).add(notif.id));
        
        // Remove after fade animation completes
        setTimeout(() => {
          setVisibleNotifications(prev => prev.filter(n => n.id !== notif.id));
          setFadingOutIds(prev => {
            const next = new Set(prev);
            next.delete(notif.id);
            return next;
          });
        }, FADE_OUT_DURATION_MS);
      }, NOTIFICATION_TIMEOUT_MS);
      
      timeoutRefs.current.set(notif.id, timeoutId);
    });

    // Cleanup on unmount
    return () => {
      timeoutRefs.current.forEach(timeout => clearTimeout(timeout));
      timeoutRefs.current.clear();
    };
  }, [notifications, dismissedIds]);

  const handleDismiss = (notifId: bigint) => {
    // Clear timeout if exists
    const timeout = timeoutRefs.current.get(notifId);
    if (timeout) {
      clearTimeout(timeout);
      timeoutRefs.current.delete(notifId);
    }

    // Add to dismissed set so it won't reappear from props
    setDismissedIds(prev => new Set(prev).add(notifId));

    // Start fade out
    setFadingOutIds(prev => new Set(prev).add(notifId));
    
    // Remove after fade animation completes
    setTimeout(() => {
      setVisibleNotifications(prev => prev.filter(n => n.id !== notifId));
      setFadingOutIds(prev => {
        const next = new Set(prev);
        next.delete(notifId);
        return next;
      });
    }, FADE_OUT_DURATION_MS);
  };

  if (visibleNotifications.length === 0) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 200,
      pointerEvents: 'none',
    }}>
      {visibleNotifications.map((notif) => {
        const isFadingOut = fadingOutIds.has(notif.id);
        return (
          <div
            key={notif.id.toString()}
            onClick={() => handleDismiss(notif.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              backgroundColor: 'rgba(0, 30, 60, 0.95)',
              color: '#00ffff',
              padding: '24px 32px',
              borderRadius: '8px',
              border: '3px solid #00ffff',
              boxShadow: '0 0 40px rgba(0, 255, 255, 0.8), inset 0 0 40px rgba(0, 255, 255, 0.2)',
              fontFamily: "'Courier New', 'Consolas', 'Monaco', monospace",
              fontSize: '18px',
              fontWeight: 'bold',
              minWidth: '300px',
              textAlign: 'center',
              animation: isFadingOut ? 'fadeOut 0.5s ease-out forwards' : 'pulse 0.5s ease-out',
              cursor: 'pointer',
              pointerEvents: 'auto',
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>
              ⭐ LEVEL UP! ⭐
            </div>
            <div style={{ 
              fontSize: '32px',
              color: '#ffd700',
              marginBottom: '8px',
            }}>
              Level {notif.newLevel}
            </div>
            {notif.xpAwarded > 0 && (
              <div style={{ 
                fontSize: '14px',
                color: '#00ffff',
                marginTop: '8px',
              }}>
                +{notif.xpAwarded} XP
              </div>
            )}
          </div>
        );
      })}
      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.8); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeOut {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(0.8); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default LevelUpNotification;

