import React, { useState, useEffect } from 'react';
import SpeechBubble from './SpeechBubble';
import { Message as SpacetimeDBMessage, Player as SpacetimeDBPlayer } from '../generated';

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
}

const SpeechBubbleManager: React.FC<SpeechBubbleManagerProps> = ({
  messages,
  players,
  cameraOffsetX,
  cameraOffsetY,
  localPlayerId,
  localBubbles = []
}) => {
  const [activeBubbles, setActiveBubbles] = useState<SpeechBubbleData[]>([]);
  const [lastMessageCount, setLastMessageCount] = useState<number>(0);
  const [processedMessageIds] = useState<Set<string>>(new Set());
  
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
  }, [messages, lastMessageCount, processedMessageIds]);
  
  // Merge local bubbles with active bubbles
  useEffect(() => {
    if (localBubbles.length > 0) {
      setActiveBubbles(prev => {
        // Remove any existing bubbles from the same players as local bubbles
        const localPlayerIds = new Set(localBubbles.map(b => b.playerId));
        const filteredBubbles = prev.filter(bubble => !localPlayerIds.has(bubble.playerId));
        // Add local bubbles
        return [...filteredBubbles, ...localBubbles];
      });
    }
  }, [localBubbles]);
  
  // Clean up expired bubbles
  useEffect(() => {
    const BUBBLE_LIFETIME = 8000; // 8 seconds
    
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      setActiveBubbles(prev => 
        prev.filter(bubble => now - bubble.timestamp < BUBBLE_LIFETIME)
      );
    }, 1000);
    
    return () => clearInterval(cleanupInterval);
  }, []);
  
  // Render bubbles for all visible players
  return (
    <>
      {activeBubbles.map(bubble => {
        const player = players.get(bubble.playerId);
        
        // Skip if player not found or is not visible on screen
        if (!player) return null;
        
        // Calculate screen position
        const screenX = player.positionX + cameraOffsetX;
        // Position the bubble lower from player's head (was -45, now -65)
        // This puts it below where name tags appear
        const screenY = player.positionY + cameraOffsetY - 65;
        
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