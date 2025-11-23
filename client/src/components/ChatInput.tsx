import React, { useEffect, forwardRef, useState, useRef } from 'react';
import styles from './Chat.module.css';

interface ChatInputProps {
  inputValue: string;
  onInputChange: (value: string) => void;
  onSendMessage: () => void;
  onCloseChat: () => void; // Callback to close the chat input
  isActive: boolean; // To focus when activated
  onlinePlayerNames?: string[]; // List of online player names for autocomplete
}

const ChatInput = forwardRef<HTMLInputElement, ChatInputProps>(({
  inputValue,
  onInputChange,
  onSendMessage,
  onCloseChat,
  isActive,
  onlinePlayerNames = [],
}, ref) => {
  const [autocompleteIndex, setAutocompleteIndex] = useState<number>(-1);
  const [autocompleteMatches, setAutocompleteMatches] = useState<string[]>([]);
  const autocompleteAttemptedRef = useRef<boolean>(false);

  // Focus the input when it becomes active, and ensure it's properly unfocused when inactive
  useEffect(() => {
    if (isActive && ref && 'current' in ref && ref.current) {
      // Small timeout to ensure DOM is ready and avoid focus conflicts
      const timer = setTimeout(() => {
        if (ref.current) {
          ref.current.focus();
          // Place cursor at end of text
          const length = ref.current.value.length;
          ref.current.setSelectionRange(length, length);
        }
      }, 100); // Increased timeout for better reliability
      
      return () => clearTimeout(timer);
    } else if (!isActive && ref && 'current' in ref && ref.current) {
      // Ensure focus is released when chat becomes inactive
      const timer = setTimeout(() => {
        if (ref.current && document.activeElement === ref.current) {
          ref.current.blur();
          document.body.focus();
          console.log('[ChatInput] Force released focus - chat inactive');
        }
      }, 50);
      
      return () => clearTimeout(timer);
    }
  }, [isActive, ref]);

  const handleSendIfValid = () => {
    if (inputValue.trim()) {
      // Mark that we should send the message when blur occurs
      if (ref && 'current' in ref && ref.current) {
        (ref.current as any)._shouldSendMessage = true;
        ref.current.blur();
      }
    } else {
      // Just close chat for empty messages
      onCloseChat();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Prevent event bubbling to avoid triggering game controls
    event.stopPropagation();
    
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSendIfValid();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (ref && 'current' in ref && ref.current) {
        ref.current.blur();
      }
    } else if (event.key === 'Tab') {
      event.preventDefault();
      handleTabAutocomplete();
    }
    // No need to handle other keys - let them type normally
  };

  // Tab autocomplete for player names in whisper commands
  const handleTabAutocomplete = () => {
    const trimmed = inputValue.trim();
    
    // Check if we're in a whisper command
    const whisperMatch = trimmed.match(/^\/w(?:hisper)?\s+(\S*)$/i);
    if (!whisperMatch) {
      // Reset autocomplete state if not in whisper mode
      setAutocompleteIndex(-1);
      setAutocompleteMatches([]);
      autocompleteAttemptedRef.current = false;
      return;
    }
    
    const partialName = whisperMatch[1].toLowerCase();
    
    // If this is the first tab press, find all matches
    if (!autocompleteAttemptedRef.current || autocompleteMatches.length === 0) {
      const matches = onlinePlayerNames.filter(name => 
        name.toLowerCase().startsWith(partialName)
      );
      
      if (matches.length === 0) {
        // No matches found
        return;
      }
      
      setAutocompleteMatches(matches);
      setAutocompleteIndex(0);
      autocompleteAttemptedRef.current = true;
      
      // Apply first match
      const command = trimmed.startsWith('/whisper') ? '/whisper' : '/w';
      onInputChange(`${command} ${matches[0]} `);
    } else {
      // Cycle through matches on subsequent tab presses
      const nextIndex = (autocompleteIndex + 1) % autocompleteMatches.length;
      setAutocompleteIndex(nextIndex);
      
      const command = trimmed.startsWith('/whisper') ? '/whisper' : '/w';
      onInputChange(`${command} ${autocompleteMatches[nextIndex]} `);
    }
  };

  // Reset autocomplete when input changes (user types)
  useEffect(() => {
    // Only reset if the input doesn't match our autocomplete pattern
    const whisperMatch = inputValue.trim().match(/^\/w(?:hisper)?\s+(\S*)$/i);
    if (!whisperMatch) {
      autocompleteAttemptedRef.current = false;
      setAutocompleteMatches([]);
      setAutocompleteIndex(-1);
    }
  }, [inputValue]);

  // Handle the blur event
  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    // Small delay to handle state updates
    setTimeout(() => {
      const inputEl = ref && 'current' in ref ? ref.current : null;
      if (inputEl && (inputEl as any)._shouldSendMessage) {
        // Reset the flag and send message
        (inputEl as any)._shouldSendMessage = false;
        onSendMessage();
      } else {
        // Otherwise just close chat
        onCloseChat();
      }
      
      // Ensure focus is completely released
      if (inputEl) {
        inputEl.blur();
        // Force focus to the document body to ensure no input elements retain focus
        document.body.focus();
      }
    }, 50); // Slightly longer delay for better reliability
  };

  return (
    <input
      ref={ref}
      type="text"
      className={styles.chatInput}
      value={inputValue}
      onChange={(e) => onInputChange(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      placeholder="Enter message..."
      maxLength={200} // Increased max length
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck="false" // Disabled for cyberpunk aesthetic
      data-is-chat-input="true"
    />
  );
});

// Display name for debugging
ChatInput.displayName = 'ChatInput';

export default ChatInput; 