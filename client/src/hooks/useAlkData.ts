/**
 * useAlkData.ts
 * 
 * Hook for subscribing to and managing ALK (Automated Logistics Kernel) data.
 * Handles subscriptions to:
 * - ALK State (singleton)
 * - ALK Stations
 * - ALK Contracts
 * - ALK Player Contracts
 * - Player Shard Balance
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Identity } from 'spacetimedb';
import { DbConnection } from '../generated';

// ALK types will be generated after server build
// For now, define interfaces that match the server types
// These will be replaced by generated types after `spacetime generate`

export interface AlkState {
    id: number;
    worldDaySnapshot: number;
    seasonIndex: number;
    dailyCycleIndex: number;
    foodRewardMultiplier: number;
    industrialRewardMultiplier: number;
    bonusRewardMultiplier: number;
    lastRefresh: bigint; // Timestamp as bigint
}

export interface AlkStation {
    stationId: number;
    name: string;
    worldPosX: number;
    worldPosY: number;
    interactionRadius: number;
    deliveryFeeRate: number;
    isActive: boolean;
}

export interface AlkContractKind {
    tag: 'BaseFood' | 'BaseIndustrial' | 'DailyBonus';
}

export interface AlkStationAllowance {
    tag: 'CompoundOnly' | 'SubstationsOnly' | 'AllStations';
}

export interface AlkContract {
    contractId: bigint;
    kind: AlkContractKind;
    itemDefId: bigint;
    itemName: string;
    bundleSize: number;
    shardRewardPerBundle: number;
    maxPoolQuantity: number | null;
    currentPoolRemaining: number | null;
    createdOnDay: number;
    expiresOnDay: number | null;
    allowedStations: AlkStationAllowance;
    isActive: boolean;
    requiredSeason: number | null;
}

export interface AlkContractStatus {
    tag: 'Active' | 'Completed' | 'Failed' | 'Cancelled';
}

export interface AlkPlayerContract {
    id: bigint;
    playerId: Identity;
    contractId: bigint;
    acceptedOnDay: number;
    expiresOnDay: number;
    targetQuantity: number;
    deliveredQuantity: number;
    status: AlkContractStatus;
    deliveryStationId: number | null;
    acceptedAt: bigint;
    completedAt: bigint | null;
}

export interface PlayerShardBalance {
    playerId: Identity;
    balance: bigint;
    totalEarned: bigint;
    totalSpent: bigint;
    lastTransaction: bigint;
}

export interface AlkDataState {
    alkState: AlkState | null;
    alkStations: Map<string, AlkStation>;
    alkContracts: Map<string, AlkContract>;
    alkPlayerContracts: Map<string, AlkPlayerContract>;
    playerShardBalance: PlayerShardBalance | null;
    isLoading: boolean;
    nearbyStationId: number | null;
}

interface UseAlkDataOptions {
    connection: DbConnection | null;
    playerIdentity: Identity | null;
    playerPosition: { x: number; y: number } | null;
}

/**
 * Hook for ALK data subscriptions and management
 */
