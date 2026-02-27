/**
 * UplinkNotifications.tsx
 * 
 * Unified notification system that displays level up, achievement, and mission complete
 * notifications in the same position and style as the DayNightCycleTracker ("Neural Uplink").
 * 
 * This creates a diegetic feel where notifications "take over" the uplink space temporarily
 * rather than appearing as intrusive center-screen popups.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { LevelUpNotification, AchievementUnlockNotification, AchievementDefinition } from '../generated/types';
import { queueNotificationSound } from '../utils/notificationSoundQueue';

// Style constants - matching DayNightCycleTracker exactly
const UI_BG_COLOR = 'linear-gradient(180deg, rgba(15, 25, 20, 0.98) 0%, rgba(20, 35, 30, 0.95) 100%)';
const UI_BORDER_GRADIENT = 'linear-gradient(135deg, #00d4ff, #4ade80, #c084fc, #00d4ff)';
const ACCENT_CYAN = '#00d4ff';
const ACCENT_GREEN = '#4ade80';
const ACCENT_PURPLE = '#c084fc';
const ACCENT_PINK = '#f472b6';
const ACCENT_GOLD = '#ffd700';

// Notification types
type NotificationType = 'level_up' | 'achievement' | 'mission_complete';

interface UplinkNotification {
  id: string;
  type: NotificationType;
  title: string;
  subtitle?: string;
  description?: string;
  rewards: { label: string; value: string; color: string }[];
  timestamp: number;
}

// LocalStorage keys for persistence
const SEEN_LEVELUPS_KEY = 'broth_seen_levelup_notifications_v2';
const SEEN_ACHIEVEMENTS_KEY = 'broth_seen_achievement_notifications_v2';
const SEEN_MISSIONS_KEY = 'broth_seen_quest_completions_v2';

function loadSeenIds(key: string): Set<string> {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch (e) { /* ignore */ }
  return new Set();
}

function saveSeenIds(key: string, ids: Set<string>): void {
  try {
    const idsArray = [...ids].slice(-200); // Limit size
    localStorage.setItem(key, JSON.stringify(idsArray));
  } catch (e) { /* ignore */ }
}

interface UplinkNotificationsProps {
  // Level up notifications
  levelUpNotifications: LevelUpNotification[];
  // Achievement notifications
  achievementNotifications: AchievementUnlockNotification[];
  // Achievement definitions (for looking up descriptions)
  achievementDefinitions?: Map<string, AchievementDefinition>;
  // Quest completion (from useQuestNotifications)
  questCompletionNotification: {
    id: string;
    questName: string;
    questType: 'tutorial' | 'daily';
    xpAwarded: number;
    shardsAwarded: number;
    unlockedRecipe?: string;
  } | null;
  onDismissQuestCompletion: () => void;
  // Whether tracker is minimized (to know our size)
  isTrackerMinimized?: boolean;
  // Callbacks
  onOpenAchievements?: () => void;
  onOpenQuests?: () => void;
}

const NOTIFICATION_DISPLAY_MS = 5000;
const FADE_OUT_MS = 400;
const CLICK_GUARD_MS = 800;

