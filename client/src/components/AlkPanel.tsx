/**
 * AlkPanel.tsx
 * 
 * ALK (Automated Logistics Kernel) Provisioning Board Panel
 * 
 * Displays:
 * - Available contracts grouped by type (Base Food, Base Industrial, Daily Bonus)
 * - Player's active contracts
 * - Shard balance
 * - Station information
 * 
 * Features:
 * - Accept contracts
 * - View contract details
 * - Track delivery progress
 * - Season and cycle information
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Identity } from 'spacetimedb';
import { useGameConnection } from '../contexts/GameConnectionContext';
import { getItemIcon } from '../utils/itemIconUtils';
import alkIcon from '../assets/ui/alk.png';
import './AlkPanel.css';

// Types from generated bindings (will be available after spacetime generate)
import {
    AlkState,
    AlkStation,
    AlkContract,
    AlkPlayerContract,
    PlayerShardBalance,
    AlkContractKind,
    AlkContractStatus,
    AlkStationAllowance,
    WorldState,
    ItemDefinition,
} from '../generated';

// Memory shard icon for rewards display
const memoryShardIcon = getItemIcon('memory_shard.png');

// Props interface
interface AlkPanelProps {
    playerIdentity: Identity | null;
    onClose: () => void;
    // Data from subscriptions
    alkState: AlkState | null;
    alkStations: Map<string, AlkStation>;
    alkContracts: Map<string, AlkContract>;
    alkPlayerContracts: Map<string, AlkPlayerContract>;
    playerShardBalance: PlayerShardBalance | null; // Legacy - we count inventory instead
    worldState: WorldState | null;
    itemDefinitions: Map<string, ItemDefinition>;
    inventoryItems?: Map<string, any>; // For counting Memory Shards
}

// Tab types - expanded for all contract categories
type AlkTab = 'seasonal' | 'materials' | 'arms' | 'armor' | 'tools' | 'provisions' | 'bonus' | 'my-contracts';

// Helper function to get season name
const getSeasonName = (seasonIndex: number): string => {
    switch (seasonIndex) {
        case 0: return 'Spring';
        case 1: return 'Summer';
        case 2: return 'Autumn';
        case 3: return 'Winter';
        default: return 'Unknown';
    }
};

// Helper function to get contract kind display name
// Uses string comparison for forward compatibility with new contract kinds
const getContractKindName = (kind: AlkContractKind | null | undefined): string => {
    if (!kind || !('tag' in kind)) return 'Unknown';
    
    const kindTag = kind.tag as string;
    switch (kindTag) {
        case 'SeasonalHarvest': return '🌱 Harvest';
        case 'Materials': return '📦 Materials';
        case 'Arms': return '⚔️ Arms';
        case 'Armor': return '🛡️ Armor';
        case 'Tools': return '🔧 Tools';
        case 'Provisions': return '🍖 Provisions';
        case 'DailyBonus': return '⭐ Bonus';
        // Legacy
        case 'BaseFood': return '🌱 Harvest';
        case 'BaseIndustrial': return '📦 Materials';
        default: return kindTag || 'Unknown';
    }
};

// Helper function to get station allowance description
const getStationAllowanceText = (allowance: AlkStationAllowance): string => {
    if ('tag' in allowance) {
        switch (allowance.tag) {
            case 'CompoundOnly': return 'Central Compound Only';
            case 'SubstationsOnly': return 'Substations Only';
            case 'AllStations': return 'All Stations';
            default: return 'Unknown';
        }
    }
    return 'Unknown';
};

// Helper function to format timestamp for display
const formatAcceptedTime = (timestamp: any): string => {
    try {
        // SpacetimeDB Timestamp has microsSinceUnixEpoch property
        const micros = timestamp?.microsSinceUnixEpoch ?? 0n;
        if (!micros || micros === 0n) return 'Unknown';
        const ms = Number(BigInt(micros) / 1000n);
        const date = new Date(ms);
        // Format as relative time or absolute
        const now = Date.now();
        const diffMs = now - ms;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    } catch {
        return 'Unknown';
    }
};

// Contract Card Component
interface ContractCardProps {
    contract: AlkContract;
    itemDef: ItemDefinition | null;
    onAccept: (contractId: bigint, quantity: number) => void;
    isAccepted: boolean;
    currentSeason: number;
    onQuantityInputFocusChange?: (isFocused: boolean) => void;
    // For MAX button - calculate from inventory/hotbar
    inventoryItems?: Map<string, any>;
    itemDefinitions?: Map<string, ItemDefinition>;
    playerIdentity?: Identity | null;
}

const ContractCard: React.FC<ContractCardProps> = ({
    contract,
    itemDef,
    onAccept,
    isAccepted,
    currentSeason,
    onQuantityInputFocusChange,
    inventoryItems,
    itemDefinitions,
    playerIdentity,
}) => {
    // Contract count = how many contracts (each contract = 1 bundle worth of items)
    const [contractCount, setContractCount] = useState(1);
    
    // Calculate how many of this item the player has in inventory/hotbar (not storage)
    const playerItemCount = useMemo(() => {
        if (!playerIdentity || !inventoryItems || !itemDefinitions) return 0;
        
        let total = 0;
        inventoryItems.forEach((item) => {
            // Check if owned by player (inventory or hotbar only, not storage)
            const loc = item.location;
            if (!loc) return;
            
            let isOwned = false;
            if (loc.tag === 'Inventory' && loc.value?.ownerId?.isEqual(playerIdentity)) {
                isOwned = true;
            } else if (loc.tag === 'Hotbar' && loc.value?.ownerId?.isEqual(playerIdentity)) {
                isOwned = true;
            }
            
            if (!isOwned) return;
            
            // Check if this is the contract's item
            if (item.itemDefId === contract.itemDefId) {
                total += Number(item.quantity);
            }
        });
        
        return total;
    }, [playerIdentity, inventoryItems, contract.itemDefId]);
    
    // Max contracts from pool (if limited)
    const maxFromPool = contract.currentPoolRemaining 
        ? Math.ceil(Number(contract.currentPoolRemaining) / contract.bundleSize) 
        : 99;
    
    // Max contracts from inventory (how many bundles can player deliver)
    const maxFromInventory = Math.floor(playerItemCount / contract.bundleSize);
    
    // Each contract requires bundleSize items and pays shardRewardPerBundle
    // Use the lower of pool limit and arbitrary max (99)
    const maxContracts = Math.min(maxFromPool, 99);
    const totalItemsRequired = contractCount * contract.bundleSize;
    const totalReward = contractCount * contract.shardRewardPerBundle;
    
    // Get item icon - try from itemDef first, fall back to contract.itemIconAsset
    const itemIcon = useMemo(() => {
        if (itemDef?.iconAssetName) {
            return getItemIcon(itemDef.iconAssetName);
        }
        // Fallback: try to construct icon name from item name
        const itemName = (contract.itemName || '').trim().toLowerCase().replace(/\s+/g, '_');
        return getItemIcon(`${itemName}.png`);
    }, [itemDef, contract.itemName]);
    
    // Clean item name (remove leading/trailing spaces)
    const cleanItemName = (contract.itemName || '').trim();
    
    // Check if contract is seasonally available
    const isSeasonallyAvailable = contract.requiredSeason === null || 
        contract.requiredSeason === undefined ||
        Number(contract.requiredSeason) === currentSeason;
    
    const handleContractCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = Math.max(1, Math.min(maxContracts, parseInt(e.target.value) || 1));
        setContractCount(value);
    };
    
    return (
        <div className={`alk-contract-card ${isAccepted ? 'accepted' : ''} ${!isSeasonallyAvailable ? 'out-of-season' : ''}`}>
            <div className="contract-header">
                <div className="contract-item-info">
                    <img 
                        src={itemIcon} 
                        alt={cleanItemName} 
                        className="contract-item-icon"
                    />
                    <div className="contract-item-text">
                        <span className="contract-item-name">{cleanItemName}</span>
                        <span className="contract-kind">{getContractKindName(contract.kind)}</span>
                    </div>
                </div>
                {contract.expiresOnDay && (
                    <div className="contract-expiry">
                        Expires: Day {Number(contract.expiresOnDay)}
                    </div>
                )}
            </div>
            
            <div className="contract-details">
                <div className="contract-stat">
                    <span className="stat-label">Bundle Size:</span>
                    <span className="stat-value">{contract.bundleSize}</span>
                </div>
                <div className="contract-stat reward">
                    <span className="stat-label">Reward/Bundle:</span>
                    <span className="stat-value shard-reward">
                        {contract.shardRewardPerBundle}
                        <img src={memoryShardIcon} alt="shards" className="shard-icon" />
                    </span>
                </div>
                {contract.currentPoolRemaining !== null && contract.currentPoolRemaining !== undefined && (
                    <div className="contract-stat pool">
                        <span className="stat-label">Pool Remaining:</span>
                        <span className="stat-value">{Number(contract.currentPoolRemaining)}</span>
                    </div>
                )}
                <div className="contract-stat">
                    <span className="stat-label">Delivery:</span>
                    <span className="stat-value">{getStationAllowanceText(contract.allowedStations)}</span>
                </div>
            </div>
            
            {!isAccepted && isSeasonallyAvailable && (
                <div className="contract-actions">
                    <div className="quantity-selector" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ color: '#00aaff', fontSize: '13px' }}>Contracts:</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            {/* Decrease Button */}
                            <button 
                                onClick={() => setContractCount(Math.max(1, contractCount - 1))}
                                disabled={contractCount <= 1}
                                style={{
                                    width: '24px',
                                    height: '24px',
                                    padding: '0',
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    background: contractCount > 1 ? 'linear-gradient(135deg, rgba(0, 170, 255, 0.3), rgba(0, 150, 220, 0.4))' : 'linear-gradient(135deg, rgba(40, 40, 60, 0.5), rgba(30, 30, 50, 0.6))',
                                    color: contractCount > 1 ? '#00aaff' : '#666',
                                    border: contractCount > 1 ? '2px solid rgba(0, 170, 255, 0.4)' : '2px solid rgba(100, 100, 120, 0.3)',
                                    borderRadius: '3px 0 0 3px',
                                    cursor: contractCount > 1 ? 'pointer' : 'not-allowed',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: contractCount > 1 ? '0 0 8px rgba(0, 170, 255, 0.2)' : 'none',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                −
                            </button>
                            
                            {/* Quantity Input */}
                            <input
                                type="number"
                                value={contractCount}
                                onChange={handleContractCountChange}
                                onFocus={() => onQuantityInputFocusChange?.(true)}
                                onBlur={() => onQuantityInputFocusChange?.(false)}
                                min={1}
                                max={maxContracts}
                                step={1}
                                style={{
                                    width: '40px',
                                    height: '24px',
                                    padding: '0',
                                    fontSize: '13px',
                                    textAlign: 'center',
                                    background: 'linear-gradient(135deg, rgba(20, 30, 60, 0.8), rgba(15, 25, 50, 0.9))',
                                    border: '2px solid rgba(0, 170, 255, 0.4)',
                                    borderLeft: 'none',
                                    borderRight: 'none',
                                    color: '#00ffff',
                                    outline: 'none',
                                    textShadow: '0 0 5px rgba(0, 255, 255, 0.4)',
                                    MozAppearance: 'textfield' as any
                                }}
                            />
                            
                            {/* Increase Button */}
                            <button 
                                onClick={() => setContractCount(Math.min(maxContracts, contractCount + 1))}
                                disabled={contractCount >= maxContracts}
                                style={{
                                    width: '24px',
                                    height: '24px',
                                    padding: '0',
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    background: contractCount < maxContracts ? 'linear-gradient(135deg, rgba(0, 170, 255, 0.3), rgba(0, 150, 220, 0.4))' : 'linear-gradient(135deg, rgba(40, 40, 60, 0.5), rgba(30, 30, 50, 0.6))',
                                    color: contractCount < maxContracts ? '#00aaff' : '#666',
                                    border: contractCount < maxContracts ? '2px solid rgba(0, 170, 255, 0.4)' : '2px solid rgba(100, 100, 120, 0.3)',
                                    borderRadius: '0',
                                    cursor: contractCount < maxContracts ? 'pointer' : 'not-allowed',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: contractCount < maxContracts ? '0 0 8px rgba(0, 170, 255, 0.2)' : 'none',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                +
                            </button>
                            
                            {/* MAX Button - Set to max contracts fulfillable from inventory */}
                            <button 
                                onClick={() => setContractCount(Math.min(maxContracts, Math.max(1, maxFromInventory)))}
                                disabled={maxFromInventory <= 0}
                                title={maxFromInventory > 0 
                                    ? `Set to ${Math.min(maxContracts, maxFromInventory)} contracts (you have ${playerItemCount} ${contract.itemName.trim()} in inventory)` 
                                    : `No ${contract.itemName.trim()} in inventory/hotbar`}
                                style={{
                                    width: '36px',
                                    height: '24px',
                                    padding: '0 4px',
                                    fontSize: '10px',
                                    fontWeight: 'bold',
                                    background: maxFromInventory > 0 
                                        ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.3), rgba(0, 200, 100, 0.4))' 
                                        : 'linear-gradient(135deg, rgba(40, 40, 60, 0.5), rgba(30, 30, 50, 0.6))',
                                    color: maxFromInventory > 0 ? '#00ff88' : '#666',
                                    border: maxFromInventory > 0 
                                        ? '2px solid rgba(0, 255, 136, 0.4)' 
                                        : '2px solid rgba(100, 100, 120, 0.3)',
                                    borderRadius: '0 3px 3px 0',
                                    cursor: maxFromInventory > 0 ? 'pointer' : 'not-allowed',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: maxFromInventory > 0 ? '0 0 8px rgba(0, 255, 136, 0.2)' : 'none',
                                    transition: 'all 0.2s ease',
                                    letterSpacing: '0.5px'
                                }}
                            >
                                MAX
                            </button>
                        </div>
                        <span className="bundle-info" style={{ fontSize: '12px', color: '#00ff88' }}>
                            ({contractCount} {contractCount === 1 ? 'contract' : 'contracts'} = {totalReward}
                            <img src={memoryShardIcon} alt="shards" className="shard-icon-small" style={{ marginLeft: '2px', marginRight: '2px' }} />
                            )
                        </span>
                        {playerItemCount > 0 && (
                            <span style={{ fontSize: '11px', color: '#ffaa00', marginLeft: '8px' }}>
                                📦 {playerItemCount} in bag
                            </span>
                        )}
                    </div>
                    <button 
                        className="accept-button"
                        onClick={() => onAccept(contract.contractId, totalItemsRequired)}
                    >
                        ACCEPT CONTRACT
                    </button>
                </div>
            )}
            
            {isAccepted && (
                <div className="contract-accepted-badge">
                    ✓ Already Accepted
                </div>
            )}
            
            {!isSeasonallyAvailable && (
                <div className="contract-out-of-season">
                    Out of Season
                </div>
            )}
        </div>
    );
};

