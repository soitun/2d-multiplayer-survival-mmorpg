/******************************************************************************
 * ComboContextMenu.tsx                                                       *
 * -------------------------------------------------------------------------- *
 * Context menu that appears when player approaches a campfire+broth pot      *
 * combo. Allows player to choose which container to interact with.           *
 ******************************************************************************/

import React from 'react';
import styles from './InventoryUI.module.css'; // Reuse styles

interface ComboContextMenuProps {
    campfireId: number;
    brothPotId: number;
    onSelectCampfire: () => void;
    onSelectBrothPot: () => void;
    onClose: () => void;
    position: { x: number; y: number };
}

const ComboContextMenu: React.FC<ComboContextMenuProps> = ({
    campfireId,
    brothPotId,
    onSelectCampfire,
    onSelectBrothPot,
    onClose,
    position
}) => {
    return (
        <div 
            className={styles.comboContextMenu}
            style={{
                position: 'fixed',
                left: `${position.x - 100}px`, // Center horizontally (assuming ~200px width)
                top: `${position.y - 100}px`, // Center vertically (assuming ~200px height)
                zIndex: 10000,
                backgroundColor: 'rgba(20, 10, 40, 0.95)',
                border: '2px solid #87CEEB',
                borderRadius: '8px',
                padding: '16px',
                minWidth: '220px',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.7), 0 0 20px rgba(135, 206, 235, 0.3)',
                backdropFilter: 'blur(4px)'
            }}
            onClick={(e) => e.stopPropagation()}
        >
            <div style={{ 
                fontSize: '14px', 
                fontWeight: 'bold', 
                color: '#87CEEB', 
                marginBottom: '12px',
                textAlign: 'center'
            }}>
                Select Container
            </div>
            
            <button
                onClick={() => {
                    onSelectCampfire();
                    // Menu will close automatically when interactingWith changes
                }}
                style={{
                    width: '100%',
                    marginBottom: '8px',
                    padding: '12px',
                    fontSize: '14px',
                    backgroundColor: 'rgba(135, 206, 235, 0.2)',
                    color: '#87CEEB',
                    border: '2px solid #87CEEB',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    transition: 'all 0.2s ease',
                    textShadow: '0 0 4px rgba(135, 206, 235, 0.5)'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(135, 206, 235, 0.3)';
                    e.currentTarget.style.boxShadow = '0 0 8px rgba(135, 206, 235, 0.6)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(135, 206, 235, 0.2)';
                    e.currentTarget.style.boxShadow = 'none';
                }}
            >
                🔥 Campfire
            </button>
            
            <button
                onClick={() => {
                    onSelectBrothPot();
                    // Menu will close automatically when interactingWith changes
                }}
                style={{
                    width: '100%',
                    marginBottom: '8px',
                    padding: '12px',
                    fontSize: '14px',
                    backgroundColor: 'rgba(135, 206, 235, 0.2)',
                    color: '#87CEEB',
                    border: '2px solid #87CEEB',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    transition: 'all 0.2s ease',
                    textShadow: '0 0 4px rgba(135, 206, 235, 0.5)'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(135, 206, 235, 0.3)';
                    e.currentTarget.style.boxShadow = '0 0 8px rgba(135, 206, 235, 0.6)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(135, 206, 235, 0.2)';
                    e.currentTarget.style.boxShadow = 'none';
                }}
            >
                🍲 Broth Pot
            </button>
            
            <button
                onClick={onClose}
                style={{
                    width: '100%',
                    marginTop: '8px',
                    padding: '6px',
                    fontSize: '12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    color: '#aaaaaa',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '4px',
                    cursor: 'pointer'
                }}
            >
                Cancel
            </button>
        </div>
    );
};

export default ComboContextMenu;

