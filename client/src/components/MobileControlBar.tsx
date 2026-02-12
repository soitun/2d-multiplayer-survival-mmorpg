import React from 'react';

interface MobileControlBarProps {
    onMapToggle: () => void;
    onChatToggle: () => void;
    onInteract: () => void;
    isMapOpen: boolean;
    isChatOpen: boolean;
    hasInteractable: boolean; // Whether there's an interactable entity nearby
    interactableLabel?: string; // Optional label for what can be interacted with
}

/**
 * Mobile control bar with buttons for Map, Chat, and Interact.
 * Sprint/crouch removed: mobile runs by default (no walking); crouch not needed on small screens.
 * Positioned at the bottom of the screen with highest z-index to stay visible
 */
const MobileControlBar: React.FC<MobileControlBarProps> = ({
    onMapToggle,
    onChatToggle,
    onInteract,
    isMapOpen,
    isChatOpen,
    hasInteractable,
    interactableLabel,
}) => {
    return (
        <div 
            data-mobile-control-bar
            style={{
                position: 'fixed',
                bottom: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: '12px',
                zIndex: 9999, // Highest z-index to stay above chat, inventory, etc.
                pointerEvents: 'auto',
            }}>
            {/* Map Button - Opens Minimap/Memory Grid/ALK Panel */}
            <button
                onClick={onMapToggle}
                style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    background: isMapOpen 
                        ? 'linear-gradient(135deg, rgba(0, 200, 150, 0.9), rgba(0, 150, 120, 0.95))'
                        : 'linear-gradient(135deg, rgba(20, 40, 80, 0.9), rgba(10, 30, 70, 0.95))',
                    border: isMapOpen 
                        ? '3px solid #00ffaa'
                        : '3px solid #00aaff',
                    color: '#00ffff',
                    cursor: 'pointer',
                    boxShadow: isMapOpen
                        ? '0 0 20px rgba(0, 255, 170, 0.6), inset 0 0 15px rgba(0, 255, 170, 0.2)'
                        : '0 0 15px rgba(0, 170, 255, 0.4), inset 0 0 10px rgba(0, 170, 255, 0.1)',
                    transition: 'all 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                }}
                aria-label="Toggle map and interfaces"
            >
                {/* Map icon - simple grid/compass design */}
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="3" y1="15" x2="21" y2="15" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                    <line x1="15" y1="3" x2="15" y2="21" />
                    {/* Center dot */}
                    <circle cx="12" cy="12" r="2" fill="currentColor" />
                </svg>
                <span style={{
                    fontSize: '7px',
                    fontFamily: '"Press Start 2P", cursive',
                    marginTop: '2px',
                    textShadow: '0 0 4px rgba(0, 255, 255, 0.8)',
                }}>
                    MAP
                </span>
            </button>

            {/* Interact Button - Only visible when near an interactable */}
            {hasInteractable && (
                <button
                    onClick={onInteract}
                    style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(255, 180, 0, 0.9), rgba(220, 140, 0, 0.95))',
                        border: '3px solid #ffcc00',
                        color: '#fff8e0',
                        cursor: 'pointer',
                        boxShadow: '0 0 20px rgba(255, 200, 0, 0.6), inset 0 0 15px rgba(255, 200, 0, 0.2)',
                        transition: 'all 0.3s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        animation: 'pulse 1.5s ease-in-out infinite',
                    }}
                    aria-label={`Interact with ${interactableLabel || 'nearby object'}`}
                >
                    {/* Hand/interact icon */}
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 8V7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v1" />
                        <path d="M14 8V5.5a2.5 2.5 0 0 0-5 0V8" />
                        <path d="M10 8V4.5a2 2 0 0 0-4 0V8" />
                        <path d="M6 8V6a2 2 0 0 0-4 0v7a6 6 0 0 0 6 6h4a6 6 0 0 0 6-6v-2a2 2 0 0 0-4 0" />
                    </svg>
                    <span style={{
                        fontSize: '6px',
                        fontFamily: '"Press Start 2P", cursive',
                        marginTop: '2px',
                        textShadow: '0 0 4px rgba(255, 255, 200, 0.8)',
                        whiteSpace: 'nowrap',
                    }}>
                        {interactableLabel ? interactableLabel.substring(0, 5).toUpperCase() : 'USE'}
                    </span>
                </button>
            )}

            {/* SOVA Button - Opens chat interface with SOVA AI */}
            <button
                onClick={onChatToggle}
                style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    background: isChatOpen 
                        ? 'linear-gradient(135deg, rgba(0, 200, 150, 0.9), rgba(0, 150, 120, 0.95))'
                        : 'linear-gradient(135deg, rgba(30, 15, 50, 0.9), rgba(20, 10, 40, 0.95))',
                    border: isChatOpen 
                        ? '3px solid #00ffaa'
                        : '3px solid #00aaff',
                    color: '#00ffff',
                    cursor: 'pointer',
                    boxShadow: isChatOpen
                        ? '0 0 20px rgba(0, 255, 170, 0.6), inset 0 0 15px rgba(0, 255, 170, 0.2)'
                        : '0 0 20px rgba(0, 170, 255, 0.5), inset 0 0 15px rgba(0, 170, 255, 0.2)',
                    transition: 'all 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                }}
                aria-label="Toggle SOVA chat"
            >
                {/* SOVA AI icon - stylized eye/radar design */}
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    {/* Outer ring */}
                    <circle cx="12" cy="12" r="10" strokeDasharray="4 2" />
                    {/* Inner eye shape */}
                    <path d="M12 5c-4 0-7 4-7 7s3 7 7 7 7-4 7-7-3-7-7-7z" />
                    {/* Pupil */}
                    <circle cx="12" cy="12" r="3" fill="currentColor" />
                    {/* Scan lines */}
                    <line x1="12" y1="2" x2="12" y2="5" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                    <line x1="2" y1="12" x2="5" y2="12" />
                    <line x1="19" y1="12" x2="22" y2="12" />
                </svg>
                <span style={{
                    fontSize: '6px',
                    fontFamily: '"Press Start 2P", cursive',
                    marginTop: '1px',
                    textShadow: '0 0 4px rgba(0, 255, 255, 0.8)',
                    letterSpacing: '1px',
                }}>
                    SOVA
                </span>
            </button>

        </div>
    );
};

// Add keyframe animation styles
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
    }
`;
if (!document.querySelector('#mobile-control-bar-styles')) {
    styleSheet.id = 'mobile-control-bar-styles';
    document.head.appendChild(styleSheet);
}

export default MobileControlBar;

