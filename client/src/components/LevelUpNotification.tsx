import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { LevelUpNotification as LevelUpNotificationType } from '../generated/types';
import { queueNotificationSound } from '../utils/notificationSoundQueue';

interface LevelUpNotificationProps {
  notifications: LevelUpNotificationType[];
}

const MAX_NOTIFICATIONS = 1; // Only show most recent level up
const NOTIFICATION_TIMEOUT_MS = 4500; // Level up stays for 4.5 seconds
const FADE_OUT_DURATION_MS = 600; // Fade out animation duration
const SEEN_LEVELUPS_STORAGE_KEY = 'broth_seen_levelup_notifications';

// ============================================================================
// Session-Based Notification Filtering
// ============================================================================
// Session start time - captured once when module loads
// Notifications created BEFORE this time are considered "old" and not displayed
// This prevents replaying old level-up notifications after browser cache is cleared
const SESSION_START_TIME = Date.now();

// Convert SpacetimeDB timestamp to milliseconds
function timestampToMs(timestamp: { microsSinceUnixEpoch: bigint } | undefined): number {
    if (!timestamp) return 0;
    return Number(timestamp.microsSinceUnixEpoch / 1000n);
}

// Check if a notification is from BEFORE this session started
function isOldNotification(unlockedAt: { microsSinceUnixEpoch: bigint } | undefined): boolean {
    const notificationTimeMs = timestampToMs(unlockedAt);
    // Add 5 second grace period to handle clock skew
    return notificationTimeMs < (SESSION_START_TIME - 5000);
}

// Load seen level up IDs from localStorage
function loadSeenLevelUpIds(): Set<string> {
  try {
    const stored = localStorage.getItem(SEEN_LEVELUPS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return new Set(parsed);
      }
    }
  } catch (e) {
    console.warn('[LevelUpNotification] Failed to load seen level ups from localStorage:', e);
  }
  return new Set();
}

// Save seen level up IDs to localStorage
function saveSeenLevelUpIds(ids: Set<string>): void {
  try {
    localStorage.setItem(SEEN_LEVELUPS_STORAGE_KEY, JSON.stringify([...ids]));
  } catch (e) {
    console.warn('[LevelUpNotification] Failed to save seen level ups to localStorage:', e);
  }
}

// Time in ms before clicks can dismiss a notification (prevents accidental dismiss while attacking)
const CLICK_GUARD_MS = 1000;