const UplinkNotifications: React.FC<UplinkNotificationsProps> = ({
  levelUpNotifications,
  achievementNotifications,
  achievementDefinitions,
  questCompletionNotification,
  onDismissQuestCompletion,
  isTrackerMinimized = false,
  onOpenAchievements,
  onOpenQuests,
}) => {
  // Queue of notifications to display (one at a time)
  const [activeNotification, setActiveNotification] = useState<UplinkNotification | null>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);
  
  // Track seen notifications
  const [seenLevelUps, setSeenLevelUps] = useState<Set<string>>(() => loadSeenIds(SEEN_LEVELUPS_KEY));
  const [seenAchievements, setSeenAchievements] = useState<Set<string>>(() => loadSeenIds(SEEN_ACHIEVEMENTS_KEY));
  const [seenMissions, setSeenMissions] = useState<Set<string>>(() => loadSeenIds(SEEN_MISSIONS_KEY));
  
  // Pending notifications queue
  const pendingQueueRef = useRef<UplinkNotification[]>([]);
  const dismissTimerRef = useRef<NodeJS.Timeout | null>(null);
  const shownAtRef = useRef<number>(0);

  // Convert raw notifications to unified format and queue
  const queueNotification = useCallback((notif: UplinkNotification) => {
    pendingQueueRef.current.push(notif);
  }, []);

  // Process level up notifications
  useEffect(() => {
    levelUpNotifications.forEach(notif => {
      const id = notif.id.toString();
      if (seenLevelUps.has(id)) return;
      
      setSeenLevelUps(prev => {
        const newSet = new Set(prev).add(id);
        saveSeenIds(SEEN_LEVELUPS_KEY, newSet);
        return newSet;
      });
      
      queueNotification({
        id: `levelup-${id}`,
        type: 'level_up',
        title: `LEVEL ${notif.newLevel}`,
        subtitle: 'SYSTEM UPGRADE',
        rewards: [
          ...(notif.xpAwarded > 0 ? [{ label: 'XP', value: `+${notif.xpAwarded}`, color: ACCENT_CYAN }] : []),
          ...(notif.shardsAwarded > 0 ? [{ label: 'SHARDS', value: `+${notif.shardsAwarded}`, color: ACCENT_PURPLE }] : []),
        ],
        timestamp: Date.now(),
      });
      
      queueNotificationSound('level_up');
    });
  }, [levelUpNotifications, seenLevelUps, queueNotification]);

  // Process achievement notifications
  useEffect(() => {
    achievementNotifications.forEach(notif => {
      const id = notif.id.toString();
      if (seenAchievements.has(id)) return;
      
      setSeenAchievements(prev => {
        const newSet = new Set(prev).add(id);
        saveSeenIds(SEEN_ACHIEVEMENTS_KEY, newSet);
        return newSet;
      });
      
      // Look up description from achievement definitions
      const achievementDef = achievementDefinitions?.get(notif.achievementId);
      
      queueNotification({
        id: `achievement-${id}`,
        type: 'achievement',
        title: notif.achievementName,
        subtitle: 'ACHIEVEMENT UNLOCKED',
        description: achievementDef?.description,
        rewards: [
          ...(notif.xpAwarded > 0 ? [{ label: 'XP', value: `+${notif.xpAwarded}`, color: ACCENT_CYAN }] : []),
          ...(notif.titleAwarded ? [{ label: 'TITLE', value: notif.titleAwarded, color: ACCENT_PINK }] : []),
        ],
        timestamp: Date.now(),
      });
      
      queueNotificationSound('achievement');
    });
  }, [achievementNotifications, achievementDefinitions, seenAchievements, queueNotification]);

  // Process quest completion notification
  useEffect(() => {
    if (!questCompletionNotification) return;
    const id = questCompletionNotification.id;
    if (seenMissions.has(id)) return;
    
    setSeenMissions(prev => {
      const newSet = new Set(prev).add(id);
      saveSeenIds(SEEN_MISSIONS_KEY, newSet);
      return newSet;
    });
    
    queueNotification({
      id: `mission-${id}`,
      type: 'mission_complete',
      title: questCompletionNotification.questName,
      subtitle: questCompletionNotification.questType === 'tutorial' ? 'MISSION COMPLETE' : 'DAILY COMPLETE',
      rewards: [
        ...(questCompletionNotification.xpAwarded > 0 ? [{ label: 'XP', value: `+${questCompletionNotification.xpAwarded}`, color: ACCENT_CYAN }] : []),
        ...(questCompletionNotification.shardsAwarded > 0 ? [{ label: 'SHARDS', value: `+${questCompletionNotification.shardsAwarded}`, color: ACCENT_PURPLE }] : []),
        ...(questCompletionNotification.unlockedRecipe ? [{ label: 'UNLOCKED', value: questCompletionNotification.unlockedRecipe, color: ACCENT_GREEN }] : []),
      ],
      timestamp: Date.now(),
    });
    
    queueNotificationSound('mission_complete');
  }, [questCompletionNotification, seenMissions, queueNotification]);

  // Show next notification from queue
  const showNextNotification = useCallback(() => {
    if (pendingQueueRef.current.length === 0) {
      setActiveNotification(null);
      return;
    }
    
    const next = pendingQueueRef.current.shift()!;
    setActiveNotification(next);
    setIsFadingOut(false);
    shownAtRef.current = Date.now();
    
    // Auto-dismiss timer
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      dismissCurrent();
    }, NOTIFICATION_DISPLAY_MS);
  }, []);

  // Dismiss current notification
  const dismissCurrent = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    
    setIsFadingOut(true);
    setTimeout(() => {
      // Clean up quest notification if it was that type
      if (activeNotification?.type === 'mission_complete') {
        onDismissQuestCompletion();
      }
      setActiveNotification(null);
      setIsFadingOut(false);
      // Show next in queue
      showNextNotification();
    }, FADE_OUT_MS);
  }, [activeNotification, onDismissQuestCompletion, showNextNotification]);

  // Handle click to dismiss (with guard)
  const handleClick = useCallback(() => {
    if (Date.now() - shownAtRef.current < CLICK_GUARD_MS) return;
    
    // Open relevant panel based on type
    if (activeNotification?.type === 'achievement' && onOpenAchievements) {
      onOpenAchievements();
    } else if (activeNotification?.type === 'mission_complete' && onOpenQuests) {
      onOpenQuests();
    }
    
    dismissCurrent();
  }, [activeNotification, onOpenAchievements, onOpenQuests, dismissCurrent]);

  // Process queue when it changes
  useEffect(() => {
    if (!activeNotification && pendingQueueRef.current.length > 0) {
      showNextNotification();
    }
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  if (!activeNotification) return null;

  // Get colors based on notification type
  const getTypeColors = () => {
    switch (activeNotification.type) {
      case 'level_up':
        return { primary: ACCENT_CYAN, secondary: ACCENT_PURPLE, gradient: 'linear-gradient(135deg, #00d4ff, #7c3aed, #00d4ff)' };
      case 'achievement':
        return { primary: ACCENT_GOLD, secondary: ACCENT_PINK, gradient: 'linear-gradient(135deg, #ffd700, #ff006e, #ffd700)' };
      case 'mission_complete':
        return { primary: ACCENT_GREEN, secondary: ACCENT_CYAN, gradient: 'linear-gradient(135deg, #4ade80, #00d4ff, #4ade80)' };
      default:
        return { primary: ACCENT_CYAN, secondary: ACCENT_GREEN, gradient: UI_BORDER_GRADIENT };
    }
  };

  const colors = getTypeColors();
  const getIcon = () => {
    switch (activeNotification.type) {
      case 'level_up': return '⚡';
      case 'achievement': return '🏆';
      case 'mission_complete': return '✓';
    }
  };

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'fixed',
        top: '15px',
        right: '15px',
        zIndex: 9999,
        cursor: 'pointer',
        pointerEvents: 'auto',
      }}
    >
      <div
        className={`uplink-notif-container ${isFadingOut ? 'fade-out' : 'fade-in'}`}
        style={{
          padding: '2px',
          backgroundImage: colors.gradient,
          backgroundSize: '300% 300%',
          animation: `uplinkNotifGradient 3s ease infinite${isFadingOut ? ', uplinkNotifFadeOut 0.4s ease-out forwards' : ''}`,
          borderRadius: '10px',
          boxShadow: `0 0 25px ${colors.primary}60, inset 0 0 15px ${colors.primary}20`,
        }}
      >
        <div style={{
          position: 'relative',
          background: UI_BG_COLOR,
          borderRadius: '8px',
          minWidth: '250px',
          maxWidth: '280px',
          minHeight: '310px', // Match DayNightCycleTracker expanded height
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: "'Courier New', 'Consolas', monospace",
        }}>
          {/* Scanlines */}
          <div className="uplink-notif-scanlines" />
          
          {/* Corner accents */}
          <div className="uplink-notif-corner top-left" style={{ borderColor: colors.primary }} />
          <div className="uplink-notif-corner top-right" style={{ borderColor: colors.primary }} />
          <div className="uplink-notif-corner bottom-left" style={{ borderColor: colors.primary }} />
          <div className="uplink-notif-corner bottom-right" style={{ borderColor: colors.primary }} />
          
          {/* Header bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            background: `${colors.primary}15`,
            borderBottom: `1px solid ${colors.primary}40`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px' }}>{getIcon()}</span>
              <span style={{
                fontSize: '9px',
                color: colors.primary,
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                textShadow: `0 0 10px ${colors.primary}`,
              }}>
                // {activeNotification.subtitle}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <span className="uplink-notif-dot" style={{ background: colors.primary }} />
              <span className="uplink-notif-dot" style={{ background: colors.secondary, animationDelay: '0.2s' }} />
              <span className="uplink-notif-dot" style={{ background: ACCENT_PURPLE, animationDelay: '0.4s' }} />
            </div>
          </div>
          
          {/* Content - flex-grow to fill available space */}
          <div style={{ 
            padding: '16px 16px',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center', // Center content horizontally
          }}>
            {/* Title - use primary color for achievements (gold) */}
            <div style={{
              fontSize: activeNotification.type === 'level_up' ? '26px' : '14px',
              fontWeight: 'bold',
              color: activeNotification.type === 'achievement' ? colors.primary : '#fff',
              textShadow: `0 0 15px ${colors.primary}`,
              marginBottom: activeNotification.description ? '8px' : '12px',
              letterSpacing: activeNotification.type === 'level_up' ? '4px' : '1px',
              textAlign: 'center',
            }}>
              {activeNotification.title}
            </div>
            
            {/* Description (for achievements) */}
            {activeNotification.description && (
              <div style={{
                fontSize: '11px',
                color: 'rgba(255, 255, 255, 0.7)',
                textAlign: 'center',
                marginBottom: '12px',
                lineHeight: '1.4',
                maxWidth: '220px',
              }}>
                {activeNotification.description}
              </div>
            )}
            
            {/* Rewards - centered */}
            {activeNotification.rewards.length > 0 && (
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
              }}>
                {activeNotification.rewards.map((reward, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    background: `${reward.color}15`,
                    border: `1px solid ${reward.color}40`,
                    borderRadius: '4px',
                    minWidth: '100px',
                  }}>
                    <span style={{
                      fontSize: '13px',
                      fontWeight: 'bold',
                      color: reward.color,
                      textShadow: `0 0 8px ${reward.color}`,
                    }}>
                      {reward.value}
                    </span>
                    <span style={{
                      fontSize: '9px',
                      color: '#6b7280',
                      letterSpacing: '1px',
                    }}>
                      {reward.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Progress bar / auto-dismiss indicator */}
          <div style={{
            height: '3px',
            background: `${colors.primary}20`,
          }}>
            <div style={{
              height: '100%',
              background: `linear-gradient(90deg, ${colors.primary}, ${colors.secondary})`,
              animation: `uplinkNotifProgress ${NOTIFICATION_DISPLAY_MS}ms linear forwards`,
            }} />
          </div>
          
          {/* Click hint */}
          <div style={{
            textAlign: 'center',
            padding: '8px 0',
            fontSize: '8px',
            color: `${colors.primary}60`,
            letterSpacing: '1.5px',
            borderTop: `1px solid ${colors.primary}20`,
          }}>
            CLICK TO DISMISS
          </div>
        </div>
      </div>
      
      <style>{`
        @keyframes uplinkNotifGradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        
        @keyframes uplinkNotifFadeIn {
          0% { 
            transform: translateX(50px) scale(0.9); 
            opacity: 0; 
          }
          100% { 
            transform: translateX(0) scale(1); 
            opacity: 1; 
          }
        }
        
        @keyframes uplinkNotifFadeOut {
          0% { 
            transform: translateX(0) scale(1); 
            opacity: 1; 
          }
          100% { 
            transform: translateX(50px) scale(0.9); 
            opacity: 0; 
          }
        }
        
        @keyframes uplinkNotifProgress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        
        @keyframes uplinkNotifDotPulse {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.3); opacity: 1; }
        }
        
        @keyframes uplinkNotifScanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        
        .uplink-notif-container.fade-in {
          animation: uplinkNotifFadeIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards, uplinkNotifGradient 3s ease infinite;
        }
        
        .uplink-notif-container.fade-out {
          animation: uplinkNotifFadeOut 0.4s ease-out forwards;
        }
        
        .uplink-notif-scanlines {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 212, 255, 0.02) 2px,
            rgba(0, 212, 255, 0.02) 4px
          );
          pointer-events: none;
          z-index: 10;
        }
        
        .uplink-notif-scanlines::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 100%;
          background: linear-gradient(
            180deg,
            transparent 0%,
            rgba(0, 212, 255, 0.06) 50%,
            transparent 100%
          );
          animation: uplinkNotifScanline 4s linear infinite;
          pointer-events: none;
        }
        
        .uplink-notif-corner {
          position: absolute;
          width: 10px;
          height: 10px;
          border: 2px solid #00d4ff;
          z-index: 5;
        }
        
        .uplink-notif-corner.top-left { top: 4px; left: 4px; border-right: none; border-bottom: none; }
        .uplink-notif-corner.top-right { top: 4px; right: 4px; border-left: none; border-bottom: none; }
        .uplink-notif-corner.bottom-left { bottom: 4px; left: 4px; border-right: none; border-top: none; }
        .uplink-notif-corner.bottom-right { bottom: 4px; right: 4px; border-left: none; border-top: none; }
        
        .uplink-notif-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          animation: uplinkNotifDotPulse 1s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default UplinkNotifications;
