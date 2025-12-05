/**
 * AlkDeliveryPanel.tsx
 * 
 * Panel that appears when players interact with an ALK delivery station
 * Shows active contracts and allows delivery of completed ones
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Identity } from 'spacetimedb';
import { useGameConnection } from '../contexts/GameConnectionContext';
import { getItemIcon } from '../utils/itemIconUtils';
import './AlkDeliveryPanel.css';

// Module-level flag to prevent immediate reopening after E key close
// This is shared across all instances and persists briefly after panel closes
let alkPanelJustClosed = false;
let alkPanelCloseTimeout: NodeJS.Timeout | null = null;

export function wasAlkPanelJustClosed(): boolean {
    return alkPanelJustClosed;
}

function setAlkPanelJustClosed() {
    alkPanelJustClosed = true;
    if (alkPanelCloseTimeout) {
        clearTimeout(alkPanelCloseTimeout);
    }
    // Reset flag after 200ms - enough time for keyup to fire
    alkPanelCloseTimeout = setTimeout(() => {
        alkPanelJustClosed = false;
    }, 200);
}

import {
    AlkStation,
    AlkContract,
    AlkPlayerContract,
    PlayerShardBalance,
    ItemDefinition,
    InventoryItem,
} from '../generated';

// Memory shard icon
const memoryShardIcon = getItemIcon('memory_shard.png');

interface AlkDeliveryPanelProps {
    playerIdentity: Identity | null;
    onClose: () => void;
    stationId: number;
    alkStations: Map<string, AlkStation>;
    alkContracts: Map<string, AlkContract>;
    alkPlayerContracts: Map<string, AlkPlayerContract>;
    playerShardBalance: PlayerShardBalance | null;
    itemDefinitions: Map<string, ItemDefinition>;
    inventoryItems: Map<string, InventoryItem>;
}

export const AlkDeliveryPanel: React.FC<AlkDeliveryPanelProps> = ({
    playerIdentity,
    onClose,
    stationId,
    alkStations,
    alkContracts,
    alkPlayerContracts,
    playerShardBalance,
    itemDefinitions,
    inventoryItems,
}) => {
    const { connection } = useGameConnection();
    const [deliveryStatus, setDeliveryStatus] = useState<string | null>(null);
    const [isDelivering, setIsDelivering] = useState(false);
    
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

    // Get the station details
    const station = useMemo(() => {
        return alkStations.get(stationId.toString());
    }, [alkStations, stationId]);

    // Get player's active contracts
    const activeContracts = useMemo(() => {
        if (!playerIdentity) return [];
        
        const contracts: Array<{
            playerContract: AlkPlayerContract;
            contract: AlkContract;
            itemDef: ItemDefinition | undefined;
            inventoryQty: number;
            canDeliver: boolean;
        }> = [];

        alkPlayerContracts.forEach((pc) => {
            // Only show Active contracts for this player
            if (!pc.playerId.isEqual(playerIdentity)) return;
            if (!pc.status || pc.status.tag !== 'Active') return;

            const contract = alkContracts.get(pc.contractId.toString());
            if (!contract) return;

            const itemDef = Array.from(itemDefinitions.values()).find(
                (item) => item.name === contract.itemName
            );

            // Calculate how many of this item the player has
            // Check both inventory and hotbar locations
            let inventoryQty = 0;
            inventoryItems.forEach((invItem) => {
                // Check if item is in player's inventory or hotbar
                const loc = invItem.location;
                if (!loc) return;
                
                let isOwned = false;
                if (loc.tag === 'Inventory' && loc.value?.ownerId?.isEqual(playerIdentity)) {
                    isOwned = true;
                } else if (loc.tag === 'Hotbar' && loc.value?.ownerId?.isEqual(playerIdentity)) {
                    isOwned = true;
                }
                
                if (!isOwned) return;
                
                const invItemDef = itemDefinitions.get(invItem.itemDefId.toString());
                if (invItemDef && invItemDef.name === contract.itemName) {
                    inventoryQty += Number(invItem.quantity);
                }
            });

            // Can deliver if we have at least the target quantity
            const targetQty = Number(pc.targetQuantity);
            const canDeliver = inventoryQty >= targetQty;

            contracts.push({
                playerContract: pc,
                contract,
                itemDef,
                inventoryQty,
                canDeliver,
            });
        });

        return contracts;
    }, [alkPlayerContracts, alkContracts, itemDefinitions, inventoryItems, playerIdentity]);

    // Calculate total deliverable shards
    const deliverableSummary = useMemo(() => {
        let totalGross = 0;
        let totalFee = 0;
        let deliverableCount = 0;

        activeContracts.forEach(({ playerContract, contract, canDeliver }) => {
            if (canDeliver) {
                // shardRewardPerBundle is reward for delivering the full bundle
                const gross = Number(contract.shardRewardPerBundle);
                const fee = station ? Math.floor(gross * station.deliveryFeeRate) : 0;
                totalGross += gross;
                totalFee += fee;
                deliverableCount++;
            }
        });

        return {
            totalGross,
            totalFee,
            totalNet: totalGross - totalFee,
            deliverableCount,
        };
    }, [activeContracts, station]);

    // Handle delivering a single contract
    const handleDeliver = useCallback(async (playerContractId: bigint) => {
        if (!connection?.reducers || isDelivering) return;

        setIsDelivering(true);
        setDeliveryStatus('Processing delivery...');

        try {
            connection.reducers.deliverAlkContract(playerContractId, stationId);
            setDeliveryStatus('✓ Delivery successful!');
            setTimeout(() => setDeliveryStatus(null), 2000);
        } catch (error: any) {
            setDeliveryStatus(`✗ ${error.message || 'Delivery failed'}`);
            setTimeout(() => setDeliveryStatus(null), 3000);
        } finally {
            setIsDelivering(false);
        }
    }, [connection, stationId, isDelivering]);

    // Handle delivering all ready contracts
    const handleDeliverAll = useCallback(async () => {
        if (!connection?.reducers || isDelivering || deliverableSummary.deliverableCount === 0) return;

        setIsDelivering(true);
        setDeliveryStatus('Processing deliveries...');

        let successCount = 0;
        let failCount = 0;

        for (const { playerContract, canDeliver } of activeContracts) {
            if (canDeliver) {
                try {
                    connection.reducers.deliverAlkContract(playerContract.id, stationId);
                    successCount++;
                } catch {
                    failCount++;
                }
            }
        }

        if (failCount === 0) {
            setDeliveryStatus(`✓ ${successCount} deliveries completed!`);
        } else {
            setDeliveryStatus(`${successCount} delivered, ${failCount} failed`);
        }

        setTimeout(() => setDeliveryStatus(null), 3000);
        setIsDelivering(false);
    }, [connection, stationId, isDelivering, activeContracts, deliverableSummary.deliverableCount]);

    // Handle E key to close the panel (toggle behavior)
    // Uses a module-level flag to prevent the input handler from immediately reopening
    // Also blocks arrow keys from moving the player while panel is open
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Handle Escape on keydown (feels more responsive)
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopImmediatePropagation();
                onClose();
                return;
            }
            // Block E keydown from reaching input handler while panel is open
            if (e.key === 'e' || e.key === 'E') {
                if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    // Set flag BEFORE closing so input handler knows not to reopen
                    setAlkPanelJustClosed();
                    onClose();
                }
            }
            // Block arrow keys from moving the player while panel is open
            // but allow them to work within the panel UI (e.g., input fields, scrolling)
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                // Don't block if user is in an input field - let arrows work for text navigation
                if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
                    e.stopPropagation();
                    // Don't preventDefault - allow scrolling within the panel
                }
            }
            // Also block WASD movement keys while panel is open
            if (e.key === 'w' || e.key === 'W' || e.key === 'a' || e.key === 'A' || 
                e.key === 's' || e.key === 'S' || e.key === 'd' || e.key === 'D') {
                if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
                    e.stopPropagation();
                }
            }
        };

        // Use capture phase to intercept BEFORE the input handler's bubble phase listeners
        window.addEventListener('keydown', handleKeyDown, true);
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [onClose]);

    if (!station) {
        return (
            <div className="alk-delivery-panel">
                <div className="alk-delivery-header">
                    <h2>Station Not Found</h2>
                    <button className="alk-delivery-close" onClick={onClose}>×</button>
                </div>
                <p>Unable to locate this delivery station.</p>
            </div>
        );
    }

    return (
        <div className="alk-delivery-panel">
            {/* Header */}
            <div className="alk-delivery-header">
                <div className="station-info">
                    <h2>{station.name || 'ALK STATION'}</h2>
                    {station.deliveryFeeRate > 0 && (
                        <span className="station-fee">
                            {Math.round(station.deliveryFeeRate * 100)}% Station Fee
                        </span>
                    )}
                </div>
                <button className="alk-delivery-close" onClick={onClose}>×</button>
            </div>

            {/* Status Message */}
            {deliveryStatus && (
                <div className={`delivery-status ${deliveryStatus.startsWith('✓') ? 'success' : deliveryStatus.startsWith('✗') ? 'error' : 'processing'}`}>
                    {deliveryStatus}
                </div>
            )}

            {/* Shard Balance - shows actual Memory Shards in inventory */}
            <div className="alk-delivery-balance">
                <span className="balance-label">Your Shards:</span>
                <span className="balance-value">
                    <img src={memoryShardIcon} alt="" className="shard-icon" />
                    {inventoryShardCount.toLocaleString()}
                </span>
            </div>

            {/* Contract List */}
            <div className="alk-delivery-contracts">
                <h3>Active Contracts ({activeContracts.length})</h3>
                
                {activeContracts.length === 0 ? (
                    <div className="no-contracts">
                        <p>No active contracts.</p>
                        <p className="hint">Accept contracts from the ALK Board (press G)</p>
                    </div>
                ) : (
                    <div className="contract-list">
                        {activeContracts.map(({ playerContract, contract, itemDef, inventoryQty, canDeliver }) => {
                            const targetQty = Number(playerContract.targetQuantity);
                            // shardRewardPerBundle is the reward for the entire bundle
                            const grossReward = Number(contract.shardRewardPerBundle);
                            const fee = station ? Math.floor(grossReward * station.deliveryFeeRate) : 0;
                            const netReward = grossReward - fee;
                            const progress = Math.min(100, (inventoryQty / targetQty) * 100);

                            return (
                                <div 
                                    key={playerContract.id.toString()} 
                                    className={`delivery-contract ${canDeliver ? 'ready' : 'incomplete'}`}
                                >
                                    <div className="contract-item">
                                        {itemDef?.iconAssetName && (
                                            <img 
                                                src={getItemIcon(itemDef.iconAssetName)} 
                                                alt="" 
                                                className="item-icon" 
                                            />
                                        )}
                                        <div className="item-details">
                                            <span className="item-name">{contract.itemName.trim()}</span>
                                            <span className="item-progress">
                                                {inventoryQty} / {targetQty}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="progress-bar">
                                        <div 
                                            className="progress-fill" 
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>

                                    <div className="contract-reward">
                                        <div className="reward-row">
                                            <span className="reward-label">Gross:</span>
                                            <span className="reward-value">
                                                <img src={memoryShardIcon} alt="" className="shard-icon-small" />
                                                {grossReward}
                                            </span>
                                        </div>
                                        {fee > 0 && (
                                            <div className="reward-row fee">
                                                <span className="reward-label">Fee:</span>
                                                <span className="reward-value">-{fee}</span>
                                            </div>
                                        )}
                                        <div className="reward-row net">
                                            <span className="reward-label">Net:</span>
                                            <span className="reward-value">
                                                <img src={memoryShardIcon} alt="" className="shard-icon-small" />
                                                {netReward}
                                            </span>
                                        </div>
                                    </div>

                                    <button
                                        className={`deliver-button ${canDeliver ? 'enabled' : 'disabled'}`}
                                        onClick={() => handleDeliver(playerContract.id)}
                                        disabled={!canDeliver || isDelivering}
                                    >
                                        {canDeliver ? 'DELIVER' : 'INCOMPLETE'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Deliver All Button */}
            {deliverableSummary.deliverableCount > 0 && (
                <div className="alk-delivery-footer">
                    <div className="delivery-summary">
                        <span>{deliverableSummary.deliverableCount} contract(s) ready</span>
                        <span className="summary-reward">
                            Total: <img src={memoryShardIcon} alt="" className="shard-icon" />
                            {deliverableSummary.totalNet.toLocaleString()} 
                            {deliverableSummary.totalFee > 0 && ` (after ${deliverableSummary.totalFee} fee)`}
                        </span>
                    </div>
                    <button
                        className="deliver-all-button"
                        onClick={handleDeliverAll}
                        disabled={isDelivering}
                    >
                        DELIVER ALL
                    </button>
                </div>
            )}

            {/* Instructions */}
            <div className="alk-delivery-instructions">
                <p>Deliver completed contracts to earn Memory Shards!</p>
                {station.deliveryFeeRate > 0 && station.deliveryFeeRate < 0.15 ? null : (
                    <p className="tip">💡 Central Compound has no delivery fee</p>
                )}
            </div>
        </div>
    );
};

export default AlkDeliveryPanel;