const LevelUpNotification: React.FC<LevelUpNotificationProps> = ({ 
  notifications 
}) => {
  const [visibleNotifications, setVisibleNotifications] = useState<LevelUpNotificationType[]>([]);
  const [fadingOutIds, setFadingOutIds] = useState<Set<string>>(new Set());
  // Initialize dismissedIds from localStorage to persist across page reloads
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => loadSeenLevelUpIds());
  const timeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());
  // Track when each notification was shown to prevent accidental clicks
  const shownAtRefs = useRef<Map<string, number>>(new Map());

  // Dismiss a notification by id with fade animation
  // If fromClick is true, respects the click guard timing
  const dismissNotification = useCallback((id: string, fromClick: boolean = false) => {
    // If this is from a click, check if enough time has passed since showing
    if (fromClick) {
      const shownAt = shownAtRefs.current.get(id);
      if (shownAt && Date.now() - shownAt < CLICK_GUARD_MS) {
        // Ignore click - notification just appeared
        return;
      }
    }
    
    // Clear the timeout if it exists
    const timeout = timeoutRefs.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutRefs.current.delete(id);
    }
    
    // Start fade out
    setFadingOutIds(prev => new Set(prev).add(id));
    
    // Remove after fade animation completes
    setTimeout(() => {
      setDismissedIds(prev => {
        const newSet = new Set(prev).add(id);
        // Persist to localStorage so it won't show again on next login
        saveSeenLevelUpIds(newSet);
        return newSet;
      });
      setFadingOutIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      // Clean up shownAt ref
      shownAtRefs.current.delete(id);
    }, FADE_OUT_DURATION_MS);
  }, []);

  useEffect(() => {
    // Filter notifications:
    // 1. Exclude already dismissed notifications
    // 2. CRITICAL: Exclude old notifications from before this session started
    //    This prevents replaying level-up celebrations after browser cache is cleared
    const newVisible = notifications
      .filter(n => {
        const id = n.id.toString();
        // Skip if already dismissed this session
        if (dismissedIds.has(id)) return false;
        
        // CRITICAL: Skip old notifications from before session started
        // This is the primary defense against cache-clear replay
        if (isOldNotification(n.unlockedAt)) {
          // Silently mark as dismissed without displaying
          setDismissedIds(prev => new Set(prev).add(id));
          return false;
        }
        
        return true;
      })
      .slice(-MAX_NOTIFICATIONS);
    
    setVisibleNotifications(newVisible);

    // Set up auto-dismiss timers for new notifications
    newVisible.forEach(notif => {
      const id = notif.id.toString();
      if (!timeoutRefs.current.has(id) && !fadingOutIds.has(id)) {
        // Track when this notification was first shown (for click guard)
        if (!shownAtRefs.current.has(id)) {
          shownAtRefs.current.set(id, Date.now());
        }
        
        // Queue level up sound - the queue manager handles:
        // - Not playing over other SOVA sounds (tutorials, cairn lore, intro)
        // - Not playing over other notification sounds (achievements, missions)
        // - Playing SFX with debounce
        queueNotificationSound('level_up');
        
        const timeout = setTimeout(() => {
          dismissNotification(id, false); // Auto-dismiss, not from click
        }, NOTIFICATION_TIMEOUT_MS);
        timeoutRefs.current.set(id, timeout);
      }
    });
  }, [notifications, dismissedIds, fadingOutIds, dismissNotification]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach(timeout => clearTimeout(timeout));
      timeoutRefs.current.clear();
      shownAtRefs.current.clear();
    };
  }, []);

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
        const notifId = notif.id.toString();
        const isFadingOut = fadingOutIds.has(notifId);
        return (
          <div
            key={notifId}
            onClick={() => dismissNotification(notifId, true)}
            className={`level-up-container ${isFadingOut ? 'fade-out' : 'fade-in'}`}
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '0',
              cursor: 'pointer',
              pointerEvents: 'auto',
            }}
          >
            {/* Outer glow container */}
            <div className="glow-container">
              {/* Main notification box */}
              <div className="notification-box">
                {/* Scanline overlay */}
                <div className="scanlines" />
                
                {/* Corner accents */}
                <div className="corner-accent top-left" />
                <div className="corner-accent top-right" />
                <div className="corner-accent bottom-left" />
                <div className="corner-accent bottom-right" />
                
                {/* Header bar */}
                <div className="header-bar">
                  <span className="header-text">// SYSTEM UPGRADE</span>
                  <div className="header-dots">
                    <span className="dot cyan" />
                    <span className="dot purple" />
                    <span className="dot pink" />
                  </div>
                </div>
                
                {/* Main content */}
                <div className="content">
                  {/* Glitch text effect for LEVEL UP */}
                  <div className="level-up-text" data-text="LEVEL UP">
                    <span className="glitch-layer layer-1">LEVEL UP</span>
                    <span className="glitch-layer layer-2">LEVEL UP</span>
                    <span className="main-text">LEVEL UP</span>
                  </div>
                  
                  {/* Level number with circuit decoration */}
                  <div className="level-display">
                    <div className="circuit-line left" />
                    <div className="level-number">
                      <span className="level-prefix">LVL</span>
                      <span className="level-value">{notif.newLevel}</span>
                    </div>
                    <div className="circuit-line right" />
                  </div>
                  
                  {/* XP awarded */}
                  {notif.xpAwarded > 0 && (
                    <div className="xp-display">
                      <span className="xp-icon">◆</span>
                      <span className="xp-value">+{notif.xpAwarded}</span>
                      <span className="xp-label">XP ACQUIRED</span>
                    </div>
                  )}
                  
                  {/* Memory Shards awarded */}
                  {notif.shardsAwarded > 0 && (
                    <div className="shards-display">
                      <span className="shards-icon">💠</span>
                      <span className="shards-value">+{notif.shardsAwarded.toLocaleString()}</span>
                      <span className="shards-label">MEMORY SHARDS</span>
                    </div>
                  )}
                </div>
                
                {/* Footer bar */}
                <div className="footer-bar">
                  <div className="progress-bar">
                    <div className="progress-fill" />
                  </div>
                  <span className="footer-text">CLICK TO DISMISS</span>
                </div>
              </div>
            </div>
            
            {/* Floating particles */}
            <div className="particles">
              {[...Array(8)].map((_, i) => (
                <div key={i} className={`particle particle-${i}`} />
              ))}
            </div>
          </div>
        );
      })}
      
      <style>{`
        /* Main animations */
        @keyframes fadeInScale {
          0% { 
            transform: scale(0.7) translateY(20px); 
            opacity: 0; 
            filter: blur(10px);
          }
          50% { 
            transform: scale(1.05) translateY(-5px); 
            filter: blur(0);
          }
          100% { 
            transform: scale(1) translateY(0); 
            opacity: 1; 
          }
        }
        
        @keyframes fadeOutScale {
          0% { 
            transform: scale(1) translateY(0); 
            opacity: 1; 
          }
          100% { 
            transform: scale(0.8) translateY(-30px); 
            opacity: 0; 
            filter: blur(10px);
          }
        }
        
        @keyframes glowPulse {
          0%, 100% { 
            box-shadow: 
              0 0 20px rgba(0, 212, 255, 0.4),
              0 0 40px rgba(0, 212, 255, 0.2),
              0 0 60px rgba(124, 58, 237, 0.1),
              inset 0 0 30px rgba(0, 212, 255, 0.1);
          }
          50% { 
            box-shadow: 
              0 0 30px rgba(0, 212, 255, 0.6),
              0 0 60px rgba(0, 212, 255, 0.3),
              0 0 90px rgba(124, 58, 237, 0.2),
              inset 0 0 40px rgba(0, 212, 255, 0.15);
          }
        }
        
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        
        @keyframes glitchText {
          0%, 100% { 
            transform: translate(0); 
            opacity: 0.8;
          }
          20% { 
            transform: translate(-2px, 2px); 
            opacity: 1;
          }
          40% { 
            transform: translate(-2px, -2px); 
            opacity: 0.8;
          }
          60% { 
            transform: translate(2px, 2px); 
            opacity: 1;
          }
          80% { 
            transform: translate(2px, -2px); 
            opacity: 0.8;
          }
        }
        
        @keyframes glitchText2 {
          0%, 100% { 
            transform: translate(0); 
            opacity: 0.6;
          }
          25% { 
            transform: translate(2px, -1px); 
            opacity: 0.8;
          }
          50% { 
            transform: translate(-1px, 2px); 
            opacity: 0.6;
          }
          75% { 
            transform: translate(1px, 1px); 
            opacity: 0.8;
          }
        }
        
        @keyframes progressFill {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: 1; }
          50% { transform: translateY(-20px) rotate(180deg); opacity: 0.5; }
        }
        
        @keyframes circuitGlow {
          0%, 100% { opacity: 0.3; width: 30px; }
          50% { opacity: 1; width: 50px; }
        }
        
        @keyframes textGlow {
          0%, 100% { text-shadow: 0 0 10px #00d4ff, 0 0 20px #00d4ff, 0 0 40px #7c3aed; }
          50% { text-shadow: 0 0 20px #00d4ff, 0 0 40px #00d4ff, 0 0 60px #7c3aed, 0 0 80px #ff006e; }
        }
        
        @keyframes dotPulse {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.3); opacity: 1; }
        }
        
        /* Container states */
        .level-up-container.fade-in {
          animation: fadeInScale 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        
        .level-up-container.fade-out {
          animation: fadeOutScale 0.6s ease-in forwards;
        }
        
        /* Glow container */
        .glow-container {
          position: relative;
          padding: 3px;
          background: linear-gradient(135deg, #00d4ff, #7c3aed, #ff006e, #00d4ff);
          background-size: 300% 300%;
          animation: gradientShift 3s ease infinite;
          border-radius: 12px;
        }
        
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        
        /* Main notification box */
        .notification-box {
          position: relative;
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.95) 100%);
          border-radius: 10px;
          min-width: 340px;
          overflow: hidden;
          animation: glowPulse 2s ease-in-out infinite;
        }
        
        /* Scanlines overlay */
        .scanlines {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 212, 255, 0.03) 2px,
            rgba(0, 212, 255, 0.03) 4px
          );
          pointer-events: none;
          z-index: 10;
        }
        
        .scanlines::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 100%;
          background: linear-gradient(
            180deg,
            transparent 0%,
            rgba(0, 212, 255, 0.1) 50%,
            transparent 100%
          );
          animation: scanline 3s linear infinite;
          pointer-events: none;
        }
        
        /* Corner accents */
        .corner-accent {
          position: absolute;
          width: 20px;
          height: 20px;
          border: 2px solid #00d4ff;
          z-index: 5;
        }
        
        .corner-accent.top-left {
          top: 8px;
          left: 8px;
          border-right: none;
          border-bottom: none;
        }
        
        .corner-accent.top-right {
          top: 8px;
          right: 8px;
          border-left: none;
          border-bottom: none;
        }
        
        .corner-accent.bottom-left {
          bottom: 8px;
          left: 8px;
          border-right: none;
          border-top: none;
        }
        
        .corner-accent.bottom-right {
          bottom: 8px;
          right: 8px;
          border-left: none;
          border-top: none;
        }
        
        /* Header bar */
        .header-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 20px;
          background: rgba(0, 212, 255, 0.1);
          border-bottom: 1px solid rgba(0, 212, 255, 0.3);
        }
        
        .header-text {
          font-family: 'Courier New', 'Consolas', monospace;
          font-size: 11px;
          color: #00d4ff;
          letter-spacing: 2px;
          text-transform: uppercase;
        }
        
        .header-dots {
          display: flex;
          gap: 6px;
        }
        
        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        
        .dot.cyan {
          background: #00d4ff;
          animation: dotPulse 1s ease-in-out infinite;
        }
        
        .dot.purple {
          background: #7c3aed;
          animation: dotPulse 1s ease-in-out infinite 0.2s;
        }
        
        .dot.pink {
          background: #ff006e;
          animation: dotPulse 1s ease-in-out infinite 0.4s;
        }
        
        /* Main content */
        .content {
          padding: 24px 28px;
          text-align: center;
        }
        
        /* Glitch text effect */
        .level-up-text {
          position: relative;
          font-family: 'Courier New', 'Consolas', monospace;
          font-size: 42px;
          font-weight: bold;
          letter-spacing: 4px;
          margin-bottom: 16px;
        }
        
        .level-up-text .main-text {
          position: relative;
          color: #ffffff;
          text-shadow: 0 0 10px #00d4ff, 0 0 20px #00d4ff;
          animation: textGlow 2s ease-in-out infinite;
          z-index: 2;
        }
        
        .level-up-text .glitch-layer {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          z-index: 1;
        }
        
        .level-up-text .layer-1 {
          color: #00d4ff;
          animation: glitchText 0.3s infinite;
          clip-path: polygon(0 0, 100% 0, 100% 45%, 0 45%);
        }
        
        .level-up-text .layer-2 {
          color: #ff006e;
          animation: glitchText2 0.3s infinite;
          clip-path: polygon(0 55%, 100% 55%, 100% 100%, 0 100%);
        }
        
        /* Level display */
        .level-display {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin-bottom: 16px;
        }
        
        .circuit-line {
          height: 2px;
          background: linear-gradient(90deg, transparent, #00d4ff, transparent);
          animation: circuitGlow 1.5s ease-in-out infinite;
        }
        
        .circuit-line.left {
          background: linear-gradient(90deg, transparent, #00d4ff);
        }
        
        .circuit-line.right {
          background: linear-gradient(90deg, #00d4ff, transparent);
        }
        
        .level-number {
          display: flex;
          align-items: baseline;
          gap: 8px;
        }
        
        .level-prefix {
          font-family: 'Courier New', 'Consolas', monospace;
          font-size: 14px;
          color: #94a3b8;
          letter-spacing: 2px;
        }
        
        .level-value {
          font-family: 'Courier New', 'Consolas', monospace;
          font-size: 56px;
          font-weight: bold;
          color: #ffd700;
          text-shadow: 
            0 0 10px #ffd700, 
            0 0 20px #ffd700, 
            0 0 40px #ff9500,
            2px 2px 0 rgba(0, 0, 0, 0.5);
          line-height: 1;
        }
        
        /* XP display */
        .xp-display {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 20px;
          background: rgba(0, 212, 255, 0.1);
          border: 1px solid rgba(0, 212, 255, 0.3);
          border-radius: 4px;
          margin-top: 8px;
        }
        
        .xp-icon {
          color: #7c3aed;
          font-size: 12px;
        }
        
        .xp-value {
          font-family: 'Courier New', 'Consolas', monospace;
          font-size: 18px;
          font-weight: bold;
          color: #00d4ff;
          text-shadow: 0 0 10px #00d4ff;
        }
        
        .xp-label {
          font-family: 'Courier New', 'Consolas', monospace;
          font-size: 10px;
          color: #64748b;
          letter-spacing: 2px;
          text-transform: uppercase;
        }
        
        /* Shards display */
        .shards-display {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 20px;
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.15), rgba(255, 0, 110, 0.1));
          border: 1px solid rgba(124, 58, 237, 0.4);
          border-radius: 4px;
          margin-top: 8px;
        }
        
        .shards-icon {
          font-size: 16px;
          filter: drop-shadow(0 0 4px rgba(124, 58, 237, 0.8));
        }
        
        .shards-value {
          font-family: 'Courier New', 'Consolas', monospace;
          font-size: 18px;
          font-weight: bold;
          color: #a855f7;
          text-shadow: 0 0 10px rgba(168, 85, 247, 0.8);
        }
        
        .shards-label {
          font-family: 'Courier New', 'Consolas', monospace;
          font-size: 10px;
          color: #64748b;
          letter-spacing: 2px;
          text-transform: uppercase;
        }
        
        /* Footer bar */
        .footer-bar {
          padding: 10px 20px;
          background: rgba(0, 0, 0, 0.3);
          border-top: 1px solid rgba(0, 212, 255, 0.2);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        
        .progress-bar {
          height: 3px;
          background: rgba(0, 212, 255, 0.2);
          border-radius: 2px;
          overflow: hidden;
        }
        
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #00d4ff, #7c3aed);
          animation: progressFill ${NOTIFICATION_TIMEOUT_MS}ms linear forwards;
        }
        
        .footer-text {
          font-family: 'Courier New', 'Consolas', monospace;
          font-size: 9px;
          color: #475569;
          letter-spacing: 1px;
          text-align: center;
          text-transform: uppercase;
        }
        
        /* Floating particles */
        .particles {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: -1;
        }
        
        .particle {
          position: absolute;
          width: 6px;
          height: 6px;
          background: #00d4ff;
          border-radius: 50%;
          box-shadow: 0 0 10px #00d4ff;
        }
        
        .particle-0 { top: -20px; left: 20%; animation: float 2s ease-in-out infinite 0s; }
        .particle-1 { top: -30px; left: 80%; animation: float 2.5s ease-in-out infinite 0.3s; background: #7c3aed; box-shadow: 0 0 10px #7c3aed; }
        .particle-2 { top: 50%; left: -20px; animation: float 2s ease-in-out infinite 0.5s; }
        .particle-3 { top: 50%; right: -20px; animation: float 2.2s ease-in-out infinite 0.7s; background: #ff006e; box-shadow: 0 0 10px #ff006e; }
        .particle-4 { bottom: -20px; left: 30%; animation: float 2.4s ease-in-out infinite 0.2s; background: #ffd700; box-shadow: 0 0 10px #ffd700; }
        .particle-5 { bottom: -30px; left: 70%; animation: float 2.1s ease-in-out infinite 0.4s; }
        .particle-6 { top: 30%; left: -15px; animation: float 2.3s ease-in-out infinite 0.6s; background: #7c3aed; box-shadow: 0 0 10px #7c3aed; }
        .particle-7 { top: 70%; right: -15px; animation: float 2.6s ease-in-out infinite 0.8s; background: #ff006e; box-shadow: 0 0 10px #ff006e; }
      `}</style>
    </div>
  );
};

export default LevelUpNotification;
