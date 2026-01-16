import React, { useEffect, useState, useRef, useCallback } from 'react';
import * as SpacetimeDB from '../generated';
import { queueNotificationSound } from '../utils/notificationSoundQueue';

interface AchievementNotificationProps {
  notifications: SpacetimeDB.AchievementUnlockNotification[];
  onOpenAchievements?: () => void;
  achievementDefinitions?: Map<string, SpacetimeDB.AchievementDefinition>;
}

const MAX_NOTIFICATIONS = 3;
const NOTIFICATION_TIMEOUT_MS = 6000; // Achievements stay for 6 seconds
const FADE_OUT_DURATION_MS = 500; // Fade out animation duration
const SEEN_ACHIEVEMENTS_STORAGE_KEY = 'broth_seen_achievement_notifications';

// Load seen achievement IDs from localStorage
function loadSeenAchievementIds(): Set<string> {
  try {
    const stored = localStorage.getItem(SEEN_ACHIEVEMENTS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return new Set(parsed);
      }
    }
  } catch (e) {
    console.warn('[AchievementNotification] Failed to load seen achievements from localStorage:', e);
  }
  return new Set();
}

// Save seen achievement IDs to localStorage
function saveSeenAchievementIds(ids: Set<string>): void {
  try {
    localStorage.setItem(SEEN_ACHIEVEMENTS_STORAGE_KEY, JSON.stringify([...ids]));
  } catch (e) {
    console.warn('[AchievementNotification] Failed to save seen achievements to localStorage:', e);
  }
}

// Time in ms before clicks can dismiss a notification (prevents accidental dismiss while attacking)
const CLICK_GUARD_MS = 1000;

