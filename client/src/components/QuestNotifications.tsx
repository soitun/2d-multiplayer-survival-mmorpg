/**
 * QuestNotifications.tsx
 * 
 * Handles quest-related notifications:
 * - Quest completion celebration popup
 * - Quest progress milestone toasts
 * - Renders at a fixed position on screen
 * 
 * NOTE: "Seen" tracking is now handled by useQuestNotifications hook
 * which persists to localStorage. This component just displays what it receives.
 */

import React, { useState, useEffect, useCallback } from 'react';

// Style constants (matching other UI components)
const UI_BG_COLOR = 'linear-gradient(135deg, rgba(20, 10, 35, 0.98), rgba(15, 8, 30, 0.99))';
const UI_BORDER_COLOR = '#00aaff';
const UI_FONT_FAMILY = '"Press Start 2P", cursive';
const SOVA_PURPLE = '#c084fc';
const SOVA_CYAN = '#00aaff';
const SUCCESS_GREEN = '#4ade80';

// ============================================================================
// QUEST COMPLETION NOTIFICATION (Celebration popup - Cyberpunk style)
// ============================================================================

export interface QuestCompletionData {
    id: string;
    questName: string;
    questType: 'tutorial' | 'daily';
    xpAwarded: number;
    shardsAwarded: number;
    unlockedRecipe?: string;
}

interface QuestCompletionNotificationProps {
    notification: QuestCompletionData | null;
    onDismiss: () => void;
    onOpenQuestsPanel?: () => void;
}

const NOTIFICATION_TIMEOUT_MS = 6000;
const FADE_OUT_DURATION_MS = 500;