export function useAlkData({
    connection,
    playerIdentity,
    playerPosition,
}: UseAlkDataOptions): AlkDataState & {
    refreshContracts: () => void;
    checkStationProximity: () => void;
} {
    // State
    const [alkState, setAlkState] = useState<AlkState | null>(null);
    const [alkStations, setAlkStations] = useState<Map<string, AlkStation>>(() => new Map());
    const [alkContracts, setAlkContracts] = useState<Map<string, AlkContract>>(() => new Map());
    const [alkPlayerContracts, setAlkPlayerContracts] = useState<Map<string, AlkPlayerContract>>(() => new Map());
    const [playerShardBalance, setPlayerShardBalance] = useState<PlayerShardBalance | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [nearbyStationId, setNearbyStationId] = useState<number | null>(null);
    
    // Refs
    const subscriptionSetup = useRef(false);
    
    // Setup subscriptions when connection is available
    useEffect(() => {
        if (!connection || subscriptionSetup.current) return;
        
        // Check if ALK tables exist in the generated bindings
        const db = connection.db as any;
        
        if (!db.alkState || !db.alkStation || !db.alkContract || !db.alkPlayerContract || !db.playerShardBalance) {
            console.warn('[ALK] ALK tables not found in generated bindings. Run `spacetime generate` after building the server.');
            setIsLoading(false);
            return;
        }
        
        subscriptionSetup.current = true;
        
        // ALK State handlers
        db.alkState.onInsert((ctx: any, state: any) => {
            setAlkState(state);
        });
        db.alkState.onUpdate((ctx: any, oldState: any, newState: any) => {
            setAlkState(newState);
        });
        db.alkState.onDelete((ctx: any, state: any) => {
            setAlkState(null);
        });
        
        // ALK Stations handlers
        db.alkStation.onInsert((ctx: any, station: any) => {
            setAlkStations(prev => new Map(prev).set(station.stationId.toString(), station));
        });
        db.alkStation.onUpdate((ctx: any, oldStation: any, newStation: any) => {
            setAlkStations(prev => new Map(prev).set(newStation.stationId.toString(), newStation));
        });
        db.alkStation.onDelete((ctx: any, station: any) => {
            setAlkStations(prev => {
                const newMap = new Map(prev);
                newMap.delete(station.stationId.toString());
                return newMap;
            });
        });
        
        // ALK Contracts handlers
        db.alkContract.onInsert((ctx: any, contract: any) => {
            setAlkContracts(prev => new Map(prev).set(contract.contractId.toString(), contract));
        });
        db.alkContract.onUpdate((ctx: any, oldContract: any, newContract: any) => {
            setAlkContracts(prev => new Map(prev).set(newContract.contractId.toString(), newContract));
        });
        db.alkContract.onDelete((ctx: any, contract: any) => {
            setAlkContracts(prev => {
                const newMap = new Map(prev);
                newMap.delete(contract.contractId.toString());
                return newMap;
            });
        });
        
        // ALK Player Contracts handlers
        db.alkPlayerContract.onInsert((ctx: any, pc: any) => {
            setAlkPlayerContracts(prev => new Map(prev).set(pc.id.toString(), pc));
        });
        db.alkPlayerContract.onUpdate((ctx: any, oldPc: any, newPc: any) => {
            setAlkPlayerContracts(prev => new Map(prev).set(newPc.id.toString(), newPc));
        });
        db.alkPlayerContract.onDelete((ctx: any, pc: any) => {
            setAlkPlayerContracts(prev => {
                const newMap = new Map(prev);
                newMap.delete(pc.id.toString());
                return newMap;
            });
        });
        
        // Player Shard Balance handlers
        db.playerShardBalance.onInsert((ctx: any, balance: any) => {
            if (playerIdentity && balance.playerId.toHexString() === playerIdentity.toHexString()) {
                setPlayerShardBalance(balance);
            }
        });
        db.playerShardBalance.onUpdate((ctx: any, oldBalance: any, newBalance: any) => {
            if (playerIdentity && newBalance.playerId.toHexString() === playerIdentity.toHexString()) {
                setPlayerShardBalance(newBalance);
            }
        });
        db.playerShardBalance.onDelete((ctx: any, balance: any) => {
            if (playerIdentity && balance.playerId.toHexString() === playerIdentity.toHexString()) {
                setPlayerShardBalance(null);
            }
        });
        
        // Initial data load from existing subscriptions
        const loadInitialData = () => {
            // Load ALK state
            for (const state of db.alkState.iter()) {
                setAlkState(state);
            }
            
            // Load stations
            const stationsMap = new Map<string, AlkStation>();
            for (const station of db.alkStation.iter()) {
                stationsMap.set(station.stationId.toString(), station);
            }
            setAlkStations(stationsMap);
            
            // Load contracts
            const contractsMap = new Map<string, AlkContract>();
            for (const contract of db.alkContract.iter()) {
                contractsMap.set(contract.contractId.toString(), contract);
            }
            setAlkContracts(contractsMap);
            
            // Load player contracts
            const playerContractsMap = new Map<string, AlkPlayerContract>();
            for (const pc of db.alkPlayerContract.iter()) {
                playerContractsMap.set(pc.id.toString(), pc);
            }
            setAlkPlayerContracts(playerContractsMap);
            
            // Load player shard balance
            if (playerIdentity) {
                for (const balance of db.playerShardBalance.iter()) {
                    if (balance.playerId.toHexString() === playerIdentity.toHexString()) {
                        setPlayerShardBalance(balance);
                        break;
                    }
                }
            }
            
            setIsLoading(false);
        };
        
        // Load initial data with a small delay to ensure subscriptions are ready
        setTimeout(loadInitialData, 100);
        
    }, [connection, playerIdentity]);
    
    // Check station proximity when player position changes
    useEffect(() => {
        if (!playerPosition || alkStations.size === 0) {
            setNearbyStationId(null);
            return;
        }
        
        let nearestStationId: number | null = null;
        let nearestDistanceSq = Infinity;
        
        for (const station of alkStations.values()) {
            if (!station.isActive) continue;
            
            const dx = playerPosition.x - station.worldPosX;
            const dy = playerPosition.y - station.worldPosY;
            const distanceSq = dx * dx + dy * dy;
            const radiusSq = station.interactionRadius * station.interactionRadius;
            
            if (distanceSq <= radiusSq && distanceSq < nearestDistanceSq) {
                nearestDistanceSq = distanceSq;
                nearestStationId = station.stationId;
            }
        }
        
        setNearbyStationId(nearestStationId);
    }, [playerPosition, alkStations]);
    
    // Refresh contracts callback
    const refreshContracts = useCallback(() => {
        if (!connection) return;
        
        const reducers = connection.reducers as any;
        if (reducers.debugRefreshAlkContracts) {
            reducers.debugRefreshAlkContracts();
        }
    }, [connection]);
    
    // Check station proximity callback (for manual check)
    const checkStationProximity = useCallback(() => {
        if (!connection) return;
        
        const reducers = connection.reducers as any;
        if (reducers.checkAlkStationProximity) {
            reducers.checkAlkStationProximity();
        }
    }, [connection]);
    
    return {
        alkState,
        alkStations,
        alkContracts,
        alkPlayerContracts,
        playerShardBalance,
        isLoading,
        nearbyStationId,
        refreshContracts,
        checkStationProximity,
    };
}

export default useAlkData;

