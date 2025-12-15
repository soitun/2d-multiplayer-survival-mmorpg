import React, { useEffect, useState, useCallback, useRef } from 'react';
import cairnIcon from '../assets/doodads/cairn.png';

export interface CairnNotification {
  id: string;
  cairnNumber: number;
  totalCairns: number;
  title: string;
  isFirstDiscovery: boolean;
  timestamp: number;
}

interface CairnUnlockNotificationProps {
  notification: CairnNotification | null;
  onDismiss: () => void;
}

const NOTIFICATION_DURATION_MS = 6000; // Show for 6 seconds before fading

const CairnUnlockNotification: React.FC<CairnUnlockNotificationProps> = ({ 
  notification,
  onDismiss
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (notification) {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Show notification
      setIsVisible(true);
      setIsFadingOut(false);

      // Start fade out timer
      timeoutRef.current = setTimeout(() => {
        setIsFadingOut(true);
        // Dismiss after fade animation (matches CSS animation duration)
        setTimeout(() => {
          setIsVisible(false);
          onDismiss();
        }, 800);
      }, NOTIFICATION_DURATION_MS);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [notification, onDismiss]);

  if (!notification || !isVisible) {
    return null;
  }

  const { cairnNumber, totalCairns, title, isFirstDiscovery } = notification;

  return (
    <div
      className={`cairn-notification ${isFadingOut ? 'fading-out' : ''}`}
      style={{
        position: 'fixed',
        top: '120px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        backgroundColor: 'rgba(10, 20, 30, 0.95)',
        color: '#00ffff',
        padding: '16px 24px',
        borderRadius: '4px',
        border: isFirstDiscovery 
          ? '2px solid #00ff88' 
          : '1px solid rgba(0, 255, 255, 0.5)',
        boxShadow: isFirstDiscovery 
          ? '0 0 30px rgba(0, 255, 136, 0.6), 0 0 60px rgba(0, 255, 136, 0.3), inset 0 0 30px rgba(0, 255, 136, 0.1)' 
          : '0 0 20px rgba(0, 255, 255, 0.3), inset 0 0 20px rgba(0, 255, 255, 0.05)',
        fontFamily: "'Courier New', 'Consolas', 'Monaco', monospace",
        zIndex: 1000,
        backdropFilter: 'blur(8px)',
        minWidth: '280px',
      }}
    >
      {/* Scanline effect overlay */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 255, 255, 0.02) 2px, rgba(0, 255, 255, 0.02) 4px)',
        pointerEvents: 'none',
        zIndex: 1,
        borderRadius: '4px',
      }} />

      {/* Header with icon */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        marginBottom: '12px',
        position: 'relative',
        zIndex: 2,
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          marginRight: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 255, 136, 0.15)',
          borderRadius: '4px',
          border: '1px solid rgba(0, 255, 136, 0.4)',
          boxShadow: '0 0 12px rgba(0, 255, 136, 0.4)',
        }}>
          <img 
            src={cairnIcon}
            alt="Cairn"
            style={{ 
              width: '24px', 
              height: '24px', 
              imageRendering: 'pixelated',
              filter: 'drop-shadow(0 0 4px rgba(0, 255, 136, 0.8))',
            }}
          />
        </div>
        <span style={{ 
          fontSize: '16px', 
          fontWeight: 'bold',
          textTransform: 'uppercase',
          letterSpacing: '2px',
          color: isFirstDiscovery ? '#00ff88' : '#00ffff',
          textShadow: isFirstDiscovery 
            ? '0 0 10px rgba(0, 255, 136, 0.8)' 
            : '0 0 8px rgba(0, 255, 255, 0.6)',
        }}>
          {isFirstDiscovery ? 'CAIRN DISCOVERED' : 'CAIRN LORE'}
        </span>
      </div>

      {/* Title */}
      <div style={{
        fontSize: '14px',
        color: '#ffffff',
        marginBottom: '8px',
        textAlign: 'center',
        position: 'relative',
        zIndex: 2,
        fontStyle: 'italic',
      }}>
        "{title}"
      </div>

      {/* Progress counter */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        position: 'relative',
        zIndex: 2,
      }}>
        <span style={{ 
          fontSize: '12px', 
          color: 'rgba(0, 255, 255, 0.8)',
          letterSpacing: '1px',
        }}>
          DISCOVERED:
        </span>
        <span style={{ 
          fontSize: '18px',
          fontWeight: 'bold',
          color: '#00ff88',
          textShadow: '0 0 8px rgba(0, 255, 136, 0.8)',
        }}>
          {cairnNumber}
        </span>
        <span style={{ 
          fontSize: '14px',
          color: 'rgba(0, 255, 255, 0.6)',
        }}>
          /
        </span>
        <span style={{ 
          fontSize: '14px',
          color: 'rgba(0, 255, 255, 0.8)',
        }}>
          {totalCairns}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{
        width: '100%',
        height: '4px',
        backgroundColor: 'rgba(0, 255, 255, 0.2)',
        borderRadius: '2px',
        marginTop: '12px',
        overflow: 'hidden',
        position: 'relative',
        zIndex: 2,
      }}>
        <div style={{
          width: `${(cairnNumber / totalCairns) * 100}%`,
          height: '100%',
          backgroundColor: '#00ff88',
          boxShadow: '0 0 8px rgba(0, 255, 136, 0.8)',
          transition: 'width 0.5s ease-out',
        }} />
      </div>

      {/* Corner accents */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '12px',
        height: '12px',
        borderTop: '2px solid #00ff88',
        borderLeft: '2px solid #00ff88',
        zIndex: 2,
      }} />
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: '12px',
        height: '12px',
        borderTop: '2px solid #00ff88',
        borderRight: '2px solid #00ff88',
        zIndex: 2,
      }} />
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '12px',
        height: '12px',
        borderBottom: '2px solid #00ff88',
        borderLeft: '2px solid #00ff88',
        zIndex: 2,
      }} />
      <div style={{
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: '12px',
        height: '12px',
        borderBottom: '2px solid #00ff88',
        borderRight: '2px solid #00ff88',
        zIndex: 2,
      }} />
    </div>
  );
};

// Define keyframes and classes for animations
const styles = `
  @keyframes cairnFadeIn {
    from { 
      opacity: 0; 
      transform: translateX(-50%) translateY(-20px) scale(0.95); 
    }
    to { 
      opacity: 1; 
      transform: translateX(-50%) translateY(0) scale(1); 
    }
  }

  @keyframes cairnFadeOut {
    from { 
      opacity: 1; 
      transform: translateX(-50%) translateY(0) scale(1); 
    }
    to { 
      opacity: 0; 
      transform: translateX(-50%) translateY(-20px) scale(0.95); 
    }
  }

  .cairn-notification {
    animation: cairnFadeIn 0.5s ease-out forwards;
  }

  .cairn-notification.fading-out {
    animation: cairnFadeOut 0.8s ease-out forwards;
  }
`;

// Inject styles into the document head
if (!document.getElementById('cairn-notification-styles')) {
  const styleSheet = document.createElement("style");
  styleSheet.id = 'cairn-notification-styles';
  styleSheet.type = "text/css";
  styleSheet.innerText = styles;
  document.head.appendChild(styleSheet);
}

export default React.memo(CairnUnlockNotification);