// Player Contract Card Component
interface PlayerContractCardProps {
    playerContract: AlkPlayerContract;
    contract: AlkContract | null;
    onCancel: (playerContractId: bigint) => void;
    onDeliver: (playerContractId: bigint) => void;
    nearbyStationId: number | null;
    itemDef: ItemDefinition | null;
}

const PlayerContractCard: React.FC<PlayerContractCardProps> = ({
    playerContract,
    contract,
    onCancel,
    onDeliver,
    nearbyStationId,
    itemDef,
}) => {
    const progress = contract ? 
        (Number(playerContract.deliveredQuantity) / Number(playerContract.targetQuantity)) * 100 : 0;
    const isComplete = playerContract.status?.tag === 'Completed';
    const isFailed = playerContract.status?.tag === 'Failed';
    const isCancelled = playerContract.status?.tag === 'Cancelled';
    const isActive = playerContract.status?.tag === 'Active';
    
    // Clean item name
    const cleanItemName = (contract?.itemName || 'Unknown Item').trim();
    
    // Get item icon
    const itemIcon = useMemo(() => {
        if (itemDef?.iconAssetName) {
            return getItemIcon(itemDef.iconAssetName);
        }
        // Fallback: try to construct icon name from item name
        const itemName = cleanItemName.toLowerCase().replace(/\s+/g, '_');
        return getItemIcon(`${itemName}.png`);
    }, [itemDef, cleanItemName]);
    
    // Check if delivery is allowed at nearby station
    const canDeliverAtStation = nearbyStationId !== null && contract && (
        contract.allowedStations?.tag === 'AllStations' ||
        (contract.allowedStations?.tag === 'CompoundOnly' && nearbyStationId === 0) ||
        (contract.allowedStations?.tag === 'SubstationsOnly' && nearbyStationId > 0)
    );
    
    const potentialReward = contract ? 
        Math.floor(Number(playerContract.targetQuantity) / contract.bundleSize) * contract.shardRewardPerBundle : 0;
    
    return (
        <div className={`alk-player-contract-card ${playerContract.status?.tag?.toLowerCase() || ''}`}>
            <div className="player-contract-header">
                <div className="player-contract-item-info">
                    <img 
                        src={itemIcon} 
                        alt={cleanItemName} 
                        className="contract-item-icon"
                    />
                    <span className="contract-item-name">{cleanItemName}</span>
                </div>
                <span className={`contract-status status-${playerContract.status?.tag?.toLowerCase() || 'unknown'}`}>
                    {playerContract.status?.tag || 'Unknown'}
                </span>
            </div>
            
            <div className="player-contract-progress">
                <div className="progress-bar">
                    <div 
                        className="progress-fill" 
                        style={{ width: `${Math.min(100, progress)}%` }}
                    />
                </div>
                <div className="progress-text">
                    {Number(playerContract.deliveredQuantity)} / {Number(playerContract.targetQuantity)}
                </div>
            </div>
            
            <div className="player-contract-details">
                <div className="detail-row">
                    <span>Accepted:</span>
                    <span className="timestamp">{formatAcceptedTime(playerContract.acceptedAt)}</span>
                </div>
                <div className="detail-row">
                    <span>Expires:</span>
                    <span>Day {Number(playerContract.expiresOnDay)}</span>
                </div>
                {contract && (
                    <div className="detail-row reward">
                        <span>{isComplete ? 'Reward Collected:' : 'Potential Reward:'}</span>
                        <span className="shard-reward">
                            {potentialReward}
                            <img src={memoryShardIcon} alt="shards" className="shard-icon" />
                        </span>
                    </div>
                )}
            </div>
            
            {isActive && (
                <div className="player-contract-actions">
                    {canDeliverAtStation && Number(playerContract.deliveredQuantity) < Number(playerContract.targetQuantity) && (
                        <button 
                            className="deliver-button"
                            onClick={() => onDeliver(playerContract.id)}
                        >
                            Deliver at Station
                        </button>
                    )}
                    <button 
                        className="cancel-button"
                        onClick={() => onCancel(playerContract.id)}
                    >
                        Cancel
                    </button>
                </div>
            )}
            
            {isComplete && (
                <div className="contract-complete-badge">✓ Completed</div>
            )}
            {isFailed && (
                <div className="contract-failed-badge">✗ Failed</div>
            )}
            {isCancelled && (
                <div className="contract-cancelled-badge">⊘ Cancelled</div>
            )}
        </div>
    );
};