export const QuestCompletionNotification: React.FC<QuestCompletionNotificationProps> = ({
    notification,
    onDismiss,
    onOpenQuestsPanel,
}) => {
    const [isVisible, setIsVisible] = useState(false);
    const [isAnimatingOut, setIsAnimatingOut] = useState(false);

    const dismissNotification = useCallback(() => {
        if (!notification) return;
        
        setIsAnimatingOut(true);
        setTimeout(() => {
            setIsVisible(false);
            onDismiss();
        }, FADE_OUT_DURATION_MS);
    }, [notification, onDismiss]);

    // Handle click - open quests panel and dismiss
    const handleClick = useCallback(() => {
        if (onOpenQuestsPanel) {
            onOpenQuestsPanel();
        }
        dismissNotification();
    }, [onOpenQuestsPanel, dismissNotification]);

    useEffect(() => {
        if (notification) {
            // Show the notification (seen tracking is now done by useQuestNotifications hook)
            setIsVisible(true);
            setIsAnimatingOut(false);
            
            // Auto-dismiss after timeout
            const timer = setTimeout(() => {
                dismissNotification();
            }, NOTIFICATION_TIMEOUT_MS);
            
            return () => clearTimeout(timer);
        }
    }, [notification, onDismiss, dismissNotification]);

    if (!notification || !isVisible) return null;

    const isTutorial = notification.questType === 'tutorial';
    const isDaily = notification.questType === 'daily';

    return (
        <div
            onClick={handleClick}
            className={`quest-complete-container ${isAnimatingOut ? 'fade-out' : 'fade-in'} ${isDaily ? 'daily-quest' : 'tutorial-quest'}`}
            style={{
                position: 'fixed',
                top: '350px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 190,
                cursor: 'pointer',
                pointerEvents: 'auto',
            }}
            title="Click to view quests"
        >
            {/* Gradient border container */}
            <div className={`quest-glow-container ${isDaily ? 'daily' : ''}`}>
                {/* Main notification box */}
                <div className={`quest-box ${isDaily ? 'daily' : ''}`}>
                    {/* Scanline overlay */}
                    <div className={`quest-scanlines ${isDaily ? 'daily' : ''}`} />
                    
                    {/* Corner accents */}
                    <div className={`quest-corner top-left ${isDaily ? 'daily' : ''}`} />
                    <div className={`quest-corner top-right ${isDaily ? 'daily' : ''}`} />
                    <div className={`quest-corner bottom-left ${isDaily ? 'daily' : ''}`} />
                    <div className={`quest-corner bottom-right ${isDaily ? 'daily' : ''}`} />
                    
                    {/* Close button */}
                    <div 
                        className={`quest-close ${isDaily ? 'daily' : ''}`}
                        onClick={(e) => { e.stopPropagation(); dismissNotification(); }}
                    >
                        ×
                    </div>
                    
                    {/* Header bar */}
                    <div className={`quest-header-bar ${isDaily ? 'daily' : ''}`}>
                        <span className={`quest-header-text ${isDaily ? 'daily' : ''}`}>
                            {isDaily ? '🔄 DAILY TRAINING' : '// MISSION'}
                        </span>
                        <div className="quest-header-dots">
                            <span className={`quest-dot ${isDaily ? 'purple' : 'green'}`} />
                            <span className="quest-dot cyan" />
                            <span className={`quest-dot ${isDaily ? 'cyan' : 'purple'}`} />
                        </div>
                    </div>
                    
                    {/* Content */}
                    <div className="quest-content">
                        {/* Checkmark icon with glow */}
                        <div className={`quest-icon ${isDaily ? 'daily' : ''}`}>
                            <span className={`quest-check-emoji ${isDaily ? 'daily' : ''}`}>✓</span>
                            <div className={`quest-icon-glow ${isDaily ? 'daily' : ''}`} />
                        </div>
                        
                        {/* Text content */}
                        <div className="quest-text">
                            {/* Completion label with glitch effect */}
                            <div className={`quest-complete-label ${isDaily ? 'daily' : ''}`} data-text={isTutorial ? 'MISSION COMPLETE' : 'DAILY COMPLETE'}>
                                <span className={`quest-glitch-layer-1 ${isDaily ? 'daily' : ''}`}>{isTutorial ? 'MISSION COMPLETE' : 'DAILY COMPLETE'}</span>
                                <span className={`quest-glitch-layer-2 ${isDaily ? 'daily' : ''}`}>{isTutorial ? 'MISSION COMPLETE' : 'DAILY COMPLETE'}</span>
                                <span className={`quest-main-label ${isDaily ? 'daily' : ''}`}>{isTutorial ? 'MISSION COMPLETE' : 'DAILY COMPLETE'}</span>
                            </div>
                            
                            {/* Quest name */}
                            <div className="quest-name">
                                {notification.questName}
                            </div>
                            
                            {/* Rewards row */}
                            <div className="quest-rewards">
                                {notification.xpAwarded > 0 && (
                                    <div className={`quest-reward-item xp ${isDaily ? 'daily' : ''}`}>
                                        <span className="quest-reward-icon">◆</span>
                                        <span className="quest-reward-value">+{notification.xpAwarded}</span>
                                        <span className="quest-reward-label">XP</span>
                                    </div>
                                )}
                                {notification.shardsAwarded > 0 && (
                                    <div className="quest-reward-item shards">
                                        <span className="quest-reward-icon">💎</span>
                                        <span className="quest-reward-value">+{notification.shardsAwarded}</span>
                                        <span className="quest-reward-label">SHARDS</span>
                                    </div>
                                )}
                            </div>
                            
                            {/* Unlocked Recipe */}
                            {notification.unlockedRecipe && (
                                <div className="quest-unlock">
                                    <span className="quest-unlock-icon">🔓</span>
                                    <span className="quest-unlock-text">UNLOCKED: {notification.unlockedRecipe}</span>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Progress bar */}
                    <div className={`quest-progress-bar ${isDaily ? 'daily' : ''}`}>
                        <div className={`quest-progress-fill ${isDaily ? 'daily' : ''}`} style={{ animationDuration: `${NOTIFICATION_TIMEOUT_MS}ms` }} />
                    </div>
                    
                    {/* Click hint */}
                    <div className={`quest-click-hint ${isDaily ? 'daily' : ''}`}>
                        CLICK TO VIEW QUESTS
                    </div>
                </div>
            </div>
            
            {/* Floating particles */}
            <div className="quest-particles">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className={`quest-particle particle-${i} ${isDaily ? 'daily' : ''}`} />
                ))}
            </div>
            
            <style>{`
                /* Main animations */
                @keyframes questSlideIn {
                    0% { 
                        transform: translateX(-50%) scale(0.8) translateY(-20px); 
                        opacity: 0; 
                        filter: blur(5px);
                    }
                    60% { 
                        transform: translateX(-50%) scale(1.02) translateY(5px);
                        filter: blur(0);
                    }
                    100% { 
                        transform: translateX(-50%) scale(1) translateY(0); 
                        opacity: 1; 
                    }
                }
                
                @keyframes questSlideOut {
                    0% { 
                        transform: translateX(-50%) scale(1) translateY(0); 
                        opacity: 1; 
                    }
                    100% { 
                        transform: translateX(-50%) scale(0.8) translateY(-30px); 
                        opacity: 0; 
                        filter: blur(5px);
                    }
                }
                
                @keyframes questGlow {
                    0%, 100% { 
                        box-shadow: 
                            0 0 15px rgba(74, 222, 128, 0.4),
                            0 0 30px rgba(74, 222, 128, 0.2),
                            inset 0 0 20px rgba(74, 222, 128, 0.1);
                    }
                    50% { 
                        box-shadow: 
                            0 0 25px rgba(74, 222, 128, 0.6),
                            0 0 50px rgba(74, 222, 128, 0.3),
                            inset 0 0 30px rgba(74, 222, 128, 0.15);
                    }
                }
                
                @keyframes questGlowDaily {
                    0%, 100% { 
                        box-shadow: 
                            0 0 15px rgba(192, 132, 252, 0.4),
                            0 0 30px rgba(192, 132, 252, 0.2),
                            inset 0 0 20px rgba(192, 132, 252, 0.1);
                    }
                    50% { 
                        box-shadow: 
                            0 0 25px rgba(192, 132, 252, 0.6),
                            0 0 50px rgba(192, 132, 252, 0.3),
                            inset 0 0 30px rgba(192, 132, 252, 0.15);
                    }
                }
                
                @keyframes questScanline {
                    0% { transform: translateY(-100%); }
                    100% { transform: translateY(100%); }
                }
                
                @keyframes questGradientShift {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
                
                @keyframes questProgressFill {
                    0% { width: 0%; }
                    100% { width: 100%; }
                }
                
                @keyframes questFloat {
                    0%, 100% { transform: translateY(0) scale(1); opacity: 0.8; }
                    50% { transform: translateY(-15px) scale(1.2); opacity: 0.4; }
                }
                
                @keyframes questCheckPulse {
                    0%, 100% { transform: scale(1); filter: drop-shadow(0 0 5px #4ade80); }
                    50% { transform: scale(1.1); filter: drop-shadow(0 0 15px #4ade80); }
                }
                
                @keyframes questGlitch {
                    0%, 100% { transform: translate(0); opacity: 0; }
                    20% { transform: translate(-1px, 1px); opacity: 0.5; }
                    40% { transform: translate(-1px, -1px); opacity: 0; }
                    60% { transform: translate(1px, 1px); opacity: 0.5; }
                    80% { transform: translate(1px, -1px); opacity: 0; }
                }
                
                @keyframes questGlitch2 {
                    0%, 100% { transform: translate(0); opacity: 0; }
                    25% { transform: translate(1px, -1px); opacity: 0.3; }
                    50% { transform: translate(-1px, 1px); opacity: 0; }
                    75% { transform: translate(1px, 1px); opacity: 0.3; }
                }
                
                @keyframes questDotPulse {
                    0%, 100% { transform: scale(1); opacity: 0.7; }
                    50% { transform: scale(1.3); opacity: 1; }
                }
                
                /* Container states */
                .quest-complete-container.fade-in {
                    animation: questSlideIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
                }
                
                .quest-complete-container.fade-out {
                    animation: questSlideOut 0.5s ease-in forwards;
                }
                
                /* Glow container - gradient border */
                .quest-glow-container {
                    position: relative;
                    padding: 2px;
                    background: linear-gradient(135deg, #4ade80, #00d4ff, #7c3aed, #4ade80);
                    background-size: 300% 300%;
                    animation: questGradientShift 4s ease infinite;
                    border-radius: 10px;
                }
                
                .quest-glow-container.daily {
                    background: linear-gradient(135deg, #c084fc, #00d4ff, #a855f7, #c084fc);
                }
                
                /* Main notification box */
                .quest-box {
                    position: relative;
                    background: linear-gradient(180deg, rgba(15, 25, 20, 0.98) 0%, rgba(20, 35, 30, 0.95) 100%);
                    border-radius: 8px;
                    min-width: 340px;
                    max-width: 420px;
                    overflow: hidden;
                    animation: questGlow 2s ease-in-out infinite;
                }
                
                .quest-box.daily {
                    background: linear-gradient(180deg, rgba(25, 15, 35, 0.98) 0%, rgba(35, 20, 45, 0.95) 100%);
                    animation: questGlowDaily 2s ease-in-out infinite;
                }
                
                /* Scanlines overlay */
                .quest-scanlines {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: repeating-linear-gradient(
                        0deg,
                        transparent,
                        transparent 2px,
                        rgba(74, 222, 128, 0.02) 2px,
                        rgba(74, 222, 128, 0.02) 4px
                    );
                    pointer-events: none;
                    z-index: 10;
                }
                
                .quest-scanlines.daily {
                    background: repeating-linear-gradient(
                        0deg,
                        transparent,
                        transparent 2px,
                        rgba(192, 132, 252, 0.02) 2px,
                        rgba(192, 132, 252, 0.02) 4px
                    );
                }
                
                .quest-scanlines::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 100%;
                    background: linear-gradient(
                        180deg,
                        transparent 0%,
                        rgba(74, 222, 128, 0.08) 50%,
                        transparent 100%
                    );
                    animation: questScanline 4s linear infinite;
                    pointer-events: none;
                }
                
                .quest-scanlines.daily::after {
                    background: linear-gradient(
                        180deg,
                        transparent 0%,
                        rgba(192, 132, 252, 0.08) 50%,
                        transparent 100%
                    );
                }
                
                /* Corner accents */
                .quest-corner {
                    position: absolute;
                    width: 14px;
                    height: 14px;
                    border: 2px solid #4ade80;
                    z-index: 5;
                }
                
                .quest-corner.daily {
                    border-color: #c084fc;
                }
                
                .quest-corner.top-left {
                    top: 6px;
                    left: 6px;
                    border-right: none;
                    border-bottom: none;
                }
                
                .quest-corner.top-right {
                    top: 6px;
                    right: 6px;
                    border-left: none;
                    border-bottom: none;
                }
                
                .quest-corner.bottom-left {
                    bottom: 6px;
                    left: 6px;
                    border-right: none;
                    border-top: none;
                }
                
                .quest-corner.bottom-right {
                    bottom: 6px;
                    right: 6px;
                    border-left: none;
                    border-top: none;
                }
                
                /* Close button */
                .quest-close {
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
                    color: rgba(74, 222, 128, 0.5);
                    cursor: pointer;
                    border-radius: 50%;
                    transition: all 0.2s ease;
                    z-index: 20;
                }
                
                .quest-close.daily {
                    color: rgba(192, 132, 252, 0.5);
                }
                
                .quest-close:hover {
                    color: #4ade80;
                    background: rgba(74, 222, 128, 0.2);
                    text-shadow: 0 0 10px #4ade80;
                }
                
                .quest-close.daily:hover {
                    color: #c084fc;
                    background: rgba(192, 132, 252, 0.2);
                    text-shadow: 0 0 10px #c084fc;
                }
                
                /* Header bar */
                .quest-header-bar {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 16px;
                    background: rgba(74, 222, 128, 0.1);
                    border-bottom: 1px solid rgba(74, 222, 128, 0.3);
                }
                
                .quest-header-bar.daily {
                    background: rgba(192, 132, 252, 0.1);
                    border-bottom: 1px solid rgba(192, 132, 252, 0.3);
                }
                
                .quest-header-text {
                    font-family: 'Courier New', 'Consolas', monospace;
                    font-size: 9px;
                    color: #4ade80;
                    letter-spacing: 1.5px;
                    text-transform: uppercase;
                }
                
                .quest-header-text.daily {
                    color: #c084fc;
                }
                
                .quest-header-dots {
                    display: flex;
                    gap: 5px;
                }
                
                .quest-dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                }
                
                .quest-dot.green {
                    background: #4ade80;
                    animation: questDotPulse 1s ease-in-out infinite;
                }
                
                .quest-dot.cyan {
                    background: #00d4ff;
                    animation: questDotPulse 1s ease-in-out infinite 0.2s;
                }
                
                .quest-dot.purple {
                    background: #c084fc;
                    animation: questDotPulse 1s ease-in-out infinite 0.4s;
                }
                
                /* Content layout */
                .quest-content {
                    display: flex;
                    align-items: center;
                    padding: 16px 18px;
                    gap: 16px;
                }
                
                /* Checkmark icon */
                .quest-icon {
                    position: relative;
                    flex-shrink: 0;
                    width: 48px;
                    height: 48px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(74, 222, 128, 0.15);
                    border: 2px solid rgba(74, 222, 128, 0.5);
                    border-radius: 50%;
                }
                
                .quest-icon.daily {
                    background: rgba(192, 132, 252, 0.15);
                    border: 2px solid rgba(192, 132, 252, 0.5);
                }
                
                .quest-check-emoji {
                    font-size: 24px;
                    color: #4ade80;
                    animation: questCheckPulse 2s ease-in-out infinite;
                    text-shadow: 0 0 10px #4ade80;
                }
                
                .quest-check-emoji.daily {
                    color: #c084fc;
                    animation: questCheckPulseDaily 2s ease-in-out infinite;
                    text-shadow: 0 0 10px #c084fc;
                }
                
                @keyframes questCheckPulseDaily {
                    0%, 100% { transform: scale(1); filter: drop-shadow(0 0 5px #c084fc); }
                    50% { transform: scale(1.1); filter: drop-shadow(0 0 15px #c084fc); }
                }
                
                .quest-icon-glow {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 60px;
                    height: 60px;
                    background: radial-gradient(circle, rgba(74, 222, 128, 0.3) 0%, transparent 70%);
                    pointer-events: none;
                }
                
                .quest-icon-glow.daily {
                    background: radial-gradient(circle, rgba(192, 132, 252, 0.3) 0%, transparent 70%);
                }
                
                /* Text content */
                .quest-text {
                    flex: 1;
                    min-width: 0;
                    padding-right: 20px;
                }
                
                /* Completion label with glitch */
                .quest-complete-label {
                    position: relative;
                    font-family: 'Courier New', 'Consolas', monospace;
                    font-size: 14px;
                    font-weight: bold;
                    margin-bottom: 6px;
                }
                
                .quest-complete-label .quest-main-label {
                    position: relative;
                    color: #4ade80;
                    text-shadow: 0 0 10px rgba(74, 222, 128, 0.7);
                    z-index: 2;
                }
                
                .quest-complete-label .quest-main-label.daily {
                    color: #c084fc;
                    text-shadow: 0 0 10px rgba(192, 132, 252, 0.7);
                }
                
                .quest-complete-label .quest-glitch-layer-1,
                .quest-complete-label .quest-glitch-layer-2 {
                    position: absolute;
                    top: 0;
                    left: 0;
                    z-index: 1;
                }
                
                .quest-complete-label .quest-glitch-layer-1 {
                    color: #00d4ff;
                    animation: questGlitch 0.5s infinite;
                }
                
                .quest-complete-label .quest-glitch-layer-1.daily {
                    color: #00d4ff;
                }
                
                .quest-complete-label .quest-glitch-layer-2 {
                    color: #c084fc;
                    animation: questGlitch2 0.5s infinite;
                }
                
                .quest-complete-label .quest-glitch-layer-2.daily {
                    color: #4ade80;
                }
                
                /* Quest name */
                .quest-name {
                    font-family: 'Courier New', 'Consolas', monospace;
                    font-size: 11px;
                    color: #ffffff;
                    margin-bottom: 10px;
                    text-shadow: 0 0 5px rgba(255, 255, 255, 0.3);
                }
                
                /* Rewards */
                .quest-rewards {
                    display: flex;
                    gap: 12px;
                    flex-wrap: wrap;
                    margin-bottom: 8px;
                }
                
                .quest-reward-item {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 8px;
                    background: rgba(74, 222, 128, 0.1);
                    border: 1px solid rgba(74, 222, 128, 0.3);
                    border-radius: 3px;
                }
                
                .quest-reward-item.daily {
                    background: rgba(192, 132, 252, 0.1);
                    border: 1px solid rgba(192, 132, 252, 0.3);
                }
                
                .quest-reward-item.xp .quest-reward-icon {
                    color: #00d4ff;
                    font-size: 10px;
                }
                
                .quest-reward-item.xp .quest-reward-value {
                    font-family: 'Courier New', 'Consolas', monospace;
                    font-size: 12px;
                    font-weight: bold;
                    color: #00d4ff;
                    text-shadow: 0 0 8px #00d4ff;
                }
                
                .quest-reward-item.xp .quest-reward-label {
                    font-family: 'Courier New', 'Consolas', monospace;
                    font-size: 8px;
                    color: #64748b;
                    letter-spacing: 1px;
                }
                
                .quest-reward-item.shards .quest-reward-icon {
                    font-size: 10px;
                }
                
                .quest-reward-item.shards .quest-reward-value {
                    font-family: 'Courier New', 'Consolas', monospace;
                    font-size: 12px;
                    font-weight: bold;
                    color: #c084fc;
                    text-shadow: 0 0 8px #c084fc;
                }
                
                .quest-reward-item.shards .quest-reward-label {
                    font-family: 'Courier New', 'Consolas', monospace;
                    font-size: 8px;
                    color: #64748b;
                    letter-spacing: 1px;
                }
                
                /* Unlocked recipe */
                .quest-unlock {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 10px;
                    background: rgba(192, 132, 252, 0.1);
                    border: 1px solid rgba(192, 132, 252, 0.4);
                    border-radius: 4px;
                }
                
                .quest-unlock-icon {
                    font-size: 12px;
                }
                
                .quest-unlock-text {
                    font-family: 'Courier New', 'Consolas', monospace;
                    font-size: 9px;
                    color: #c084fc;
                    text-shadow: 0 0 8px #c084fc;
                }
                
                /* Progress bar */
                .quest-progress-bar {
                    height: 3px;
                    background: rgba(74, 222, 128, 0.15);
                }
                
                .quest-progress-bar.daily {
                    background: rgba(192, 132, 252, 0.15);
                }
                
                .quest-progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #4ade80, #00d4ff);
                    animation: questProgressFill linear forwards;
                }
                
                .quest-progress-fill.daily {
                    background: linear-gradient(90deg, #c084fc, #00d4ff);
                }
                
                /* Click hint */
                .quest-click-hint {
                    text-align: center;
                    padding: 8px 0 6px 0;
                    font-family: 'Courier New', 'Consolas', monospace;
                    font-size: 8px;
                    color: rgba(74, 222, 128, 0.5);
                    letter-spacing: 1.5px;
                    transition: color 0.2s ease;
                }
                
                .quest-click-hint.daily {
                    color: rgba(192, 132, 252, 0.5);
                }
                
                .quest-complete-container:hover .quest-click-hint {
                    color: rgba(74, 222, 128, 0.9);
                    text-shadow: 0 0 8px rgba(74, 222, 128, 0.5);
                }
                
                .quest-complete-container.daily-quest:hover .quest-click-hint {
                    color: rgba(192, 132, 252, 0.9);
                    text-shadow: 0 0 8px rgba(192, 132, 252, 0.5);
                }
                
                /* Floating particles */
                .quest-particles {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    pointer-events: none;
                    z-index: -1;
                }
                
                .quest-particle {
                    position: absolute;
                    width: 4px;
                    height: 4px;
                    background: #4ade80;
                    border-radius: 50%;
                    box-shadow: 0 0 8px #4ade80;
                }
                
                .quest-particle.daily {
                    background: #c084fc;
                    box-shadow: 0 0 8px #c084fc;
                }
                
                .quest-particle.particle-0 { 
                    top: -10px; 
                    left: 20%; 
                    animation: questFloat 2s ease-in-out infinite 0s; 
                }
                .quest-particle.particle-1 { 
                    top: -15px; 
                    right: 30%; 
                    animation: questFloat 2.3s ease-in-out infinite 0.3s; 
                    background: #00d4ff; 
                    box-shadow: 0 0 8px #00d4ff; 
                }
                .quest-particle.particle-2 { 
                    bottom: -10px; 
                    left: 40%; 
                    animation: questFloat 2.1s ease-in-out infinite 0.5s; 
                }
                .quest-particle.particle-3 { 
                    bottom: -15px; 
                    right: 20%; 
                    animation: questFloat 2.4s ease-in-out infinite 0.7s; 
                    background: #c084fc; 
                    box-shadow: 0 0 8px #c084fc; 
                }
                
                .quest-particle.daily.particle-0 {
                    background: #c084fc;
                    box-shadow: 0 0 8px #c084fc;
                }
                .quest-particle.daily.particle-2 {
                    background: #a855f7;
                    box-shadow: 0 0 8px #a855f7;
                }
                .quest-particle.daily.particle-3 {
                    background: #4ade80;
                    box-shadow: 0 0 8px #4ade80;
                }
            `}</style>
        </div>
    );
};

