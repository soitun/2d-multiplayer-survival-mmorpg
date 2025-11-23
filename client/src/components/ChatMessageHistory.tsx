import React, { useEffect, useRef, RefObject, useMemo } from 'react';
import { Message as SpacetimeDBMessage, Player as SpacetimeDBPlayer, PrivateMessage as SpacetimeDBPrivateMessage } from '../generated'; // Assuming Message and Player types are generated
import { Identity } from 'spacetimedb'; // Import Identity directly from SDK
import styles from './Chat.module.css';

// Combined message type for internal use
type CombinedMessage = (SpacetimeDBMessage | SpacetimeDBPrivateMessage) & { isPrivate?: boolean; senderDisplayNameOverride?: string };

interface ChatMessageHistoryProps {
  messages: Map<string, SpacetimeDBMessage>; // Pass the messages map
  privateMessages: Map<string, SpacetimeDBPrivateMessage>; // Add privateMessages prop
  players: Map<string, SpacetimeDBPlayer>; // Pass players map to look up names
  localPlayerIdentity: string | undefined; // Changed from string | null
  messageEndRef: RefObject<HTMLDivElement>; // Add the ref parameter
}

const ChatMessageHistory: React.FC<ChatMessageHistoryProps> = ({ messages, privateMessages, players, localPlayerIdentity, messageEndRef }) => {
  const historyRef = useRef<HTMLDivElement>(null);

  // Memoize and sort all messages (public and private)
  const allSortedMessages = useMemo(() => {
    const combined: CombinedMessage[] = [];

    messages.forEach(msg => combined.push(msg));
    privateMessages.forEach(msg => combined.push({ ...msg, isPrivate: true }));

    combined.sort((a, b) => {
      const timeA = a.sent?.microsSinceUnixEpoch ?? 0n;
      const timeB = b.sent?.microsSinceUnixEpoch ?? 0n;
      if (timeA < timeB) return -1;
      if (timeA > timeB) return 1;
      return 0;
    });
    return combined;
  }, [messages, privateMessages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [allSortedMessages]); // Re-run effect when combined messages map changes

  const getPlayerName = (identity: Identity): string => {
    const identityHex = identity.toHexString();
    const player = players.get(identityHex);
    return player?.username ?? identityHex.substring(0, 8); // Fallback to short ID
  };

  // Function to determine if a sender is the module (SYSTEM for public messages)
  // This is a placeholder. A robust way would be to get the module identity from the connection.
  const isSenderSystemModule = (senderIdentity: Identity): boolean => {
    // Crude check: if not a known player and not the local player, assume system for public messages.
    // This is NOT robust. Ideally, compare with actual module identity if available.
    const senderHex = senderIdentity.toHexString();
    if (!players.has(senderHex) && senderHex !== localPlayerIdentity) {
        // Further check: ensure it's not just an unknown player by checking if a player object COULD exist
        // This is still not perfect. Best is to have module identity.
        return true; // Tentatively assume system if sender is not in players map
    }
    return false;
  };

  return (
    <div ref={historyRef} className={styles.messageHistory}>
      {allSortedMessages.map(msg => {
        let senderName: string;
        let messageText = msg.text;
        let messageStyle: React.CSSProperties = {};
        const systemMessageColor = '#FFD700'; // Gold color for system messages
        const whisperColor = '#FF69B4'; // Hot pink for whispers
        let isSystemMsg = false;
        let isWhisper = false;

        if (msg.isPrivate) {
          const privateMsg = msg as SpacetimeDBPrivateMessage;
          if (privateMsg.senderDisplayName === 'SYSTEM') {
            senderName = 'SYSTEM';
            isSystemMsg = true;
          } else {
            // It's a whisper from another player
            senderName = privateMsg.senderDisplayName;
            isWhisper = true;
          }
        } else {
          const publicMsg = msg as SpacetimeDBMessage;
          if (isSenderSystemModule(publicMsg.sender)) {
            senderName = 'SYSTEM';
            isSystemMsg = true;
          } else {
            senderName = getPlayerName(publicMsg.sender);
          }
        }

        if (isSystemMsg) {
            messageStyle = { color: systemMessageColor, fontStyle: 'italic' };
        } else if (isWhisper) {
            messageStyle = { 
              color: whisperColor, 
              fontStyle: 'italic',
              backgroundColor: 'rgba(255, 105, 180, 0.1)',
              borderLeft: '3px solid ' + whisperColor,
              paddingLeft: '8px'
            };
        }

        // Use msg.id if it exists on both types and is unique, otherwise use index or generate key
        const key = msg.id ? msg.id.toString() : Math.random().toString(); 

        // Convert microseconds to Date for timestamp display
        const timestamp = new Date(Number(msg.sent?.microsSinceUnixEpoch ?? 0n) / 1000);

        // Build CSS classes
        const messageClasses = [styles.message];
        if (isWhisper) {
          messageClasses.push(styles.whisperMessage);
        }
        
        const senderNameClasses = [styles.senderName];
        if (isWhisper) {
          senderNameClasses.push(styles.whisperSenderName);
        }
        
        const messageTextClasses = [styles.messageText];
        if (isWhisper) {
          messageTextClasses.push(styles.whisperMessageText);
        }

        return (
          <div key={key} className={messageClasses.join(' ')} style={messageStyle}>
            <div className={styles.messageHeader}>
              <span className={senderNameClasses.join(' ')}>{senderName}:</span>
              <span className={styles.timestamp}>
                {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            <span className={messageTextClasses.join(' ')}>{messageText}</span>
          </div>
        );
      })}
      <div ref={messageEndRef} />
    </div>
  );
};

export default ChatMessageHistory; 