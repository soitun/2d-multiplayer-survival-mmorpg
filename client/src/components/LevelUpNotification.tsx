import React, { useEffect, useState } from 'react';
import * as SpacetimeDB from '../generated';

interface LevelUpNotificationProps {
  notifications: SpacetimeDB.LevelUpNotification[];
}

const MAX_NOTIFICATIONS = 1; // Only show most recent level up
const NOTIFICATION_TIMEOUT_MS = 4000; // Level up stays for 4 seconds

const LevelUpNotification: React.FC<LevelUpNotificationProps> = ({ 
  notifications 
}) => {
  const [visibleNotifications, setVisibleNotifications] = useState<SpacetimeDB.LevelUpNotification[]>([]);

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
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 200,
      pointerEvents: 'none',
    }}>
      {visibleNotifications.map((notif) => {
        return (
          <div
            key={notif.id.toString()}
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
              animation: 'pulse 0.5s ease-out',
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
          0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0; }
          50% { transform: translate(-50%, -50%) scale(1.1); }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default LevelUpNotification;

