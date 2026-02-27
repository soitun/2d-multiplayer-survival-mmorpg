import React, { useState, useEffect, useRef, useCallback } from 'react';
import SpeechBubble from './SpeechBubble';
import { Message as SpacetimeDBMessage, Player as SpacetimeDBPlayer } from '../generated/types';

interface SpeechBubbleData {
  id: string;
  message: string;
  playerId: string;
  timestamp: number;
}

interface SpeechBubbleManagerProps {
  messages: Map<string, SpacetimeDBMessage>; // Only global chat messages (whispers use PrivateMessage table)
  players: Map<string, SpacetimeDBPlayer>;
  cameraOffsetX: number;
  cameraOffsetY: number;
  localPlayerId?: string;
  localBubbles?: SpeechBubbleData[]; // Local-only bubbles (e.g., from /s command)
  predictedPosition?: { x: number; y: number } | null; // Local player's predicted position for smooth tracking
  remotePlayerInterpolation?: {
    updateAndGetSmoothedPosition: (player: SpacetimeDBPlayer, localPlayerId?: string) => { x: number; y: number };
  } | null;
}

const SpeechBubbleManager: React.FC<SpeechBubbleManagerProps> = ({
  messages,
  players,
  cameraOffsetX,
  cameraOffsetY,
  localPlayerId,
  localBubbles = [],
  predictedPosition,
  remotePlayerInterpolation,
}) => {
  const [activeBubbles, setActiveBubbles] = useState<SpeechBubbleData[]>([]);
  const [lastMessageCount, setLastMessageCount] = useState<number>(0);
  const [processedMessageIds] = useState<Set<string>>(new Set());

  // --- Smooth position tracking for speech bubbles ---
  // We track interpolated positions per-player so bubbles don't lag behind canvas rendering
  const smoothPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const rafIdRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(performance.now());

  // Interpolation speed for bubble position tracking (matches remote player interpolation)
  const BUBBLE_INTERPOLATION_SPEED = 14.0;

  // Update smooth positions every animation frame so bubbles track players tightly
  const updateSmoothPositions = useCallback(() => {
    const now = performance.now();
    const dt = (now - lastFrameTimeRef.current) / 1000;
    lastFrameTimeRef.current = now;

    // Only process players who have active bubbles
    for (const bubble of activeBubbles) {
      const player = players.get(bubble.playerId);
      if (!player) continue;

      const isLocal = bubble.playerId === localPlayerId;

      // Get the target position (what the canvas is rendering)
      let targetX: number;
      let targetY: number;

      if (isLocal && predictedPosition) {
        // Local player: use predicted position (matches what GameCanvas renders)
        targetX = predictedPosition.x;
        targetY = predictedPosition.y;
      } else if (!isLocal && remotePlayerInterpolation) {
        // Remote player: use interpolated position (matches what GameCanvas renders)
        // NOTE: We call the same function the canvas uses, so positions are in sync
        const interpolated = remotePlayerInterpolation.updateAndGetSmoothedPosition(player, localPlayerId);
        targetX = interpolated.x;
        targetY = interpolated.y;
      } else {
        // Fallback: raw server position
        targetX = player.positionX;
        targetY = player.positionY;
      }

      const current = smoothPositionsRef.current.get(bubble.playerId);
      if (!current) {
        // First frame: snap to target
        smoothPositionsRef.current.set(bubble.playerId, { x: targetX, y: targetY });
      } else {
        // Interpolate towards target with exponential decay
        const factor = 1 - Math.exp(-BUBBLE_INTERPOLATION_SPEED * dt);
        current.x += (targetX - current.x) * factor;
        current.y += (targetY - current.y) * factor;
      }
    }

    rafIdRef.current = requestAnimationFrame(updateSmoothPositions);
  }, [activeBubbles, players, localPlayerId, predictedPosition, remotePlayerInterpolation]);

  // Start/stop the animation frame loop
  useEffect(() => {
    if (activeBubbles.length > 0) {
      lastFrameTimeRef.current = performance.now();
      rafIdRef.current = requestAnimationFrame(updateSmoothPositions);
    }
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [activeBubbles.length > 0, updateSmoothPositions]);

  // Check for new messages and create bubbles
  useEffect(() => {
    // Only process if we have new messages
    if (messages.size > lastMessageCount) {
      const now = Date.now();
      const RECENT_MESSAGE_THRESHOLD = 10000; // 10 seconds - only show bubbles for very recent messages
      
      // Get all messages sorted by timestamp (sent time)
      const allMessages = Array.from(messages.values())
        .sort((a, b) => Number(b.sent.microsSinceUnixEpoch - a.sent.microsSinceUnixEpoch));
      
      // Look for new messages that should trigger speech bubbles
      for (const message of allMessages) {
        const messageId = message.id.toString();
        const senderId = message.sender.toHexString();
        
        // Skip if we've already processed this message
        if (processedMessageIds.has(messageId)) {
          continue;
        }
        
        // Mark this message as processed
        processedMessageIds.add(messageId);
        
        // Skip commands (messages starting with /) - they shouldn't show as speech bubbles
        if (message.text.trim().startsWith('/')) {
          continue;
        }
        
        // Convert SpacetimeDB timestamp to JavaScript timestamp
        const messageSentTime = Number(message.sent.microsSinceUnixEpoch / 1000n); // Convert microseconds to milliseconds
        
        // Only show speech bubble if message was sent recently
        if (now - messageSentTime <= RECENT_MESSAGE_THRESHOLD) {
          // Remove any existing bubble from the same player
          setActiveBubbles(prev => {
            // Filter out any bubbles from the same player
            const filteredBubbles = prev.filter(bubble => bubble.playerId !== senderId);
            
            // Initialize smooth position for this player
            const player = players.get(senderId);
            if (player) {
              const isLocal = senderId === localPlayerId;
              if (isLocal && predictedPosition) {
                smoothPositionsRef.current.set(senderId, { x: predictedPosition.x, y: predictedPosition.y });
              } else {
                smoothPositionsRef.current.set(senderId, { x: player.positionX, y: player.positionY });
              }
            }
            
            // Add the new bubble
            return [
              ...filteredBubbles,
              {
                id: messageId,
                message: message.text,
                playerId: senderId,
                timestamp: now // Use current time for bubble lifetime tracking
              }
            ];
          });
        }
      }
      
      setLastMessageCount(messages.size);
    }
  }, [messages, lastMessageCount, processedMessageIds, players, localPlayerId, predictedPosition]);
  
  // Merge local bubbles with active bubbles
  useEffect(() => {
    if (localBubbles.length > 0) {
      setActiveBubbles(prev => {
        // Remove any existing bubbles from the same players as local bubbles
        const localPlayerIds = new Set(localBubbles.map(b => b.playerId));
        const filteredBubbles = prev.filter(bubble => !localPlayerIds.has(bubble.playerId));
        
        // Initialize smooth positions for local bubble players
        for (const bubble of localBubbles) {
          const player = players.get(bubble.playerId);
          if (player) {
            const isLocal = bubble.playerId === localPlayerId;
            if (isLocal && predictedPosition) {
              smoothPositionsRef.current.set(bubble.playerId, { x: predictedPosition.x, y: predictedPosition.y });
            } else {
              smoothPositionsRef.current.set(bubble.playerId, { x: player.positionX, y: player.positionY });
            }
          }
        }
        
        // Add local bubbles
        return [...filteredBubbles, ...localBubbles];
      });
    }
  }, [localBubbles, players, localPlayerId, predictedPosition]);
  
  // Clean up expired bubbles and their smooth positions
  useEffect(() => {
    const BUBBLE_LIFETIME = 8000; // 8 seconds
    
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      setActiveBubbles(prev => {
        const remaining = prev.filter(bubble => now - bubble.timestamp < BUBBLE_LIFETIME);
        // Clean up smooth positions for removed bubbles
        const remainingIds = new Set(remaining.map(b => b.playerId));
        for (const [playerId] of smoothPositionsRef.current) {
          if (!remainingIds.has(playerId)) {
            smoothPositionsRef.current.delete(playerId);
          }
        }
        return remaining;
      });
    }, 1000);
    
    return () => clearInterval(cleanupInterval);
  }, []);
  
  // Render bubbles for all visible players
  // Use viewport bounds to cull off-screen bubbles and prevent DOM overflow issues
  const viewportPadding = 300; // Extra padding to allow bubbles slightly off-screen
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;
  
  return (
    <>
      {activeBubbles.map(bubble => {
        const player = players.get(bubble.playerId);
        
        // Skip if player not found
        if (!player) return null;
        
        // Use smoothly interpolated position if available, otherwise fall back to raw position
        const smoothPos = smoothPositionsRef.current.get(bubble.playerId);
        const posX = smoothPos ? smoothPos.x : player.positionX;
        const posY = smoothPos ? smoothPos.y : player.positionY;
        
        // Calculate screen position using interpolated world position + camera offset
        const screenX = posX + cameraOffsetX;
        // Position the bubble above player's head
        const screenY = posY + cameraOffsetY - 65;
        
        // CRITICAL: Skip rendering if bubble would be way off-screen
        // This prevents DOM elements from extending the document and causing scrollbars
        if (screenX < -viewportPadding || screenX > viewportWidth + viewportPadding ||
            screenY < -viewportPadding || screenY > viewportHeight + viewportPadding) {
          return null;
        }
        
        return (
          <SpeechBubble
            key={`speech-bubble-${bubble.id}-${bubble.timestamp}`}
            message={bubble.message}
            x={screenX}
            y={screenY}
          />
        );
      })}
    </>
  );
};

export default SpeechBubbleManager;