// Main ALK Panel Component
const AlkPanel: React.FC<AlkPanelProps> = ({
    playerIdentity,
    onClose,
    alkState,
    alkStations,
    alkContracts,
    alkPlayerContracts,
    playerShardBalance,
    worldState,
    itemDefinitions,
    inventoryItems,
}) => {
    const [activeTab, setActiveTab] = useState<AlkTab>('seasonal');
    const [nearbyStationId, setNearbyStationId] = useState<number | null>(null);
    const [isQuantityInputFocused, setIsQuantityInputFocused] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchFocused, setIsSearchFocused] = useState(false);

    const connection = useGameConnection();
    
    // Block movement keys while panel is open to prevent character movement during UI interaction
    // Also block when quantity input or search input is focused (to prevent movement while typing)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Handle Escape to close (or clear search first)
            if (e.key === 'Escape') {
                if (searchQuery && isSearchFocused) {
                    // Clear search first if focused on search
                    setSearchQuery('');
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    return;
                }
                e.preventDefault();
                e.stopImmediatePropagation();
                onClose();
                return;
            }
            // Block arrow keys from moving the player
            // Always block if any input is focused
            const isInputFocused = isQuantityInputFocused || isSearchFocused;
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                if (isInputFocused || !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
                    e.stopPropagation();
                }
            }
            // Block WASD movement keys while panel is open
            // Always block if any input is focused
            if (e.key === 'w' || e.key === 'W' || e.key === 'a' || e.key === 'A' || 
                e.key === 's' || e.key === 'S' || e.key === 'd' || e.key === 'D') {
                if (isInputFocused || !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
                    e.stopPropagation();
                }
            }
            // Block common game hotkeys (Y, G, E, etc.) when input is focused
            // to prevent tab switching or other game actions while typing
            if (isInputFocused) {
                if (e.key === 'y' || e.key === 'Y' || e.key === 'g' || e.key === 'G' ||
                    e.key === 'e' || e.key === 'E' || e.key === 'r' || e.key === 'R' ||
                    e.key === 'f' || e.key === 'F' || e.key === 'q' || e.key === 'Q' ||
                    e.key === 'Tab') {
                    e.stopPropagation();
                }
            }
        };

        // Use capture phase to intercept before game input handler
        window.addEventListener('keydown', handleKeyDown, true);
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [onClose, isQuantityInputFocused, isSearchFocused, searchQuery]);
    
    // Count Memory Shards in player's inventory (this is the real shard count)
    const inventoryShardCount = useMemo(() => {
        if (!playerIdentity || !inventoryItems || !itemDefinitions) return 0;
        
        // Find Memory Shard definition
        const memoryShardDef = Array.from(itemDefinitions.values()).find(
            def => def.name === 'Memory Shard'
        );
        if (!memoryShardDef) return 0;
        
        let total = 0;
        inventoryItems.forEach((item) => {
            // Check if owned by player and is Memory Shard
            const loc = item.location;
            if (!loc) return;
            
            let isOwned = false;
            if (loc.tag === 'Inventory' && loc.value?.ownerId?.isEqual(playerIdentity)) {
                isOwned = true;
            } else if (loc.tag === 'Hotbar' && loc.value?.ownerId?.isEqual(playerIdentity)) {
                isOwned = true;
            }
            
            if (isOwned && item.itemDefId === memoryShardDef.id) {
                total += Number(item.quantity);
            }
        });
        
        return total;
    }, [playerIdentity, inventoryItems, itemDefinitions]);
    
    // Get current season from world state or ALK state
    const currentSeason = useMemo(() => {
        if (worldState) {
            return Math.floor((Number(worldState.dayOfYear) - 1) / 90);
        }
        if (alkState) {
            return Number(alkState.seasonIndex);
        }
        return 0;
    }, [worldState, alkState]);

    // Filter contracts by type (supporting both new and legacy kind names)
    // Use string casting for forward compatibility with regenerated bindings
    const getKindTag = (kind: AlkContractKind | undefined | null): string => 
        kind && 'tag' in kind ? (kind.tag as string) : '';
    
    // Helper to filter out Memory Shard contracts (base currency cannot be traded for itself)
    const isNotMemoryShard = (c: AlkContract) => c.itemName.trim() !== 'Memory Shard';
    
    const seasonalContracts = useMemo(() => {
        return Array.from(alkContracts.values())
            .filter(c => (getKindTag(c.kind) === 'SeasonalHarvest' || getKindTag(c.kind) === 'BaseFood') && c.isActive && isNotMemoryShard(c));
    }, [alkContracts]);
    
    const materialsContracts = useMemo(() => {
        return Array.from(alkContracts.values())
            .filter(c => (getKindTag(c.kind) === 'Materials' || getKindTag(c.kind) === 'BaseIndustrial') && c.isActive && isNotMemoryShard(c));
    }, [alkContracts]);
    
    const armsContracts = useMemo(() => {
        return Array.from(alkContracts.values())
            .filter(c => getKindTag(c.kind) === 'Arms' && c.isActive && isNotMemoryShard(c));
    }, [alkContracts]);
    
    const armorContracts = useMemo(() => {
        return Array.from(alkContracts.values())
            .filter(c => getKindTag(c.kind) === 'Armor' && c.isActive && isNotMemoryShard(c));
    }, [alkContracts]);
    
    const toolsContracts = useMemo(() => {
        return Array.from(alkContracts.values())
            .filter(c => getKindTag(c.kind) === 'Tools' && c.isActive && isNotMemoryShard(c));
    }, [alkContracts]);
    
    const provisionsContracts = useMemo(() => {
        return Array.from(alkContracts.values())
            .filter(c => getKindTag(c.kind) === 'Provisions' && c.isActive && isNotMemoryShard(c));
    }, [alkContracts]);
    
    const bonusContracts = useMemo(() => {
        return Array.from(alkContracts.values())
            .filter(c => getKindTag(c.kind) === 'DailyBonus' && c.isActive && isNotMemoryShard(c));
    }, [alkContracts]);
    
    // Global search across all contracts
    const searchResults = useMemo(() => {
        if (!searchQuery.trim()) return [];
        
        const query = searchQuery.toLowerCase().trim();
        const allActiveContracts = Array.from(alkContracts.values())
            .filter(c => c.isActive && isNotMemoryShard(c));
        
        return allActiveContracts.filter(contract => {
            // Search by item name
            const itemName = contract.itemName.trim().toLowerCase();
            if (itemName.includes(query)) return true;
            
            // Search by category/kind name
            const kindName = getContractKindName(contract.kind).toLowerCase();
            if (kindName.includes(query)) return true;
            
            // Search by item definition name if available
            const itemDef = itemDefinitions.get(contract.itemDefId.toString());
            if (itemDef?.name?.toLowerCase().includes(query)) return true;
            
            return false;
        });
    }, [alkContracts, searchQuery, itemDefinitions]);
    
    // Check if search mode is active
    const isSearchActive = searchQuery.trim().length > 0;
    
    // Get player's contracts - sorted by date submitted (most recent first)
    const myContracts = useMemo(() => {
        if (!playerIdentity) return [];
        return Array.from(alkPlayerContracts.values())
            .filter(pc => pc.playerId.toHexString() === playerIdentity.toHexString())
            .sort((a, b) => {
                // Sort by acceptedAt timestamp, most recent first (descending)
                // SpacetimeDB Timestamp has microsSinceUnixEpoch property
                const timeA = (a.acceptedAt as any)?.microsSinceUnixEpoch ?? 0n;
                const timeB = (b.acceptedAt as any)?.microsSinceUnixEpoch ?? 0n;
                // Compare as bigints (descending order - newest first)
                if (timeB > timeA) return 1;
                if (timeB < timeA) return -1;
                return 0;
            });
    }, [alkPlayerContracts, playerIdentity]);
    
    // Get accepted contract IDs for this player (only ACTIVE contracts)
    // Cancelled/Completed/Failed contracts should allow re-acceptance
    const acceptedContractIds = useMemo(() => {
        return new Set(
            myContracts
                .filter(pc => pc.status?.tag === 'Active')
                .map(pc => pc.contractId.toString())
        );
    }, [myContracts]);
    
    // Handlers
    const handleAcceptContract = useCallback((contractId: bigint, quantity: number) => {
        if (!connection.connection) return;
        connection.connection.reducers.acceptAlkContract(contractId, quantity, nearbyStationId !== null ? nearbyStationId : undefined);
    }, [connection, nearbyStationId]);
    
    const handleCancelContract = useCallback((playerContractId: bigint) => {
        if (!connection.connection) return;
        connection.connection.reducers.cancelAlkContract(playerContractId);
    }, [connection]);
    
    const handleDeliverContract = useCallback((playerContractId: bigint) => {
        if (!connection.connection || nearbyStationId === null) return;
        connection.connection.reducers.deliverAlkContract(playerContractId, nearbyStationId);
    }, [connection, nearbyStationId]);
    
    // Render contracts for the active tab (or search results)
    const renderContracts = () => {
        // If search is active, show search results instead of tab content
        if (isSearchActive) {
            if (searchResults.length === 0) {
                return (
                    <div className="no-contracts">
                        <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔍</div>
                        No contracts found for "{searchQuery}"
                        <br />
                        <span style={{ fontSize: '12px', opacity: 0.7 }}>
                            Try searching for item names like "wood", "stone", "salmon", etc.
                        </span>
                    </div>
                );
            }
            
            return (
                <div className="contracts-list search-results">
                    <div className="search-results-header" style={{ 
                        padding: '8px 12px', 
                        marginBottom: '8px', 
                        color: '#00ffff',
                        fontSize: '13px',
                        borderBottom: '1px solid rgba(0, 170, 255, 0.3)'
                    }}>
                        Found {searchResults.length} contract{searchResults.length !== 1 ? 's' : ''} matching "{searchQuery}"
                    </div>
                    {searchResults.map(contract => (
                        <ContractCard
                            key={contract.contractId.toString()}
                            contract={contract}
                            itemDef={itemDefinitions.get(contract.itemDefId.toString()) || null}
                            onAccept={handleAcceptContract}
                            isAccepted={acceptedContractIds.has(contract.contractId.toString())}
                            currentSeason={currentSeason}
                            onQuantityInputFocusChange={setIsQuantityInputFocused}
                            inventoryItems={inventoryItems}
                            itemDefinitions={itemDefinitions}
                            playerIdentity={playerIdentity}
                        />
                    ))}
                </div>
            );
        }
        
        let contracts: AlkContract[] = [];
        
        switch (activeTab) {
            case 'seasonal':
                contracts = seasonalContracts;
                break;
            case 'materials':
                contracts = materialsContracts;
                break;
            case 'arms':
                contracts = armsContracts;
                break;
            case 'armor':
                contracts = armorContracts;
                break;
            case 'tools':
                contracts = toolsContracts;
                break;
            case 'provisions':
                contracts = provisionsContracts;
                break;
            case 'bonus':
                contracts = bonusContracts;
                break;
            case 'my-contracts':
                return (
                    <div className="my-contracts-list">
                        {myContracts.length === 0 ? (
                            <div className="no-contracts">
                                You haven't accepted any contracts yet.
                                <br />
                                Browse available contracts in other tabs.
                            </div>
                        ) : (
                            myContracts.map(pc => {
                                const contract = alkContracts.get(pc.contractId.toString()) || null;
                                const itemDef = contract ? itemDefinitions.get(contract.itemDefId.toString()) || null : null;
                                return (
                                    <PlayerContractCard
                                        key={pc.id.toString()}
                                        playerContract={pc}
                                        contract={contract}
                                        onCancel={handleCancelContract}
                                        onDeliver={handleDeliverContract}
                                        nearbyStationId={nearbyStationId}
                                        itemDef={itemDef}
                                    />
                                );
                            })
                        )}
                    </div>
                );
        }
        
        if (contracts.length === 0) {
            return (
                <div className="no-contracts">
                    No contracts available in this category.
                    {activeTab === 'bonus' && ' Check back later for rotating bonus contracts.'}
                </div>
            );
        }
        
        return (
            <div className="contracts-list">
                {contracts.map(contract => (
                    <ContractCard
                        key={contract.contractId.toString()}
                        contract={contract}
                        itemDef={itemDefinitions.get(contract.itemDefId.toString()) || null}
                        onAccept={handleAcceptContract}
                        isAccepted={acceptedContractIds.has(contract.contractId.toString())}
                        currentSeason={currentSeason}
                        onQuantityInputFocusChange={setIsQuantityInputFocused}
                        inventoryItems={inventoryItems}
                        itemDefinitions={itemDefinitions}
                        playerIdentity={playerIdentity}
                    />
                ))}
            </div>
        );
    };
    
    return (
        <div className="alk-panel">
            {/* CSS to hide webkit number input spinners */}
            <style>{`
                .alk-panel input[type="number"]::-webkit-outer-spin-button,
                .alk-panel input[type="number"]::-webkit-inner-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                }
            `}</style>
            {/* Header */}
            <div className="alk-header">
                <div className="alk-title">
                    <img 
                        src={alkIcon} 
                        alt="ALK" 
                        className="alk-icon"
                    />
                    <h2>ALK PROVISIONING BOARD</h2>
                </div>
                <button className="close-button" onClick={onClose}>×</button>
            </div>
            
            {/* Season & Cycle Info */}
            <div className="alk-info-bar">
                <div className="season-info">
                    <span className="label">Season:</span>
                    <span className="value">{getSeasonName(currentSeason)}</span>
                </div>
                {worldState && (
                    <div className="day-info">
                        <span className="label">Day:</span>
                        <span className="value">{Number(worldState.dayOfYear)}</span>
                    </div>
                )}
                {alkState && (
                    <div className="cycle-info">
                        <span className="label">ALK Cycle:</span>
                        <span className="value">{Number(alkState.dailyCycleIndex)}</span>
                    </div>
                )}
                <div className="shard-balance">
                    <span className="label">Shards:</span>
                    <span className="value shard-value">
                        <img src={memoryShardIcon} alt="shards" className="shard-icon" />
                        {inventoryShardCount.toLocaleString()}
                    </span>
                </div>
            </div>
            
            {/* Season Advisory */}
            <div className="season-advisory">
                {currentSeason === 0 && "🌸 Spring: Fresh produce in high demand. Scurvy grass and crowberries available."}
                {currentSeason === 1 && "☀️ Summer: Agricultural peak. Pumpkins and corn contracts active."}
                {currentSeason === 2 && "🍂 Autumn: Harvest season. Root vegetables and salmon at premium rates."}
                {currentSeason === 3 && "❄️ Winter: Preserved goods and pelts in demand. Stay warm."}
            </div>
            
            {/* Search Bar */}
            <div className="alk-search-bar" style={{
                padding: '8px 16px',
                background: 'linear-gradient(135deg, rgba(15, 25, 50, 0.8), rgba(10, 20, 40, 0.9))',
                borderBottom: '1px solid rgba(0, 170, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
            }}>
                <span style={{ color: '#00aaff', fontSize: '16px' }}>🔍</span>
                <input
                    type="text"
                    placeholder="Search contracts by item name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => setIsSearchFocused(false)}
                    style={{
                        flex: 1,
                        background: 'linear-gradient(135deg, rgba(20, 30, 60, 0.8), rgba(15, 25, 50, 0.9))',
                        border: isSearchFocused 
                            ? '2px solid rgba(0, 255, 255, 0.6)' 
                            : '2px solid rgba(0, 170, 255, 0.3)',
                        borderRadius: '4px',
                        padding: '8px 12px',
                        color: '#ffffff',
                        fontSize: '14px',
                        outline: 'none',
                        transition: 'all 0.2s ease',
                        boxShadow: isSearchFocused 
                            ? '0 0 12px rgba(0, 255, 255, 0.3), inset 0 0 8px rgba(0, 170, 255, 0.1)' 
                            : 'inset 0 0 8px rgba(0, 170, 255, 0.1)'
                    }}
                />
                {searchQuery && (
                    <button
                        onClick={() => setSearchQuery('')}
                        style={{
                            background: 'linear-gradient(135deg, rgba(255, 100, 100, 0.3), rgba(200, 50, 50, 0.4))',
                            border: '2px solid rgba(255, 100, 100, 0.4)',
                            borderRadius: '4px',
                            padding: '6px 10px',
                            color: '#ff8888',
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.2s ease'
                        }}
                        title="Clear search (Esc)"
                    >
                        ✕ Clear
                    </button>
                )}
            </div>
            
            {/* Primary Tabs - Always visible */}
            <div className="alk-primary-tabs">
                <button 
                    className={`alk-tab primary-tab my-orders-tab ${activeTab === 'my-contracts' ? 'active' : ''}`}
                    onClick={() => setActiveTab('my-contracts')}
                    title="Your accepted contracts"
                >
                    📋 MY ORDERS
                    <span className="tab-count">{myContracts.filter(c => c.status?.tag === 'Active').length}</span>
                </button>
                <button 
                    className={`alk-tab primary-tab bonus-tab ${activeTab === 'bonus' ? 'active' : ''}`}
                    onClick={() => setActiveTab('bonus')}
                    title="Time-limited bonus contracts - HIGH REWARDS!"
                >
                    ⭐ BONUS
                    <span className="tab-count bonus-count">{bonusContracts.length}</span>
                </button>
            </div>
            
            {/* Category Tabs - Browse work orders by type */}
            <div className="alk-category-tabs">
                <span className="category-label" style={{ fontSize: '12px' }}>BROWSE:</span>
                <button 
                    className={`alk-cat-tab ${activeTab === 'seasonal' ? 'active' : ''}`}
                    onClick={() => setActiveTab('seasonal')}
                    title="Plant-based items (seasonal)"
                    style={{ fontSize: '12px', padding: '10px 16px' }}
                >
                    <span style={{ fontSize: '12px', marginRight: '6px' }}>🌱</span>
                    Harvest
                    <span className="cat-count">{seasonalContracts.length}</span>
                </button>
                <button 
                    className={`alk-cat-tab ${activeTab === 'materials' ? 'active' : ''}`}
                    onClick={() => setActiveTab('materials')}
                    title="Raw materials"
                    style={{ fontSize: '12px', padding: '10px 16px' }}
                >
                    <span style={{ fontSize: '12px', marginRight: '6px' }}>📦</span>
                    Materials
                    <span className="cat-count">{materialsContracts.length}</span>
                </button>
                <button 
                    className={`alk-cat-tab ${activeTab === 'arms' ? 'active' : ''}`}
                    onClick={() => setActiveTab('arms')}
                    title="Weapons"
                    style={{ fontSize: '12px', padding: '10px 16px' }}
                >
                    <span style={{ fontSize: '12px', marginRight: '6px' }}>⚔️</span>
                    Arms
                    <span className="cat-count">{armsContracts.length}</span>
                </button>
                <button 
                    className={`alk-cat-tab ${activeTab === 'armor' ? 'active' : ''}`}
                    onClick={() => setActiveTab('armor')}
                    title="Armor"
                    style={{ fontSize: '12px', padding: '10px 16px' }}
                >
                    <span style={{ fontSize: '12px', marginRight: '6px' }}>🛡️</span>
                    Armor
                    <span className="cat-count">{armorContracts.length}</span>
                </button>
                <button 
                    className={`alk-cat-tab ${activeTab === 'tools' ? 'active' : ''}`}
                    onClick={() => setActiveTab('tools')}
                    title="Tools"
                    style={{ fontSize: '12px', padding: '10px 16px' }}
                >
                    <span style={{ fontSize: '12px', marginRight: '6px' }}>🔧</span>
                    Tools
                    <span className="cat-count">{toolsContracts.length}</span>
                </button>
                <button 
                    className={`alk-cat-tab ${activeTab === 'provisions' ? 'active' : ''}`}
                    onClick={() => setActiveTab('provisions')}
                    title="Food & medicine"
                    style={{ fontSize: '12px', padding: '10px 16px' }}
                >
                    <span style={{ fontSize: '12px', marginRight: '6px' }}>🍖</span>
                    Food
                    <span className="cat-count">{provisionsContracts.length}</span>
                </button>
            </div>
            
            {/* Main Content */}
            <div className="alk-content">
                <div className="contracts-container full-width">
                    {renderContracts()}
                </div>
            </div>
            
            {/* Footer */}
            <div className="alk-footer">
                {nearbyStationId !== null ? (
                    <div className="nearby-station-alert">
                        ✓ Ready to deliver at: {alkStations.get(nearbyStationId.toString())?.name || 'ALK Station'}
                    </div>
                ) : (
                    <div className="footer-tip">
                        💡 Deliver at Central Compound (no fee) or Substations (10% fee)
                    </div>
                )}
            </div>
        </div>
    );
};

export default AlkPanel;

