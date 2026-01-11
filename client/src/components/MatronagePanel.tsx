/**
 * MatronagePanel.tsx
 * 
 * Matronage Pooled Rewards System Panel
 * 
 * Displays:
 * - Matronage name, icon, and Pra Matron indicator
 * - Current pool size and time until next payout
 * - Player's owed shard balance with withdraw button
 * - Member list
 * - Pending invitations (accept/decline)
 * - Player list for inviting
 * - Management actions (Pra Matron only): invite, remove, rename, promote, dissolve, icon, description
 * - Explore tab: Browse all matronages
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Identity } from 'spacetimedb';
import { useGameConnection } from '../contexts/GameConnectionContext';
import { getItemIcon } from '../utils/itemIconUtils';
import matronsMarkIcon from '../assets/ui/matrons_mark.png';
import './MatronagePanel.css';

// Memory shard icon for rewards display
const memoryShardIcon = getItemIcon('memory_shard.png');

// Available FontAwesome icons for matronages (must match server-side ALLOWED_ICONS)
const MATRONAGE_ICONS = [
    { id: 'fa-users', label: 'Users', symbol: '👥' },
    { id: 'fa-shield', label: 'Shield', symbol: '🛡️' },
    { id: 'fa-hammer', label: 'Hammer', symbol: '🔨' },
    { id: 'fa-gem', label: 'Gem', symbol: '💎' },
    { id: 'fa-crown', label: 'Crown', symbol: '👑' },
    { id: 'fa-fire', label: 'Fire', symbol: '🔥' },
    { id: 'fa-bolt', label: 'Bolt', symbol: '⚡' },
    { id: 'fa-star', label: 'Star', symbol: '⭐' },
    { id: 'fa-skull', label: 'Skull', symbol: '💀' },
    { id: 'fa-dragon', label: 'Dragon', symbol: '🐉' },
    { id: 'fa-sword', label: 'Sword', symbol: '⚔️' },
    { id: 'fa-axe', label: 'Axe', symbol: '🪓' },
    { id: 'fa-bow-arrow', label: 'Bow', symbol: '🏹' },
    { id: 'fa-helmet-battle', label: 'Helmet', symbol: '🪖' },
    { id: 'fa-castle', label: 'Castle', symbol: '🏰' },
    { id: 'fa-coins', label: 'Coins', symbol: '🪙' },
    { id: 'fa-flask', label: 'Flask', symbol: '⚗️' },
    { id: 'fa-hand-fist', label: 'Fist', symbol: '✊' },
    { id: 'fa-mountain', label: 'Mountain', symbol: '⛰️' },
    { id: 'fa-tree', label: 'Tree', symbol: '🌲' },
    { id: 'fa-wolf', label: 'Wolf', symbol: '🐺' },
    { id: 'fa-raven', label: 'Raven', symbol: '🐦‍⬛' },
    { id: 'fa-compass', label: 'Compass', symbol: '🧭' },
    { id: 'fa-anchor', label: 'Anchor', symbol: '⚓' },
    { id: 'fa-scroll', label: 'Scroll', symbol: '📜' },
];

// Get icon symbol from id
const getIconSymbol = (iconId: string): string => {
    const icon = MATRONAGE_ICONS.find(i => i.id === iconId);
    return icon?.symbol || '👥';
};

// Props interface
interface MatronagePanelProps {
    playerIdentity: Identity | null;
    playerUsername: string;
    onClose: () => void;
    // Data from subscriptions
    matronages: Map<string, any>;
    matronageMembers: Map<string, any>;
    matronageInvitations: Map<string, any>;
    matronageOwedShards: Map<string, any>;
    players: Map<string, any>; // For username lookups
}

// Tab types - added 'explore'
type MatronageTab = 'overview' | 'members' | 'invitations' | 'management' | 'explore';

// Helper to format BigInt values
const formatBigInt = (value: any): string => {
    if (value === null || value === undefined) return '0';
    try {
        return BigInt(value).toLocaleString();
    } catch {
        return String(value);
    }
};

// Helper to format timestamp
const formatTimestamp = (timestamp: any): string => {
    try {
        const micros = timestamp?.microsSinceUnixEpoch ?? 0n;
        if (!micros || micros === 0n) return 'Unknown';
        const ms = Number(BigInt(micros) / 1000n);
        const date = new Date(ms);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    } catch {
        return 'Unknown';
    }
};

// Helper to calculate time until next payout (assuming 60 min intervals)
const getTimeUntilNextPayout = (lastPayoutAt: any): string => {
    try {
        const micros = lastPayoutAt?.microsSinceUnixEpoch ?? 0n;
        if (!micros || micros === 0n) return 'Unknown';
        const lastPayoutMs = Number(BigInt(micros) / 1000n);
        const payoutIntervalMs = 60 * 60 * 1000; // 60 minutes
        const nextPayoutMs = lastPayoutMs + payoutIntervalMs;
        const now = Date.now();
        const remainingMs = nextPayoutMs - now;
        
        if (remainingMs <= 0) return 'Imminent';
        
        const minutes = Math.floor(remainingMs / 60000);
        const seconds = Math.floor((remainingMs % 60000) / 1000);
        
        if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        }
        return `${seconds}s`;
    } catch {
        return 'Unknown';
    }
};

const MatronagePanel: React.FC<MatronagePanelProps> = ({
    playerIdentity,
    playerUsername,
    onClose,
    matronages,
    matronageMembers,
    matronageInvitations,
    matronageOwedShards,
    players,
}) => {
    const { connection, isConnected } = useGameConnection();
    const [activeTab, setActiveTab] = useState<MatronageTab>('overview');
    const [newName, setNewName] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [selectedIcon, setSelectedIcon] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isInputFocused, setIsInputFocused] = useState(false);

    // Success feedback states
    const [renameSuccess, setRenameSuccess] = useState(false);
    const [descriptionSuccess, setDescriptionSuccess] = useState(false);
    const [iconSuccess, setIconSuccess] = useState(false);
    const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

    // Dissolve confirmation dialog
    const [showDissolveDialog, setShowDissolveDialog] = useState(false);

    // Unified search/invite field for invite tab
    const [playerSearchFilter, setPlayerSearchFilter] = useState('');

    // Keyboard blocking when input is focused - prevents WASD/arrows from moving player
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Block movement keys when input is focused
            if (isInputFocused) {
                // Block WASD and arrow keys from moving player
                if (e.key === 'w' || e.key === 'W' || e.key === 'a' || e.key === 'A' ||
                    e.key === 's' || e.key === 'S' || e.key === 'd' || e.key === 'D' ||
                    e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
                    e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    e.stopPropagation();
                }
                // Spacebar needs special handling - stop propagation but don't prevent default
                // so the space character still gets typed
                if (e.key === ' ') {
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown, true); // Use capture phase
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [isInputFocused]);

    // Get player's membership
    const playerMembership = useMemo(() => {
        if (!playerIdentity) return null;
        return matronageMembers.get(playerIdentity.toHexString()) || null;
    }, [playerIdentity, matronageMembers]);

    // Get player's matronage
    const playerMatronage = useMemo(() => {
        if (!playerMembership) return null;
        return Array.from(matronages.values()).find(
            (m: any) => m.id?.toString() === playerMembership.matronageId?.toString()
        ) || null;
    }, [playerMembership, matronages]);

    // Check if player is Pra Matron
    const isPraMatron = useMemo(() => {
        if (!playerMembership) return false;
        return playerMembership.role?.tag === 'PraMatron';
    }, [playerMembership]);

    // Get all members of player's matronage
    const matronageAllMembers = useMemo(() => {
        if (!playerMatronage) return [];
        const matronageId = playerMatronage.id?.toString();
        return Array.from(matronageMembers.values()).filter(
            (m: any) => m.matronageId?.toString() === matronageId
        );
    }, [playerMatronage, matronageMembers]);

    // Get player's owed shards
    const owedShards = useMemo(() => {
        if (!playerIdentity) return 0n;
        const owed = matronageOwedShards.get(playerIdentity.toHexString());
        return owed?.owedBalance ?? 0n;
    }, [playerIdentity, matronageOwedShards]);

    // Get pending invitations for the player
    const pendingInvitations = useMemo(() => {
        const usernameLower = playerUsername.toLowerCase();
        return Array.from(matronageInvitations.values()).filter(
            (inv: any) => inv.targetUsername?.toLowerCase() === usernameLower
        );
    }, [playerUsername, matronageInvitations]);

    // Get all players for invite list (excluding current matronage members)
    const invitablePlayers = useMemo(() => {
        const memberIdentities = new Set(matronageAllMembers.map((m: any) => m.playerId?.toHexString()));
        const pendingInviteUsernames = new Set(
            Array.from(matronageInvitations.values())
                .filter((inv: any) => inv.matronageId?.toString() === playerMatronage?.id?.toString())
                .map((inv: any) => inv.targetUsername?.toLowerCase())
        );
        
        return Array.from(players.values())
            .filter((p: any) => {
                // Exclude current members
                if (memberIdentities.has(p.identity?.toHexString())) return false;
                // Exclude already invited
                if (pendingInviteUsernames.has(p.username?.toLowerCase())) return false;
                // Apply search filter
                if (playerSearchFilter) {
                    return p.username?.toLowerCase().includes(playerSearchFilter.toLowerCase());
                }
                return true;
            })
            .sort((a: any, b: any) => a.username?.localeCompare(b.username));
    }, [players, matronageAllMembers, matronageInvitations, playerMatronage, playerSearchFilter]);

    // Get all matronages with member counts for explore tab
    const allMatronagesWithInfo = useMemo(() => {
        return Array.from(matronages.values()).map((m: any) => {
            const memberCount = Array.from(matronageMembers.values()).filter(
                (member: any) => member.matronageId?.toString() === m.id?.toString()
            ).length;
            return { ...m, memberCount };
        }).sort((a, b) => b.memberCount - a.memberCount); // Sort by member count
    }, [matronages, matronageMembers]);

    // Helper to get username from identity
    const getUsernameForIdentity = useCallback((identity: any): string => {
        const identityStr = identity?.toHexString?.() || identity?.toString?.() || '';
        const player = Array.from(players.values()).find(
            (p: any) => p.identity?.toHexString?.() === identityStr || p.identity?.toString?.() === identityStr
        );
        return player?.username || identityStr.substring(0, 8) + '...';
    }, [players]);

    // Get matronage name for an invitation
    const getMatronageNameForInvitation = useCallback((matronageId: any): string => {
        const idStr = matronageId?.toString();
        const matronage = Array.from(matronages.values()).find(
            (m: any) => m.id?.toString() === idStr
        );
        return matronage?.name || 'Unknown Matronage';
    }, [matronages]);

    // Action handlers
    const handleWithdrawShards = useCallback(async () => {
        if (!connection || !isConnected) return;
        setIsLoading(true);
        setError(null);
        try {
            await connection.reducers.withdrawMatronageShards();
        } catch (e: any) {
            setError(e.message || 'Failed to withdraw shards');
        }
        setIsLoading(false);
    }, [connection, isConnected]);

    const handleAcceptInvitation = useCallback(async (invitationId: bigint) => {
        if (!connection || !isConnected) return;
        setIsLoading(true);
        setError(null);
        try {
            await connection.reducers.acceptMatronageInvitation(invitationId);
        } catch (e: any) {
            setError(e.message || 'Failed to accept invitation');
        }
        setIsLoading(false);
    }, [connection, isConnected]);

    const handleDeclineInvitation = useCallback(async (invitationId: bigint) => {
        if (!connection || !isConnected) return;
        setIsLoading(true);
        setError(null);
        try {
            await connection.reducers.declineMatronageInvitation(invitationId);
        } catch (e: any) {
            setError(e.message || 'Failed to decline invitation');
        }
        setIsLoading(false);
    }, [connection, isConnected]);

    const handleInvitePlayer = useCallback(async (username?: string) => {
        const targetUsername = username || playerSearchFilter.trim();
        if (!connection || !isConnected || !targetUsername) return;
        setIsLoading(true);
        setError(null);
        try {
            await connection.reducers.inviteToMatronage(targetUsername);
            // Only clear the search field if inviting from the direct input (not from quick invite button)
            if (!username) {
                setPlayerSearchFilter('');
            }
            setInviteSuccess(targetUsername);
            setTimeout(() => setInviteSuccess(null), 2000);
        } catch (e: any) {
            setError(e.message || 'Failed to invite player');
        }
        setIsLoading(false);
    }, [connection, isConnected, playerSearchFilter]);

    const handleRemoveMember = useCallback(async (targetIdentity: Identity) => {
        if (!connection || !isConnected) return;
        setIsLoading(true);
        setError(null);
        try {
            await connection.reducers.removeFromMatronage(targetIdentity);
        } catch (e: any) {
            setError(e.message || 'Failed to remove member');
        }
        setIsLoading(false);
    }, [connection, isConnected]);

    const handlePromoteToPraMatron = useCallback(async (targetIdentity: Identity) => {
        if (!connection || !isConnected) return;
        setIsLoading(true);
        setError(null);
        try {
            await connection.reducers.promoteToPraMatron(targetIdentity);
        } catch (e: any) {
            setError(e.message || 'Failed to promote member');
        }
        setIsLoading(false);
    }, [connection, isConnected]);

    const handleRenameMatronage = useCallback(async () => {
        if (!connection || !isConnected || !newName.trim()) return;
        setIsLoading(true);
        setError(null);
        try {
            await connection.reducers.renameMatronage(newName.trim());
            setNewName('');
            setRenameSuccess(true);
            setTimeout(() => setRenameSuccess(false), 2000);
        } catch (e: any) {
            setError(e.message || 'Failed to rename matronage');
        }
        setIsLoading(false);
    }, [connection, isConnected, newName]);

    const handleUpdateDescription = useCallback(async () => {
        if (!connection || !isConnected) return;
        setIsLoading(true);
        setError(null);
        try {
            await connection.reducers.updateMatronageDescription(newDescription.trim());
            setDescriptionSuccess(true);
            setTimeout(() => setDescriptionSuccess(false), 2000);
        } catch (e: any) {
            setError(e.message || 'Failed to update description');
        }
        setIsLoading(false);
    }, [connection, isConnected, newDescription]);

    const handleUpdateIcon = useCallback(async (iconId: string) => {
        if (!connection || !isConnected) return;
        setIsLoading(true);
        setError(null);
        try {
            await connection.reducers.updateMatronageIcon(iconId);
            setSelectedIcon(iconId);
            setIconSuccess(true);
            setTimeout(() => setIconSuccess(false), 2000);
        } catch (e: any) {
            setError(e.message || 'Failed to update icon');
        }
        setIsLoading(false);
    }, [connection, isConnected]);

    const handleLeaveMatronage = useCallback(async () => {
        if (!connection || !isConnected) return;
        setIsLoading(true);
        setError(null);
        try {
            await connection.reducers.leaveMatronage();
        } catch (e: any) {
            setError(e.message || 'Failed to leave matronage');
        }
        setIsLoading(false);
    }, [connection, isConnected]);

    const handleDissolveMatronage = useCallback(async () => {
        if (!connection || !isConnected) return;
        setShowDissolveDialog(false);
        setIsLoading(true);
        setError(null);
        try {
            await connection.reducers.dissolveMatronage();
        } catch (e: any) {
            setError(e.message || 'Failed to dissolve matronage');
        }
        setIsLoading(false);
    }, [connection, isConnected]);

    // Initialize selected icon and description from matronage data
    useEffect(() => {
        if (playerMatronage) {
            setSelectedIcon(playerMatronage.icon || 'fa-users');
            setNewDescription(playerMatronage.description || '');
        }
    }, [playerMatronage]);

    // Render dissolve confirmation dialog
    const renderDissolveDialog = () => (
        <div className="dissolve-dialog-overlay" onClick={() => setShowDissolveDialog(false)}>
            <div className="dissolve-dialog" onClick={e => e.stopPropagation()}>
                <div className="dissolve-dialog-header">
                    <span className="dissolve-icon">⚠️</span>
                    <h3>Dissolve Matronage</h3>
                </div>
                <div className="dissolve-dialog-content">
                    <p>Are you sure you want to <strong>permanently dissolve</strong> this matronage?</p>
                    <ul>
                        <li>All members will be removed</li>
                        <li>The remaining pool balance ({formatBigInt(playerMatronage?.poolBalance || 0n)} shards) will be distributed equally</li>
                        <li>This action <strong>cannot be undone</strong></li>
                    </ul>
                </div>
                <div className="dissolve-dialog-actions">
                    <button 
                        className="cancel-btn"
                        onClick={() => setShowDissolveDialog(false)}
                    >
                        Cancel
                    </button>
                    <button 
                        className="confirm-dissolve-btn"
                        onClick={handleDissolveMatronage}
                        disabled={isLoading}
                    >
                        Yes, Dissolve
                    </button>
                </div>
            </div>
        </div>
    );

    // Render not in matronage state
    const renderNoMatronage = () => (
        <div className="matronage-no-membership">
            <h3>You are not a member of any Matronage</h3>
            
            {/* Pending Invitations */}
            {pendingInvitations.length > 0 && (
                <div className="matronage-pending-invitations">
                    <h4>📨 Pending Invitations</h4>
                    {pendingInvitations.map((inv: any) => (
                        <div key={inv.id?.toString()} className="invitation-card">
                            <div className="invitation-info">
                                <span className="invitation-matronage">
                                    {getMatronageNameForInvitation(inv.matronageId)}
                                </span>
                                <span className="invitation-from">
                                    Invited by: {getUsernameForIdentity(inv.invitedBy)}
                                </span>
                            </div>
                            <div className="invitation-actions">
                                <button 
                                    className="accept-btn"
                                    onClick={() => handleAcceptInvitation(inv.id)}
                                    disabled={isLoading}
                                >
                                    Accept
                                </button>
                                <button 
                                    className="decline-btn"
                                    onClick={() => handleDeclineInvitation(inv.id)}
                                    disabled={isLoading}
                                >
                                    Decline
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Owed Shards (from past membership) */}
            {owedShards > 0n && (
                <div className="matronage-owed-shards-section">
                    <h4>💎 Owed Shards</h4>
                    <p>You have {formatBigInt(owedShards)} shards to withdraw from past matronage membership.</p>
                    <button 
                        className="withdraw-btn"
                        onClick={handleWithdrawShards}
                        disabled={isLoading}
                    >
                        Withdraw at Central Compound
                    </button>
                </div>
            )}

            {/* Info about creating a matronage */}
            <div className="matronage-create-info">
                <h4>🏛️ Create a Matronage</h4>
                <p>To found a Matronage, craft a <strong>Matron's Mark</strong> (100 Metal Fragments) and visit the <strong>ALK Central Compound</strong>.</p>
            </div>

            {/* Browse existing matronages */}
            <div className="matronage-explore-preview">
                <h4>🔍 Browse Matronages</h4>
                <p>There are <strong>{matronages.size}</strong> active matronages on the server.</p>
                <button 
                    className="explore-btn"
                    onClick={() => setActiveTab('explore')}
                >
                    View All Matronages
                </button>
            </div>
        </div>
    );

    // Render overview tab
    const renderOverview = () => (
        <div className="matronage-overview">
            <div className="matronage-header">
                <span className="matronage-icon-display">{getIconSymbol(playerMatronage?.icon)}</span>
                <h2 className="matronage-name">{playerMatronage?.name || 'Unknown'}</h2>
                {isPraMatron && <span className="pra-matron-badge">👑 Pra Matron</span>}
            </div>

            {playerMatronage?.description && (
                <div className="matronage-description-display">
                    <p>{playerMatronage.description}</p>
                </div>
            )}

            <div className="matronage-stats">
                <div className="stat-card">
                    <div className="stat-label">Pool Balance</div>
                    <div className="stat-value pool-value">
                        <img src={memoryShardIcon} alt="Shards" className="shard-icon" />
                        {formatBigInt(playerMatronage?.poolBalance || 0n)}
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Next Payout</div>
                    <div className="stat-value">{getTimeUntilNextPayout(playerMatronage?.lastPayoutAt)}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Members</div>
                    <div className="stat-value">{matronageAllMembers.length}</div>
                </div>
            </div>

            <div className="owed-shards-section">
                <h3>💎 Your Owed Shards</h3>
                <div className="owed-shards-display">
                    <img src={memoryShardIcon} alt="Shards" className="shard-icon-large" />
                    <span className="owed-amount">{formatBigInt(owedShards)}</span>
                </div>
                {owedShards > 0n && (
                    <button 
                        className="withdraw-btn"
                        onClick={handleWithdrawShards}
                        disabled={isLoading}
                    >
                        Withdraw at Central Compound
                    </button>
                )}
            </div>

            <div className="matronage-info">
                <p><strong>Founded:</strong> {formatTimestamp(playerMatronage?.createdAt)}</p>
                <p><strong>Last Payout:</strong> {formatTimestamp(playerMatronage?.lastPayoutAt)}</p>
            </div>
        </div>
    );

    // Render members tab
    const renderMembers = () => (
        <div className="matronage-members">
            <h3>👥 Members ({matronageAllMembers.length})</h3>
            <div className="members-list">
                {matronageAllMembers.map((member: any) => {
                    const username = getUsernameForIdentity(member.playerId);
                    const isCurrentPlayer = member.playerId?.toHexString?.() === playerIdentity?.toHexString();
                    const memberIsPraMatron = member.role?.tag === 'PraMatron';
                    
                    return (
                        <div key={member.playerId?.toString()} className={`member-card ${isCurrentPlayer ? 'current-player' : ''}`}>
                            <div className="member-info">
                                <span className="member-name">
                                    {username}
                                    {memberIsPraMatron && <span className="pra-matron-indicator">👑</span>}
                                    {isCurrentPlayer && <span className="you-indicator">(You)</span>}
                                </span>
                                <span className="member-joined">
                                    Joined: {formatTimestamp(member.joinedAt)}
                                </span>
                            </div>
                            {isPraMatron && !isCurrentPlayer && (
                                <div className="member-actions">
                                    <button 
                                        className="promote-btn"
                                        onClick={() => handlePromoteToPraMatron(member.playerId)}
                                        disabled={isLoading}
                                        title="Transfer leadership"
                                    >
                                        👑
                                    </button>
                                    <button 
                                        className="remove-btn"
                                        onClick={() => handleRemoveMember(member.playerId)}
                                        disabled={isLoading}
                                        title="Remove from matronage"
                                    >
                                        ✕
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );

    // Render invitations tab (for Pra Matron)
    const renderInvitations = () => (
        <div className="matronage-invitations">
            <h3>📨 Invite Players</h3>
            {isPraMatron ? (
                <>
                    {/* Unified search/invite input */}
                    <div className="invite-form">
                        <input
                            type="text"
                            placeholder="Search or enter username to invite..."
                            value={playerSearchFilter}
                            onChange={(e) => setPlayerSearchFilter(e.target.value)}
                            onFocus={() => setIsInputFocused(true)}
                            onBlur={() => setIsInputFocused(false)}
                            onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === 'Enter' && playerSearchFilter.trim()) {
                                    handleInvitePlayer();
                                }
                            }}
                            className="invite-input"
                            data-allow-spacebar="true"
                        />
                        <button 
                            className={`invite-btn ${inviteSuccess ? 'success' : ''}`}
                            onClick={() => handleInvitePlayer()}
                            disabled={isLoading || !playerSearchFilter.trim()}
                        >
                            {inviteSuccess ? '✓ Sent!' : 'Invite'}
                        </button>
                    </div>

                    {/* Filtered player list */}
                    <div className="player-list-section">
                        <h4>{playerSearchFilter ? '🔍 Matching Players' : '🔍 Available Players'}</h4>
                        <div className="player-invite-list">
                            {invitablePlayers.length === 0 ? (
                                <p className="no-players">
                                    {playerSearchFilter.trim() 
                                        ? `No players found matching "${playerSearchFilter}". You can still invite by username above.`
                                        : 'No players available to invite'}
                                </p>
                            ) : (
                                <>
                                    {invitablePlayers.slice(0, 20).map((player: any) => (
                                        <div key={player.identity?.toHexString()} className="player-invite-row">
                                            <span className="player-invite-name">{player.username}</span>
                                            <button 
                                                className="quick-invite-btn"
                                                onClick={() => handleInvitePlayer(player.username)}
                                                disabled={isLoading}
                                                title="Send invite"
                                            >
                                                +
                                            </button>
                                        </div>
                                    ))}
                                    {invitablePlayers.length > 20 && (
                                        <p className="more-players">+{invitablePlayers.length - 20} more players...</p>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </>
            ) : (
                <p className="no-permission">Only the Pra Matron can invite new members.</p>
            )}
        </div>
    );

    // Render management tab (for Pra Matron)
    const renderManagement = () => (
        <div className="matronage-management">
            <h3>⚙️ Management</h3>
            
            {isPraMatron ? (
                <>
                    {/* Rename section */}
                    <div className="management-section">
                        <h4>Rename Matronage</h4>
                        <p className="current-value">Current: <strong>{playerMatronage?.name}</strong></p>
                        <div className="rename-form">
                            <input
                                type="text"
                                placeholder="New name..."
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                onFocus={() => setIsInputFocused(true)}
                                onBlur={() => setIsInputFocused(false)}
                                onKeyDown={(e) => {
                                    e.stopPropagation();
                                    if (e.key === 'Enter' && newName.trim()) {
                                        handleRenameMatronage();
                                    }
                                }}
                                className="rename-input"
                                maxLength={32}
                                data-allow-spacebar="true"
                            />
                            <button 
                                className={`rename-btn ${renameSuccess ? 'success' : ''}`}
                                onClick={handleRenameMatronage}
                                disabled={isLoading || !newName.trim()}
                            >
                                {renameSuccess ? '✓' : 'Rename'}
                            </button>
                        </div>
                    </div>

                    {/* Icon selection */}
                    <div className="management-section">
                        <h4>Choose Icon {iconSuccess && <span className="success-indicator">✓ Saved!</span>}</h4>
                        <div className="icon-grid">
                            {MATRONAGE_ICONS.map(icon => (
                                <button
                                    key={icon.id}
                                    className={`icon-btn ${(selectedIcon || playerMatronage?.icon) === icon.id ? 'selected' : ''}`}
                                    onClick={() => handleUpdateIcon(icon.id)}
                                    disabled={isLoading}
                                    title={icon.label}
                                >
                                    {icon.symbol}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Description */}
                    <div className="management-section">
                        <h4>Description</h4>
                        <textarea
                            placeholder="Describe your matronage..."
                            value={newDescription}
                            onChange={(e) => setNewDescription(e.target.value)}
                            onFocus={() => setIsInputFocused(true)}
                            onBlur={() => setIsInputFocused(false)}
                            onKeyDown={(e) => e.stopPropagation()}
                            className="description-input"
                            maxLength={200}
                            data-allow-spacebar="true"
                        />
                        <div className="description-footer">
                            <span className="char-count">{newDescription.length}/200</span>
                            <button 
                                className={`save-btn ${descriptionSuccess ? 'success' : ''}`}
                                onClick={handleUpdateDescription}
                                disabled={isLoading}
                            >
                                {descriptionSuccess ? '✓' : 'Save Description'}
                            </button>
                        </div>
                    </div>

                    {/* Danger zone */}
                    <div className="management-section danger-section">
                        <h4>⚠️ Danger Zone</h4>
                        <button 
                            className="dissolve-btn"
                            onClick={() => setShowDissolveDialog(true)}
                            disabled={isLoading}
                        >
                            Dissolve Matronage
                        </button>
                        <p className="danger-note">
                            Dissolving will distribute the remaining pool to all members and remove the organization.
                        </p>
                    </div>
                </>
            ) : (
                <>
                    <p className="no-permission">Only the Pra Matron can manage the matronage.</p>
                    <div className="management-section">
                        <button 
                            className="leave-btn"
                            onClick={handleLeaveMatronage}
                            disabled={isLoading}
                        >
                            Leave Matronage
                        </button>
                    </div>
                </>
            )}
        </div>
    );

    // Render explore tab
    const renderExplore = () => (
        <div className="matronage-explore">
            {/* Back button */}
            <button 
                className="explore-back-btn"
                onClick={() => setActiveTab('overview')}
            >
                <span className="back-arrow">◀</span>
                Back
            </button>
            <div className="matronage-explore-list">
                {allMatronagesWithInfo.length === 0 ? (
                    <p className="no-matronages">No matronages exist yet. Be the first to create one!</p>
                ) : (
                    allMatronagesWithInfo.map((m: any) => (
                        <div key={m.id?.toString()} className={`explore-card ${playerMatronage?.id?.toString() === m.id?.toString() ? 'current' : ''}`}>
                            <div className="explore-card-header">
                                <span className="explore-icon">{getIconSymbol(m.icon)}</span>
                                <div className="explore-card-title">
                                    <span className="explore-name">{m.name}</span>
                                    {playerMatronage?.id?.toString() === m.id?.toString() && (
                                        <span className="your-matronage-badge">Your Matronage</span>
                                    )}
                                </div>
                                <span className="explore-members">{m.memberCount} 👥</span>
                            </div>
                            {m.description && (
                                <p className="explore-description">{m.description}</p>
                            )}
                            <div className="explore-footer">
                                <span className="explore-founded">Founded: {formatTimestamp(m.createdAt)}</span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );

    return (
        <div className="matronage-panel">
            <div className="matronage-panel-header">
                <h2>
                    <img 
                        src={matronsMarkIcon} 
                        alt="Matronage" 
                        style={{ 
                            width: '28px', 
                            height: '28px',
                            imageRendering: 'pixelated',
                            marginRight: '8px',
                        }} 
                    />
                    MATRONAGE
                </h2>
            </div>

            {error && (
                <div className="matronage-error">
                    {error}
                    <button onClick={() => setError(null)}>✕</button>
                </div>
            )}

            {showDissolveDialog && renderDissolveDialog()}

            {!playerMatronage && activeTab !== 'explore' ? (
                renderNoMatronage()
            ) : (
                <>
                    <div className="matronage-tabs">
                        {playerMatronage && (
                            <>
                                <button 
                                    className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('overview')}
                                >
                                    Overview
                                </button>
                                <button 
                                    className={`tab ${activeTab === 'members' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('members')}
                                >
                                    Members
                                </button>
                                {isPraMatron && (
                                    <button 
                                        className={`tab ${activeTab === 'invitations' ? 'active' : ''}`}
                                        onClick={() => setActiveTab('invitations')}
                                    >
                                        Invite
                                    </button>
                                )}
                                <button 
                                    className={`tab ${activeTab === 'management' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('management')}
                                >
                                    {isPraMatron ? 'Manage' : 'Leave'}
                                </button>
                            </>
                        )}
                    </div>

                    <div className="matronage-content">
                        {activeTab === 'overview' && playerMatronage && renderOverview()}
                        {activeTab === 'members' && playerMatronage && renderMembers()}
                        {activeTab === 'invitations' && playerMatronage && renderInvitations()}
                        {activeTab === 'management' && playerMatronage && renderManagement()}
                        {activeTab === 'explore' && renderExplore()}
                    </div>
                </>
            )}
        </div>
    );
};

export default MatronagePanel;