// ============================================================================
// QUEST PROGRESS TOAST (Milestone notification)
// ============================================================================

export interface QuestProgressData {
    id: string;
    questName: string;
    currentProgress: number;
    targetAmount: number;
    milestonePercent: number;
}

interface QuestProgressToastProps {
    notification: QuestProgressData | null;
    onDismiss: () => void;
}

export const QuestProgressToast: React.FC<QuestProgressToastProps> = ({
    notification,
    onDismiss,
}) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (notification) {
            setIsVisible(true);
            
            // Auto-dismiss after 3 seconds
            const timer = setTimeout(() => {
                setIsVisible(false);
                onDismiss();
            }, 3000);
            
            return () => clearTimeout(timer);
        }
    }, [notification, onDismiss]);

    if (!notification || !isVisible) return null;

    return (
        <>
            <style>
                {`
                    @keyframes toastSlideIn {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                `}
            </style>
            <div
                style={{
                    position: 'fixed',
                    bottom: '120px',
                    right: '20px',
                    zIndex: 2500,
                    background: UI_BG_COLOR,
                    border: `2px solid ${SOVA_CYAN}`,
                    borderRadius: '8px',
                    padding: '12px 16px',
                    fontFamily: UI_FONT_FAMILY,
                    minWidth: '200px',
                    animation: 'toastSlideIn 0.3s ease-out',
                }}
            >
                {/* Header */}
                <div style={{
                    color: SOVA_CYAN,
                    fontSize: '8px',
                    marginBottom: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                }}>
                    <span>📊</span>
                    <span>Quest Progress</span>
                </div>

                {/* Quest Name */}
                <div style={{
                    color: '#e0e0e0',
                    fontSize: '7px',
                    marginBottom: '8px',
                }}>
                    {notification.questName}
                </div>

                {/* Progress bar */}
                <div style={{
                    width: '100%',
                    height: '6px',
                    backgroundColor: 'rgba(55, 65, 81, 0.5)',
                    borderRadius: '3px',
                    overflow: 'hidden',
                    marginBottom: '4px',
                }}>
                    <div style={{
                        width: `${notification.milestonePercent}%`,
                        height: '100%',
                        backgroundColor: SOVA_CYAN,
                        borderRadius: '3px',
                        boxShadow: `0 0 8px ${SOVA_CYAN}`,
                    }} />
                </div>

                {/* Progress text */}
                <div style={{
                    color: '#9ca3af',
                    fontSize: '6px',
                    textAlign: 'right',
                }}>
                    {notification.currentProgress} / {notification.targetAmount} ({notification.milestonePercent}%)
                </div>
            </div>
        </>
    );
};

export default QuestCompletionNotification;
