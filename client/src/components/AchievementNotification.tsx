import React, { useEffect, useState } from 'react';
import * as SpacetimeDB from '../generated';

interface AchievementNotificationProps {
  notifications: SpacetimeDB.AchievementUnlockNotification[];
}

const MAX_NOTIFICATIONS = 3;
const NOTIFICATION_TIMEOUT_MS = 5000; // Achievements stay for 5 seconds

const AchievementNotification: React.FC<AchievementNotificationProps> = ({ 
  notifications 
}) => {
  const [visibleNotifications, setVisibleNotifications] = useState<SpacetimeDB.AchievementUnlockNotification[]>([]);

  useEffect(() => {
    // Display latest MAX_NOTIFICATIONS
    setVisibleNotifications(notifications.slice(-MAX_NOTIFICATIONS));
  }, [notifications]);

  if (visibleNotifications.length === 0) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: '80px',
      right: '15px',
      display: 'flex',
      flexDirection: 'column-reverse',
      alignItems: 'flex-end',
      zIndex: 150,
    }}>
      {visibleNotifications.map((notif, index) => {
        const isMostRecent = index === visibleNotifications.length - 1;
        return (
          <div
            key={notif.id.toString()}
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
            }}
          >
            <div style={{ marginRight: '12px', fontSize: '24px' }}>
              🏆
            </div>
            <div style={{ flex: 1 }}>
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

