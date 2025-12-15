/**
 * useHotLoot.ts
 * 
 * Hook for managing "hold H to hot loot" functionality.
 * When H is held and the user hovers over inventory slots, items are moved
 * in real-time with visual feedback.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { DbConnection, WoodenStorageBox, Stash, Campfire, Fumarole, BrothPot } from '../generated';
import { Identity } from 'spacetimedb';
import { DragSourceSlotInfo } from '../types/dragDropTypes';
import { PopulatedItem } from '../components/InventoryUI';
import { quickMoveToContainer, quickMoveToPlayer, QuickMoveContext } from '../utils/quickMoveUtils';

// Animation duration for the indicator (in ms)
const INDICATOR_ANIMATION_DURATION = 300; // 300ms per item
// How long to keep indicator after completion
const INDICATOR_FADE_DELAY = 200; // 200ms fade delay
// Minimum delay between processing items
const MIN_PROCESS_DELAY = 100; // 100ms between items

export interface HotLootSlotIndicator {
    slotType: DragSourceSlotInfo['type'];
    slotIndex: number | string;
    parentId?: number | bigint;
    progress: number; // 0 to 1
    startTime: number;
}

interface UseHotLootProps {
    connection: DbConnection | null;
    playerIdentity: Identity | null;
    interactingWith: { type: string; id: number | bigint } | null;
    // Container data for smart routing
    woodenStorageBoxes?: Map<string, WoodenStorageBox>;
    stashes?: Map<string, Stash>;
    campfires?: Map<string, Campfire>;
    fumaroles?: Map<string, Fumarole>;
    brothPots?: Map<string, BrothPot>;
}

interface UseHotLootReturn {
    isHotLootActive: boolean;
    indicators: Map<string, HotLootSlotIndicator>;
    isProcessing: boolean;
    handleSlotHover: (
        item: PopulatedItem | null,
        slotInfo: DragSourceSlotInfo,
        context: 'player' | 'container'
    ) => void;
    getSlotIndicator: (slotType: string, slotIndex: number | string, parentId?: number | bigint) => HotLootSlotIndicator | undefined;
    // Register current hover state for immediate trigger on H press
    setCurrentHover: (item: PopulatedItem | null, slotInfo: DragSourceSlotInfo | null, context: 'player' | 'container' | null) => void;
}

// Helper to create a unique slot key
function createSlotKey(slotType: string, slotIndex: number | string, parentId?: number | bigint): string {
    return `${slotType}-${slotIndex}${parentId !== undefined ? `-${parentId}` : ''}`;
}

export const useHotLoot = ({
    connection,
    playerIdentity,
    interactingWith,
    woodenStorageBoxes,
    stashes,
    campfires,
    fumaroles,
    brothPots,
}: UseHotLootProps): UseHotLootReturn => {
    const [isHotLootActive, setIsHotLootActive] = useState(false);
    const [indicators, setIndicators] = useState<Map<string, HotLootSlotIndicator>>(new Map());
    const [isProcessing, setIsProcessing] = useState(false);

    // Refs for stable access in callbacks
    const isHotLootActiveRef = useRef(isHotLootActive);
    const interactingWithRef = useRef(interactingWith);
    const connectionRef = useRef(connection);
    const processedSlotsRef = useRef<Set<string>>(new Set());
    const animationFrameRef = useRef<number | null>(null);
    const lastProcessTimeRef = useRef<number>(0);
    const indicatorCountRef = useRef<number>(0);
    
    // Current hover state - used to trigger on H press if already hovering
    const currentHoverRef = useRef<{
        item: PopulatedItem | null;
        slotInfo: DragSourceSlotInfo | null;
        context: 'player' | 'container' | null;
    }>({ item: null, slotInfo: null, context: null });

    // Container refs for quick move context
    const woodenStorageBoxesRef = useRef(woodenStorageBoxes);
    const stashesRef = useRef(stashes);
    const campfiresRef = useRef(campfires);
    const fumarolesRef = useRef(fumaroles);
    const brothPotsRef = useRef(brothPots);

    // Keep refs in sync
    useEffect(() => { isHotLootActiveRef.current = isHotLootActive; }, [isHotLootActive]);
    useEffect(() => { interactingWithRef.current = interactingWith; }, [interactingWith]);
    useEffect(() => { connectionRef.current = connection; }, [connection]);
    useEffect(() => { woodenStorageBoxesRef.current = woodenStorageBoxes; }, [woodenStorageBoxes]);
    useEffect(() => { stashesRef.current = stashes; }, [stashes]);
    useEffect(() => { campfiresRef.current = campfires; }, [campfires]);
    useEffect(() => { fumarolesRef.current = fumaroles; }, [fumaroles]);
    useEffect(() => { brothPotsRef.current = brothPots; }, [brothPots]);

    // Update indicator animations - runs continuously while there are indicators
    const updateIndicators = useCallback(() => {
        const now = Date.now();
        
        setIndicators(prev => {
            if (prev.size === 0) {
                indicatorCountRef.current = 0;
                return prev;
            }
            
            const updated = new Map(prev);
            let hasChanges = false;
            
            for (const [key, indicator] of updated) {
                const elapsed = now - indicator.startTime;
                const progress = Math.min(1, elapsed / INDICATOR_ANIMATION_DURATION);
                
                if (progress !== indicator.progress) {
                    updated.set(key, { ...indicator, progress });
                    hasChanges = true;
                }
                
                // Remove completed indicators after fade delay
                if (progress >= 1 && elapsed > INDICATOR_ANIMATION_DURATION + INDICATOR_FADE_DELAY) {
                    updated.delete(key);
                    hasChanges = true;
                }
            }
            
            indicatorCountRef.current = updated.size;
            return hasChanges ? updated : prev;
        });

        // Schedule next frame if there are still indicators or hot loot is active
        if (indicatorCountRef.current > 0 || isHotLootActiveRef.current) {
            animationFrameRef.current = requestAnimationFrame(updateIndicators);
        } else {
            animationFrameRef.current = null;
        }
    }, []);

    // Start/stop animation loop based on state
    useEffect(() => {
        const shouldRun = indicators.size > 0 || isHotLootActive;
        
        if (shouldRun && !animationFrameRef.current) {
            animationFrameRef.current = requestAnimationFrame(updateIndicators);
        }
        
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        };
    }, [indicators.size, isHotLootActive, updateIndicators]);

    // Process a single item immediately
    const processItem = useCallback((
        item: PopulatedItem,
        slotInfo: DragSourceSlotInfo,
        context: 'player' | 'container'
    ): boolean => {
        const conn = connectionRef.current;
        const interacting = interactingWithRef.current;

        if (!conn?.reducers) {
            console.warn('[HotLoot] No connection available');
            return false;
        }

        const itemInstanceId = BigInt(item.instance.instanceId);

        // Create quick move context with container data
        const quickMoveCtx: QuickMoveContext = {
            connection: conn,
            woodenStorageBoxes: woodenStorageBoxesRef.current,
            stashes: stashesRef.current,
            campfires: campfiresRef.current,
            fumaroles: fumarolesRef.current,
            brothPots: brothPotsRef.current,
        };

        if (context === 'player' && interacting) {
            // Moving from player inventory/hotbar TO container (depositing)
            return quickMoveToContainer(
                quickMoveCtx,
                interacting,
                itemInstanceId,
                item.definition.name
            );
        } else if (context === 'container' && slotInfo.parentId !== undefined) {
            // Moving from container TO player inventory (withdrawing)
            // Need container type, container ID, and slot index
            return quickMoveToPlayer(
                conn,
                slotInfo.type,
                slotInfo.parentId,
                Number(slotInfo.index)
            );
        }

        return false;
    }, []);

    // Execute hot loot for a specific slot
    const executeHotLoot = useCallback((
        item: PopulatedItem,
        slotInfo: DragSourceSlotInfo,
        context: 'player' | 'container',
        slotKey: string
    ) => {
        // Must have a container open to hot loot
        if (!interactingWithRef.current) {
            return;
        }

        // Mark as processed
        processedSlotsRef.current.add(slotKey);
        lastProcessTimeRef.current = Date.now();

        // Add visual indicator
        const indicator: HotLootSlotIndicator = {
            slotType: slotInfo.type,
            slotIndex: slotInfo.index,
            parentId: slotInfo.parentId,
            progress: 0,
            startTime: Date.now(),
        };

        setIndicators(prev => {
            const updated = new Map(prev);
            updated.set(slotKey, indicator);
            indicatorCountRef.current = updated.size;
            return updated;
        });

        // Process immediately
        setIsProcessing(true);
        processItem(item, slotInfo, context);

        // Brief processing state
        setTimeout(() => setIsProcessing(false), 50);
    }, [processItem]);

    // Handle slot hover - process immediately if H is held
    const handleSlotHover = useCallback((
        item: PopulatedItem | null,
        slotInfo: DragSourceSlotInfo,
        context: 'player' | 'container'
    ) => {
        // Always update current hover state (for trigger on H press)
        currentHoverRef.current = { item, slotInfo, context };

        // Only process if H is held and we have an item
        if (!isHotLootActiveRef.current || !item) {
            return;
        }

        const slotKey = createSlotKey(slotInfo.type, slotInfo.index, slotInfo.parentId);

        // Don't process same slot twice in one H hold session
        if (processedSlotsRef.current.has(slotKey)) {
            return;
        }

        // Check if we need to wait (rate limiting)
        const now = Date.now();
        const timeSinceLastProcess = now - lastProcessTimeRef.current;
        if (timeSinceLastProcess < MIN_PROCESS_DELAY) {
            // Schedule processing after delay
            setTimeout(() => {
                if (isHotLootActiveRef.current && !processedSlotsRef.current.has(slotKey)) {
                    executeHotLoot(item, slotInfo, context, slotKey);
                }
            }, MIN_PROCESS_DELAY - timeSinceLastProcess);
            return;
        }

        executeHotLoot(item, slotInfo, context, slotKey);
    }, [executeHotLoot]);

    // Set current hover state (called by DroppableSlot on mouse enter/leave)
    const setCurrentHover = useCallback((
        item: PopulatedItem | null,
        slotInfo: DragSourceSlotInfo | null,
        context: 'player' | 'container' | null
    ) => {
        currentHoverRef.current = { item, slotInfo, context };
    }, []);

    // Handle H key press/release
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code === 'KeyH' && !event.repeat) {
                // Check if user is typing in an input
                const activeElement = document.activeElement;
                const isInputFocused = activeElement && (
                    activeElement.tagName === 'INPUT' ||
                    activeElement.tagName === 'TEXTAREA' ||
                    activeElement.tagName === 'SELECT' ||
                    (activeElement as HTMLElement).isContentEditable
                );
                if (isInputFocused) return;

                // Must have a container open to use hot loot
                if (!interactingWithRef.current) {
                    return;
                }

                setIsHotLootActive(true);
                isHotLootActiveRef.current = true;
                processedSlotsRef.current.clear(); // Reset processed slots
                lastProcessTimeRef.current = 0; // Reset rate limiter
                
                // If already hovering over a slot, process it immediately
                const { item, slotInfo, context } = currentHoverRef.current;
                if (item && slotInfo && context) {
                    const slotKey = createSlotKey(slotInfo.type, slotInfo.index, slotInfo.parentId);
                    executeHotLoot(item, slotInfo, context, slotKey);
                }
            }
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.code === 'KeyH') {
                setIsHotLootActive(false);
                isHotLootActiveRef.current = false;
                processedSlotsRef.current.clear();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [executeHotLoot]);

    // Get indicator for a specific slot
    const getSlotIndicator = useCallback((
        slotType: string,
        slotIndex: number | string,
        parentId?: number | bigint
    ): HotLootSlotIndicator | undefined => {
        const key = createSlotKey(slotType, slotIndex, parentId);
        return indicators.get(key);
    }, [indicators]);

    return {
        isHotLootActive,
        indicators,
        isProcessing,
        handleSlotHover,
        getSlotIndicator,
        setCurrentHover,
    };
};
