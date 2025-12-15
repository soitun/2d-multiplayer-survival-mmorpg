import React from 'react';
import styles from './InventoryUI.module.css';

interface InventorySearchBarProps {
    searchTerm: string;
    onSearchChange: (searchTerm: string) => void;
    placeholder?: string;
}

const InventorySearchBar: React.FC<InventorySearchBarProps> = ({
    searchTerm,
    onSearchChange,
    placeholder = "Search inventory..."
}) => {
    // Handler to stop keyboard events from propagating to game input handlers
    const handleKeyEvent = (e: React.KeyboardEvent<HTMLInputElement>) => {
        e.stopPropagation();
    };

    return (
        <div style={{ marginBottom: '12px' }}>
            <input
                type="text"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={placeholder}
                style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '14px',
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid #555',
                    borderRadius: '4px',
                    color: '#fff',
                    outline: 'none',
                    boxSizing: 'border-box'
                }}
                onFocus={(e) => {
                    e.target.style.borderColor = '#777';
                    e.target.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
                }}
                onBlur={(e) => {
                    e.target.style.borderColor = '#555';
                    e.target.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
                }}
                // Prevent keyboard events from propagating to game controls
                onKeyDown={handleKeyEvent}
                onKeyUp={handleKeyEvent}
                onKeyPress={handleKeyEvent}
            />
        </div>
    );
};

export default InventorySearchBar;

