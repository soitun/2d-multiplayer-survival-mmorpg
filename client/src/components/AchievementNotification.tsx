import React, { useEffect, useState, useRef, useCallback } from 'react';
import * as SpacetimeDB from '../generated';

interface AchievementNotificationProps {
  notifications: SpacetimeDB.AchievementUnlockNotification[];
}

const MAX_NOTIFICATIONS = 3;
const NOTIFICATION_TIMEOUT_MS = 6000; // Achievements stay for 6 seconds

const AchievementNotification: React.FC<AchievementNotificationProps> = ({ 
  notifications 
}) => {
  const [visibleNotifications, setVisibleNotifications] = useState<SpacetimeDB.AchievementUnlockNotification[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const timeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Dismiss a notification by id
  const dismissNotification = useCallback((id: string) => {
    setDismissedIds(prev => new Set(prev).add(id));
    // Clear the timeout if it exists
    const timeout = timeoutRefs.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutRefs.current.delete(id);
    }
  }, []);

  useEffect(() => {
    // Get the latest notifications excluding dismissed ones
    const newVisible = notifications
      .filter(n => !dismissedIds.has(n.id.toString()))
      .slice(-MAX_NOTIFICATIONS);
    
    setVisibleNotifications(newVisible);

    // Set up auto-dismiss timers for new notifications
    newVisible.forEach(notif => {
      const id = notif.id.toString();
      if (!timeoutRefs.current.has(id)) {
        const timeout = setTimeout(() => {
          dismissNotification(id);
        }, NOTIFICATION_TIMEOUT_MS);
        timeoutRefs.current.set(id, timeout);
      }
    });

    // Cleanup old timeouts
    return () => {
      // Don't clear on every render, only on unmount
    };
  }, [notifications, dismissedIds, dismissNotification]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach(timeout => clearTimeout(timeout));
      timeoutRefs.current.clear();
    };
  }, []);

  if (visibleNotifications.length === 0) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: '140px', // Moved lower to avoid DayNightCycleTracker
      right: '15px',
      display: 'flex',
      flexDirection: 'column-reverse',
      alignItems: 'flex-end',
      zIndex: 150,
    }}>
      {visibleNotifications.map((notif, index) => {
        const isMostRecent = index === visibleNotifications.length - 1;
        const notifId = notif.id.toString();
        return (
          <div
            key={notifId}
            onClick={() => dismissNotification(notifId)}
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: isMostRecent ? 'rgba(0, 20, 40, 0.95)' : 'rgba(0, 10, 30, 0.9)',
              color: '#ffd700',
              padding: '12px 16px',
              borderRadius: '4px',
              border: isMostRecent 
                ? '2px solid #ffd700' 
                : '1px solid rgba(255, 215, 0, 0.5)',
              marginBottom: '8px',
              boxShadow: isMostRecent 
                ? '0 0 20px rgba(255, 215, 0, 0.7), inset 0 0 30px rgba(255, 215, 0, 0.1)' 
                : 'inset 0 0 20px rgba(255, 215, 0, 0.05)',
              fontFamily: "'Courier New', 'Consolas', 'Monaco', monospace",
              fontSize: '12px',
              fontWeight: 'bold',
              minWidth: '280px',
              maxWidth: '350px',
              transition: 'all 0.3s ease-out',
              backdropFilter: 'blur(4px)',
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            {/* Close button */}
            <div 
              onClick={(e) => { e.stopPropagation(); dismissNotification(notifId); }}
              style={{
                position: 'absolute',
                top: '4px',
                right: '4px',
                width: '18px',
                height: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                color: 'rgba(255, 215, 0, 0.6)',
                cursor: 'pointer',
                borderRadius: '50%',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#ffd700';
                e.currentTarget.style.backgroundColor = 'rgba(255, 215, 0, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(255, 215, 0, 0.6)';
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              ×
            </div>
            <div style={{ marginRight: '12px', fontSize: '24px' }}>
              🏆
            </div>
            <div style={{ flex: 1, paddingRight: '16px' }}>
              <div style={{ 
                color: '#ffd700', 
                fontSize: '13px',
                marginBottom: '4px',
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}>
                Achievement Unlocked!
              </div>
              <div style={{ 
                color: '#ffffff', 
                fontSize: '14px',
                fontWeight: 'bold',
                marginBottom: '2px',
              }}>
                {notif.achievementName}
              </div>
              {notif.xpAwarded > 0 && (
                <div style={{ 
                  color: '#00ffff', 
                  fontSize: '11px',
                  marginTop: '4px',
                }}>
                  +{notif.xpAwarded} XP
                </div>
              )}
              {notif.titleAwarded && (
                <div style={{ 
                  color: '#ff6b9d', 
                  fontSize: '11px',
                  marginTop: '2px',
                }}>
                  Title: {notif.titleAwarded}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AchievementNotification;