const AchievementNotification: React.FC<AchievementNotificationProps> = ({ 
  notifications,
  onOpenAchievements,
  achievementDefinitions,
}) => {
  const [visibleNotifications, setVisibleNotifications] = useState<SpacetimeDB.AchievementUnlockNotification[]>([]);
  const [fadingOutIds, setFadingOutIds] = useState<Set<string>>(new Set());
  // Initialize dismissedIds from localStorage to persist across page reloads
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => loadSeenAchievementIds());
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
        saveSeenAchievementIds(newSet);
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
    // Get the latest notifications excluding dismissed ones
    const newVisible = notifications
      .filter(n => !dismissedIds.has(n.id.toString()))
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
        
        // Queue achievement sound - the queue manager handles:
        // - Not playing over other SOVA sounds (tutorials, cairn lore, intro)
        // - Not playing over other notification sounds (level ups, missions)
        // - Playing SFX with debounce
        queueNotificationSound('achievement');
        
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
      top: '80px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '10px',
      zIndex: 200,
      pointerEvents: 'none',
    }}>
      {visibleNotifications.map((notif, index) => {
        const notifId = notif.id.toString();
        const isFadingOut = fadingOutIds.has(notifId);
        const animationDelay = index * 0.1;
        
        return (
          <div
            key={notifId}
            onClick={() => {
              // Check click guard before processing
              const shownAt = shownAtRefs.current.get(notifId);
              if (shownAt && Date.now() - shownAt < CLICK_GUARD_MS) {
                return; // Ignore click - notification just appeared
              }
              // Open achievements panel when clicking the notification
              if (onOpenAchievements) {
                onOpenAchievements();
              }
              dismissNotification(notifId, true);
            }}
            className={`achievement-container ${isFadingOut ? 'fade-out' : 'fade-in'}`}
            style={{
              position: 'relative',
              cursor: 'pointer',
              pointerEvents: 'auto',
              animationDelay: `${animationDelay}s`,
            }}
            title="Click to view all achievements"
          >
            {/* Gradient border container */}
            <div className="achievement-glow-container">
              {/* Main notification box */}
              <div className="achievement-box">
                {/* Scanline overlay */}
                <div className="achievement-scanlines" />
                
                {/* Corner accents */}
                <div className="achievement-corner top-left" />
                <div className="achievement-corner top-right" />
                <div className="achievement-corner bottom-left" />
                <div className="achievement-corner bottom-right" />
                
                {/* Close button */}
                <div 
                  className="achievement-close"
                  onClick={(e) => { e.stopPropagation(); dismissNotification(notifId, true); }}
                >
                  ×
                </div>
                
                {/* Content */}
                <div className="achievement-content">
                  {/* Trophy icon with glow */}
                  <div className="achievement-icon">
                    <span className="trophy-emoji">🏆</span>
                    <div className="trophy-glow" />
                  </div>
                  
                  {/* Text content */}
                  <div className="achievement-text">
                    {/* Header */}
                    <div className="achievement-header">
                      <span className="achievement-label">// ACHIEVEMENT UNLOCKED</span>
                    </div>
                    
                    {/* Achievement name with glitch effect */}
                    <div className="achievement-name" data-text={notif.achievementName}>
                      <span className="glitch-layer-1">{notif.achievementName}</span>
                      <span className="glitch-layer-2">{notif.achievementName}</span>
                      <span className="main-name">{notif.achievementName}</span>
                    </div>
                    
                    {/* Achievement description */}
                    {achievementDefinitions && (() => {
                      const achievementDef = achievementDefinitions.get(notif.achievementId);
                      return achievementDef?.description ? (
                        <div className="achievement-description">
                          {achievementDef.description}
                        </div>
                      ) : null;
                    })()}
                    
                    {/* Rewards row */}
                    <div className="achievement-rewards">
                      {notif.xpAwarded > 0 && (
                        <div className="reward-item xp">
                          <span className="reward-icon">◆</span>
                          <span className="reward-value">+{notif.xpAwarded}</span>
                          <span className="reward-label">XP</span>
                        </div>
                      )}
                      {notif.titleAwarded && (
                        <div className="reward-item title">
                          <span className="reward-icon">★</span>
                          <span className="reward-value">{notif.titleAwarded}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Progress bar */}
                <div className="achievement-progress-bar">
                  <div className="achievement-progress-fill" style={{ animationDuration: `${NOTIFICATION_TIMEOUT_MS}ms` }} />
                </div>
              </div>
            </div>
            
            {/* Floating particles */}
            <div className="achievement-particles">
              {[...Array(4)].map((_, i) => (
                <div key={i} className={`achievement-particle particle-${i}`} />
              ))}
            </div>
          </div>
        );
      })}
      
      <style>{`
        /* Main animations */
        @keyframes achievementSlideIn {
          0% { 
            transform: translateX(100px); 
            opacity: 0; 
            filter: blur(5px);
          }
          60% { 
            transform: translateX(-10px); 
            filter: blur(0);
          }
          100% { 
            transform: translateX(0); 
            opacity: 1; 
          }
        }
        
        @keyframes achievementSlideOut {
          0% { 
            transform: translateX(0); 
            opacity: 1; 
          }
          100% { 
            transform: translateX(100px); 
            opacity: 0; 
            filter: blur(5px);
          }
        }
        
        @keyframes achievementGlow {
          0%, 100% { 
            box-shadow: 
              0 0 15px rgba(255, 215, 0, 0.4),
              0 0 30px rgba(255, 215, 0, 0.2),
              inset 0 0 20px rgba(255, 215, 0, 0.1);
          }
          50% { 
            box-shadow: 
              0 0 25px rgba(255, 215, 0, 0.6),
              0 0 50px rgba(255, 215, 0, 0.3),
              inset 0 0 30px rgba(255, 215, 0, 0.15);
          }
        }
        
        @keyframes achievementScanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        
        @keyframes achievementGradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        
        @keyframes achievementProgressFill {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        
        @keyframes achievementFloat {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.8; }
          50% { transform: translateY(-15px) scale(1.2); opacity: 0.4; }
        }
        
        @keyframes trophyPulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 5px #ffd700); }
          50% { transform: scale(1.1); filter: drop-shadow(0 0 15px #ffd700); }
        }
        
        @keyframes achievementGlitch {
          0%, 100% { transform: translate(0); opacity: 0; }
          20% { transform: translate(-1px, 1px); opacity: 0.5; }
          40% { transform: translate(-1px, -1px); opacity: 0; }
          60% { transform: translate(1px, 1px); opacity: 0.5; }
          80% { transform: translate(1px, -1px); opacity: 0; }
        }
        
        @keyframes achievementGlitch2 {
          0%, 100% { transform: translate(0); opacity: 0; }
          25% { transform: translate(1px, -1px); opacity: 0.3; }
          50% { transform: translate(-1px, 1px); opacity: 0; }
          75% { transform: translate(1px, 1px); opacity: 0.3; }
        }
        
        /* Container states */
        .achievement-container.fade-in {
          animation: achievementSlideIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        
        .achievement-container.fade-out {
          animation: achievementSlideOut 0.5s ease-in forwards;
        }
        
        /* Glow container - gradient border */
        .achievement-glow-container {
          position: relative;
          padding: 2px;
          background: linear-gradient(135deg, #ffd700, #ff9500, #ff006e, #ffd700);
          background-size: 300% 300%;
          animation: achievementGradientShift 4s ease infinite;
          border-radius: 8px;
        }
        
        /* Main notification box */
        .achievement-box {
          position: relative;
          background: linear-gradient(180deg, rgba(20, 15, 5, 0.98) 0%, rgba(40, 30, 10, 0.95) 100%);
          border-radius: 6px;
          min-width: 300px;
          max-width: 380px;
          overflow: hidden;
          animation: achievementGlow 2s ease-in-out infinite;
        }
        
        /* Scanlines overlay */
        .achievement-scanlines {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(255, 215, 0, 0.02) 2px,
            rgba(255, 215, 0, 0.02) 4px
          );
          pointer-events: none;
          z-index: 10;
        }
        
        .achievement-scanlines::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 100%;
          background: linear-gradient(
            180deg,
            transparent 0%,
            rgba(255, 215, 0, 0.08) 50%,
            transparent 100%
          );
          animation: achievementScanline 4s linear infinite;
          pointer-events: none;
        }
        
        /* Corner accents */
        .achievement-corner {
          position: absolute;
          width: 12px;
          height: 12px;
          border: 2px solid #ffd700;
          z-index: 5;
        }
        
        .achievement-corner.top-left {
          top: 6px;
          left: 6px;
          border-right: none;
          border-bottom: none;
        }
        
        .achievement-corner.top-right {
          top: 6px;
          right: 6px;
          border-left: none;
          border-bottom: none;
        }
        
        .achievement-corner.bottom-left {
          bottom: 6px;
          left: 6px;
          border-right: none;
          border-top: none;
        }
        
        .achievement-corner.bottom-right {
          bottom: 6px;
          right: 6px;
          border-left: none;
          border-top: none;
        }
        
        /* Close button */
        .achievement-close {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: bold;
          color: rgba(255, 215, 0, 0.5);
          cursor: pointer;
          border-radius: 50%;
          transition: all 0.2s ease;
          z-index: 20;
        }
        
        .achievement-close:hover {
          color: #ffd700;
          background: rgba(255, 215, 0, 0.2);
          text-shadow: 0 0 10px #ffd700;
        }
        
        /* Content layout */
        .achievement-content {
          display: flex;
          align-items: center;
          padding: 14px 16px;
          gap: 14px;
        }
        
        /* Trophy icon */
        .achievement-icon {
          position: relative;
          flex-shrink: 0;
        }
        
        .trophy-emoji {
          font-size: 32px;
          animation: trophyPulse 2s ease-in-out infinite;
          display: block;
        }
        
        .trophy-glow {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 50px;
          height: 50px;
          background: radial-gradient(circle, rgba(255, 215, 0, 0.3) 0%, transparent 70%);
          pointer-events: none;
        }
        
        /* Text content */
        .achievement-text {
          flex: 1;
          min-width: 0;
          padding-right: 20px;
        }
        
        /* Header */
        .achievement-header {
          margin-bottom: 6px;
        }
        
        .achievement-label {
          font-family: 'Courier New', 'Consolas', monospace;
          font-size: 9px;
          color: #ffd700;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          opacity: 0.8;
        }
        
        /* Achievement name with glitch */
        .achievement-name {
          position: relative;
          font-family: 'Courier New', 'Consolas', monospace;
          font-size: 15px;
          font-weight: bold;
          margin-bottom: 8px;
        }
        
        .achievement-name .main-name {
          position: relative;
          color: #ffffff;
          text-shadow: 0 0 8px rgba(255, 215, 0, 0.5);
          z-index: 2;
        }
        
        .achievement-name .glitch-layer-1,
        .achievement-name .glitch-layer-2 {
          position: absolute;
          top: 0;
          left: 0;
          z-index: 1;
        }
        
        .achievement-name .glitch-layer-1 {
          color: #ffd700;
          animation: achievementGlitch 0.5s infinite;
        }
        
        .achievement-name .glitch-layer-2 {
          color: #ff006e;
          animation: achievementGlitch2 0.5s infinite;
        }
        
        /* Achievement description */
        .achievement-description {
          font-family: 'Courier New', 'Consolas', monospace;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.7);
          margin-top: 4px;
          margin-bottom: 8px;
          line-height: 1.4;
        }
        
        /* Rewards */
        .achievement-rewards {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        
        .reward-item {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          background: rgba(255, 215, 0, 0.1);
          border: 1px solid rgba(255, 215, 0, 0.3);
          border-radius: 3px;
        }
        
        .reward-item.xp .reward-icon {
          color: #00d4ff;
          font-size: 10px;
        }
        
        .reward-item.xp .reward-value {
          font-family: 'Courier New', 'Consolas', monospace;
          font-size: 13px;
          font-weight: bold;
          color: #00d4ff;
          text-shadow: 0 0 8px #00d4ff;
        }
        
        .reward-item.xp .reward-label {
          font-family: 'Courier New', 'Consolas', monospace;
          font-size: 9px;
          color: #64748b;
          letter-spacing: 1px;
        }
        
        .reward-item.title .reward-icon {
          color: #ff006e;
          font-size: 10px;
        }
        
        .reward-item.title .reward-value {
          font-family: 'Courier New', 'Consolas', monospace;
          font-size: 11px;
          font-weight: bold;
          color: #ff006e;
          text-shadow: 0 0 8px #ff006e;
        }
        
        /* Progress bar */
        .achievement-progress-bar {
          height: 3px;
          background: rgba(255, 215, 0, 0.15);
        }
        
        .achievement-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #ffd700, #ff9500);
          animation: achievementProgressFill linear forwards;
        }
        
        /* Floating particles */
        .achievement-particles {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
          z-index: -1;
        }
        
        .achievement-particle {
          position: absolute;
          width: 4px;
          height: 4px;
          background: #ffd700;
          border-radius: 50%;
          box-shadow: 0 0 8px #ffd700;
        }
        
        .achievement-particle.particle-0 { 
          top: -10px; 
          left: 20%; 
          animation: achievementFloat 2s ease-in-out infinite 0s; 
        }
        .achievement-particle.particle-1 { 
          top: -15px; 
          right: 30%; 
          animation: achievementFloat 2.3s ease-in-out infinite 0.3s; 
          background: #ff9500; 
          box-shadow: 0 0 8px #ff9500; 
        }
        .achievement-particle.particle-2 { 
          bottom: -10px; 
          left: 40%; 
          animation: achievementFloat 2.1s ease-in-out infinite 0.5s; 
        }
        .achievement-particle.particle-3 { 
          bottom: -15px; 
          right: 20%; 
          animation: achievementFloat 2.4s ease-in-out infinite 0.7s; 
          background: #ff006e; 
          box-shadow: 0 0 8px #ff006e; 
        }
      `}</style>
    </div>
  );
};

export default AchievementNotification;
