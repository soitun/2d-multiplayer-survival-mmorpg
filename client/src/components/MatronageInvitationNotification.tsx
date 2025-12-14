/**
 * MatronageInvitationNotification.tsx
 * 
 * Persistent notification component that appears above the chat area
 * when the player has pending Matronage invitations.
 * 
 * Features:
 * - Shows count of pending invitations
 * - Clicking opens InterfaceContainer with Matronage tab
 * - X button to dismiss/decline all invitations
 * - Auto-hides when no invitations pending
 */

import React, { useMemo, useCallback, useState } from 'react';
import { useGameConnection } from '../contexts/GameConnectionContext';
import './MatronageInvitationNotification.css';

interface MatronageInvitationNotificationProps {
    playerUsername: string;
    matronageInvitations: Map<string, any>;
    matronages: Map<string, any>;
    onOpenMatronageTab: () => void;
}

const MatronageInvitationNotification: React.FC<MatronageInvitationNotificationProps> = ({
    playerUsername,
    matronageInvitations,
    matronages,
    onOpenMatronageTab,
}) => {
    const { connection, isConnected } = useGameConnection();
    const [isDecliningAll, setIsDecliningAll] = useState(false);

    // Get pending invitations for the current player
    const pendingInvitations = useMemo(() => {
        const usernameLower = playerUsername.toLowerCase();
        return Array.from(matronageInvitations.values()).filter(
            (inv: any) => inv.targetUsername?.toLowerCase() === usernameLower
        );
    }, [playerUsername, matronageInvitations]);

    // Get the first matronage name for display
    const firstMatronageName = useMemo(() => {
        if (pendingInvitations.length === 0) return null;
        const firstInv = pendingInvitations[0];
        const idStr = firstInv.matronageId?.toString();
        const matronage = Array.from(matronages.values()).find(
            (m: any) => m.id?.toString() === idStr
        );
        return matronage?.name || 'Unknown';
    }, [pendingInvitations, matronages]);

    // Handle decline all invitations
    const handleDeclineAll = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation(); // Don't trigger the open tab action
        if (!connection || !isConnected || isDecliningAll) return;

        setIsDecliningAll(true);
        try {
            for (const inv of pendingInvitations) {
                await connection.reducers.declineMatronageInvitation(inv.id);
            }
        } catch (error) {
            console.error('Failed to decline invitations:', error);
        }
        setIsDecliningAll(false);
    }, [connection, isConnected, pendingInvitations, isDecliningAll]);

    // Don't render if no pending invitations
    if (pendingInvitations.length === 0) {
        return null;
    }

    const invitationCount = pendingInvitations.length;

    return (
        <div className="matronage-notification" onClick={onOpenMatronageTab}>
            <div className="notification-icon">📨</div>
            <div className="notification-content">
                <div className="notification-title">
                    {invitationCount === 1 
                        ? 'Matronage Invitation' 
                        : `${invitationCount} Matronage Invitations`
                    }
                </div>
                {invitationCount === 1 && firstMatronageName && (
                    <div className="notification-detail">
                        From: {firstMatronageName}
                    </div>
                )}
                {invitationCount > 1 && (
                    <div className="notification-detail">
                        Click to view all
                    </div>
                )}
            </div>
            <button 
                className="notification-dismiss"
                onClick={handleDeclineAll}
                disabled={isDecliningAll}
                title="Decline all invitations"
            >
                ✕
            </button>
        </div>
    );
};

export default MatronageInvitationNotification;
