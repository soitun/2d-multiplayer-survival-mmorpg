import { useEffect, useRef, useState, useCallback, RefObject } from 'react';
import { useLatest } from './useLatest';
import * as SpacetimeDB from '../generated';
import { DbConnection, Player, ItemDefinition, ActiveEquipment, WoodenStorageBox, Stash, PlayerCorpse } from '../generated';
import { Identity } from 'spacetimedb';
import { PlacementItemInfo, PlacementActions } from './usePlacementManager'; // Assuming usePlacementManager exports these
import { BuildingMode } from './useBuildingManager'; // ADDED: Building mode enum
import React from 'react';
import { usePlayerActions } from '../contexts/PlayerActionsContext';
import { JUMP_DURATION_MS, JUMP_HEIGHT_PX, HOLD_INTERACTION_DURATION_MS } from '../config/gameConfig'; // <<< ADDED IMPORT
import { isPlacementTooFar } from '../utils/renderers/placementRenderingUtils';
import { 
    InteractableTarget, 
    InteractionTargetType,
    isTapInteraction, 
    isHoldInteraction, 
    isInterfaceInteraction,
    getHoldDuration,
    hasSecondaryHoldAction,
    getSecondaryHoldDuration,
    getActionType,
    formatTargetForLogging,
    isTargetValid
} from '../types/interactions';
import { hasWaterContent, getWaterContent, getWaterCapacity, isWaterContainer } from '../utils/waterContainerHelpers';
import { 
    isCampfire,
    isHarvestableResource,
    isDroppedItem,
    isWoodenStorageBox,
    isStash,
    isPlayerCorpse,
    isSleepingBag,
    isKnockedOutPlayer,
    isRainCollector,
    isLantern,
    isBarrel
} from '../utils/typeGuards';
import { wasAlkPanelJustClosed } from '../components/AlkDeliveryPanel';
import { CAIRN_LORE_TIDBITS, CairnLoreEntry } from '../data/cairnLoreData';
import { playImmediateSound } from './useSoundSystem';
import { Cairn as SpacetimeDBCairn } from '../generated';
import { createCairnLoreAudio, isCairnAudioPlaying, getTotalCairnLoreCount, stopCairnLoreAudio } from '../utils/cairnAudioUtils';
import { CairnNotification } from '../components/CairnUnlockNotification';
import { registerLocalPlayerSwing } from '../utils/renderers/equippedItemRenderingUtils';

// Ensure HOLD_INTERACTION_DURATION_MS is defined locally if not already present
// If it was already defined (e.g., as `const HOLD_INTERACTION_DURATION_MS = 250;`), this won't change it.
// If it was missing, this adds it.
export const REVIVE_HOLD_DURATION_MS = 3000; // 3 seconds for reviving knocked out players

// --- Constants (Copied from GameCanvas) ---
const SWING_COOLDOWN_MS = 500;

// Define a comprehensive props interface for the hook
interface InputHandlerProps {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    connection: DbConnection | null;
    localPlayerId?: string;
    localPlayer: Player | undefined | null;
    predictedPosition: { x: number; y: number } | null; // ADDED: Client's predicted position for accurate firing
    getCurrentPositionNow: () => { x: number; y: number } | null; // ADDED: Function for exact position at firing time
    activeEquipments: Map<string, ActiveEquipment>;
    itemDefinitions: Map<string, ItemDefinition>;
    inventoryItems: Map<string, SpacetimeDB.InventoryItem>;
    rangedWeaponStats?: Map<string, SpacetimeDB.RangedWeaponStats>; // ADDED: For auto-fire detection
    placementInfo: PlacementItemInfo | null;
    placementActions: PlacementActions;
    buildingState?: { isBuilding: boolean; mode: string }; // ADDED: Building state
    buildingActions?: { startBuildingMode: (mode: BuildingMode, tier?: number, initialShape?: number) => void; attemptPlacement: (worldX: number, worldY: number) => void; cancelBuildingMode: () => void; cycleFoundationShape: (direction: 'next' | 'prev') => void; rotateTriangleShape: () => void }; // ADDED: rotateTriangleShape
    worldMousePos: { x: number | null; y: number | null };
    canvasMousePos?: { x: number | null; y: number | null }; // ADDED: Canvas mouse position for radial menu
    
    // UNIFIED INTERACTION TARGET - replaces all individual closestInteractable* props
    closestInteractableTarget: InteractableTarget | null;
    
    // Essential entity maps for validation and data lookup
    woodenStorageBoxes: Map<string, WoodenStorageBox>;
    stashes: Map<string, Stash>;
    players: Map<string, Player>;
    turrets: Map<string, any>; // ADDED: Turrets for pickup check
    cairns: Map<string, SpacetimeDBCairn>; // ADDED: Cairns for lore lookup
    playerDiscoveredCairns: Map<string, SpacetimeDB.PlayerDiscoveredCairn>; // ADDED: Player discovery tracking
    playerCorpses: Map<string, PlayerCorpse>; // ADDED: Player corpses for protection check
    
    onSetInteractingWith: (target: any | null) => void;
    addSOVAMessage?: (message: { id: string; text: string; isUser: boolean; timestamp: Date; flashTab?: boolean }) => void; // ADDED: SOVA message adder for cairn lore
    showSovaSoundBox?: (audio: HTMLAudioElement, label: string) => void; // ADDED: SOVA sound box for cairn lore audio with waveform
    onCairnNotification?: (notification: CairnNotification) => void; // ADDED: Cairn unlock notification callback
    isMinimapOpen: boolean;
    setIsMinimapOpen: React.Dispatch<React.SetStateAction<boolean>>;
    isChatting: boolean;
    isInventoryOpen: boolean;
    isGameMenuOpen: boolean;
    isSearchingCraftRecipes?: boolean;
    isFishing: boolean;
    setMusicPanelVisible: React.Dispatch<React.SetStateAction<boolean>>;
    movementDirection: { x: number; y: number };
    isAutoWalking: boolean; // Auto-walk state for dodge roll detection
    targetedFoundation: any | null; // ADDED: Targeted foundation for upgrade menu
    targetedWall: any | null; // ADDED: Targeted wall for upgrade menu
    targetedFence: any | null; // ADDED: Targeted fence for repair/demolish
}

// --- Hook Return Value Interface ---
// REMOVED inputState from here. It's now handled by useMovementInput
export interface InputHandlerState {
    // State needed for rendering or other components
    interactionProgress: InteractionProgressState | null;
    isActivelyHolding: boolean;
    currentJumpOffsetY: number; // <<< ADDED
    isAutoAttacking: boolean; // Auto-attack state
    isCrouching: boolean; // Local crouch state for immediate visual feedback
    // ADDED: Building radial menu state
    showBuildingRadialMenu: boolean;
    radialMenuMouseX: number;
    radialMenuMouseY: number;
    setShowBuildingRadialMenu: (show: boolean) => void;
    showUpgradeRadialMenu: boolean;
    setShowUpgradeRadialMenu: (show: boolean) => void;
    // Function to be called each frame by the game loop
    processInputsAndActions: () => void;
}

interface InteractionProgressState {
    targetId: number | bigint | string | null;
    targetType: InteractionTargetType;
    startTime: number;
}

// Helper function to convert direction string to vector
const getDirectionVector = (direction: string): { dx: number; dy: number } => {
    switch (direction) {
        case 'up': return { dx: 0, dy: -1 };
        case 'down': return { dx: 0, dy: 1 };
        case 'left': return { dx: -1, dy: 0 };
        case 'right': return { dx: 1, dy: 0 };
        // Handle diagonal directions from dodge rolls
        case 'up_left': return { dx: -1, dy: -1 };
        case 'up_right': return { dx: 1, dy: -1 };
        case 'down_left': return { dx: -1, dy: 1 };
        case 'down_right': return { dx: 1, dy: 1 };
        default:
            console.warn('[getDirectionVector] Unknown direction:', direction, 'defaulting to down');
            return { dx: 0, dy: 1 }; // Default to down
    }
};

export const useInputHandler = ({
    canvasRef,
    connection,
    turrets,
    localPlayerId,
    localPlayer,
    predictedPosition, // ADDED: Client's predicted position for accurate firing
    getCurrentPositionNow, // ADDED: Function for exact position at firing time
    activeEquipments,
    itemDefinitions,
    inventoryItems,
    placementInfo,
    placementActions,
    buildingState, // ADDED: Building state
    buildingActions, // ADDED: Building actions
    worldMousePos,
    
    // UNIFIED INTERACTION TARGET - single source of truth
    closestInteractableTarget,
    
    // Essential entity maps for validation
    woodenStorageBoxes,
    stashes,
    players,
    cairns, // ADDED: Cairns for lore lookup
    playerDiscoveredCairns, // ADDED: Player discovery tracking
    playerCorpses, // ADDED: Player corpses for protection check
    addSOVAMessage, // ADDED: SOVA message adder for cairn lore
    showSovaSoundBox, // ADDED: SOVA sound box for cairn lore audio with waveform
    onCairnNotification, // ADDED: Cairn unlock notification callback
    
    onSetInteractingWith,
    isMinimapOpen,
    setIsMinimapOpen,
    isChatting,
    isSearchingCraftRecipes,
    isInventoryOpen,
    isGameMenuOpen,
    isFishing,
    setMusicPanelVisible,
    movementDirection,
    isAutoWalking, // Auto-walk state for dodge roll detection
    targetedFoundation, // ADDED: Targeted foundation
    targetedWall, // ADDED: Targeted wall
    targetedFence, // ADDED: Targeted fence
    rangedWeaponStats, // ADDED: For auto-fire detection
}: InputHandlerProps): InputHandlerState => {
    // console.log('[useInputHandler IS RUNNING] isInventoryOpen:', isInventoryOpen);
    // Get player actions from the context instead of props
    const { jump } = usePlayerActions();

    // --- Client-side animation tracking ---
    const clientJumpStartTimes = useRef<Map<string, number>>(new Map());
    const lastKnownServerJumpTimes = useRef<Map<string, number>>(new Map()); // Track last known server timestamps

    // --- Internal State and Refs ---
    const [isAutoAttacking, setIsAutoAttacking] = useState(false);
    const [isCrouching, setIsCrouching] = useState(false);
    const pendingCrouchToggleRef = useRef<boolean>(false); // Track pending crouch requests
    const isAutoWalkingRef = useLatest(isAutoWalking); // Track auto-walk state for event handlers

    const keysPressed = useRef<Set<string>>(new Set());
    const isEHeldDownRef = useRef<boolean>(false);
    const isMouseDownRef = useRef<boolean>(false);
    const lastClientSwingAttemptRef = useRef<number>(0);
    const lastServerSwingTimestampRef = useRef<number>(0); // To store server-confirmed swing time
    const lastRangedFireTimeRef = useRef<number>(0); // ADDED: Track last ranged weapon fire time for auto-fire
    const eKeyDownTimestampRef = useRef<number>(0);
    const eKeyHoldTimerRef = useRef<NodeJS.Timeout | number | null>(null); // Use number for browser timeout ID
    const tapActionTriggeredOnKeyDownRef = useRef<boolean>(false); // Track if tap action was already triggered on keyDown
    const [interactionProgress, setInteractionProgress] = useState<InteractionProgressState | null>(null);
    const [isActivelyHolding, setIsActivelyHolding] = useState<boolean>(false);
    // Use ref for jump offset to avoid re-renders every frame
    const currentJumpOffsetYRef = useRef<number>(0);

    const lastMovementDirectionRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 1 });
    const movementDirectionRef = useLatest(movementDirection);

    // Refs for dependencies - using useLatest to avoid stale closures without useEffect overhead
    const placementActionsRef = useLatest(placementActions);
    const connectionRef = useLatest(connection);
    const localPlayerRef = useLatest(localPlayer);
    const predictedPositionRef = useLatest(predictedPosition); // ADDED: Ref for client's predicted position
    const getCurrentPositionNowRef = useLatest(getCurrentPositionNow); // ADDED: Ref for exact position function
    const activeEquipmentsRef = useLatest(activeEquipments);
    // UNIFIED TARGET REF - single source of truth for current interaction target
    const closestTargetRef = useLatest(closestInteractableTarget);
    const onSetInteractingWithRef = useLatest(onSetInteractingWith);
    const worldMousePosRefInternal = useLatest(worldMousePos); // Shadow prop name
    const woodenStorageBoxesRef = useLatest(woodenStorageBoxes);
    const stashesRef = useLatest(stashes);
    const playersRef = useLatest(players);
    const targetedFoundationRef = useLatest(targetedFoundation);
    const targetedWallRef = useLatest(targetedWall);
    const targetedFenceRef = useLatest(targetedFence);
    const itemDefinitionsRef = useLatest(itemDefinitions);
    const rangedWeaponStatsRef = useLatest(rangedWeaponStats); // ADDED: Ref for ranged weapon stats

    // Add after existing refs in the hook
    const isRightMouseDownRef = useRef<boolean>(false);
    
    // ADDED: Track throw aiming state (right mouse held with throwable item)
    const isAimingThrowRef = useRef<boolean>(false);
    
    // ADDED: Building radial menu state
    const [showBuildingRadialMenu, setShowBuildingRadialMenu] = useState(false);
    const [showUpgradeRadialMenu, setShowUpgradeRadialMenu] = useState(false);
    const [radialMenuMouseX, setRadialMenuMouseX] = useState(0);
    const [radialMenuMouseY, setRadialMenuMouseY] = useState(0);
    const radialMenuTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const radialMenuShownRef = useRef<boolean>(false); // Track if menu is shown to avoid clearing timeout prematurely
    const upgradeMenuFoundationIdRef = useRef<bigint | null>(null); // Store foundation ID when menu opens
    const upgradeMenuWallIdRef = useRef<bigint | null>(null); // Store wall ID when menu opens
    const upgradeMenuFenceIdRef = useRef<bigint | null>(null); // Store fence ID when menu opens

    // --- Derive input disabled state based ONLY on player death --- 
    const isPlayerDead = localPlayer?.isDead ?? false;

    // --- Effect to reset sprint state if player dies --- 
    useEffect(() => {
        // Player death no longer needs to manage sprinting here.
        // It's handled by the movement hooks.

        // Also clear E hold state if player dies
        if (localPlayer?.isDead && isEHeldDownRef.current) {
            // console.log(`[E-Timer] *** PLAYER DEATH CLEARING TIMER *** Timer ID: ${eKeyHoldTimerRef.current}`);
            isEHeldDownRef.current = false;
            if (eKeyHoldTimerRef.current) clearTimeout(eKeyHoldTimerRef.current as number);
            eKeyHoldTimerRef.current = null;
            setInteractionProgress(null);
            setIsActivelyHolding(false);
        }
        // Also clear auto-attack state if player dies
        if (localPlayer?.isDead && isAutoAttacking) {
            setIsAutoAttacking(false);
        }
        // Auto-walk removed - movement handled by usePredictedMovement
    }, [localPlayer?.isDead]); // Depend on death state and the reducer callback

    // Building refs - using useLatest to avoid stale closures
    const buildingActionsRef = useLatest(buildingActions);
    const buildingStateRef = useLatest(buildingState);

    // ADDED: Reset upgrade menu refs when menu closes
    useEffect(() => {
        if (!showUpgradeRadialMenu) {
            // Menu closed - reset all refs to allow menu to open again
            upgradeMenuFoundationIdRef.current = null;
            upgradeMenuWallIdRef.current = null;
            upgradeMenuFenceIdRef.current = null;
            radialMenuShownRef.current = false;
            // Clear any pending timeout
            if (radialMenuTimeoutRef.current) {
                clearTimeout(radialMenuTimeoutRef.current);
                radialMenuTimeoutRef.current = null;
            }
        }
    }, [showUpgradeRadialMenu]);

    // ADDED: Reset building menu refs when menu closes
    useEffect(() => {
        if (!showBuildingRadialMenu) {
            // Building menu closed - reset refs
            radialMenuShownRef.current = false;
            // Clear any pending timeout
            if (radialMenuTimeoutRef.current) {
                clearTimeout(radialMenuTimeoutRef.current);
                radialMenuTimeoutRef.current = null;
            }
        }
    }, [showBuildingRadialMenu]);

    // FIX: Play cairn_unlock sound only on actual first discovery (after server confirms)
    // Track which cairns we've already played sound for to prevent duplicates
    const playedSoundForCairnsRef = useRef<Set<bigint>>(new Set());
    
    useEffect(() => {
        if (!connection) return;
        
        const handlePlayerDiscoveredCairnInsert = (ctx: any, discovery: SpacetimeDB.PlayerDiscoveredCairn) => {
            console.log(`[Cairn INPUT HANDLER] Discovery insert received: cairnId=${discovery.cairnId}, playerIdentity=${discovery.playerIdentity?.toHexString()?.slice(0, 16)}..., localPlayerId=${localPlayerId?.slice(0, 16)}...`);
            
            // Only play sound if this is our own discovery (check player identity)
            if (!localPlayerId) {
                console.log('[Cairn INPUT HANDLER] No localPlayerId, skipping sound');
                return;
            }
            
            const discoveryPlayerId = discovery.playerIdentity?.toHexString();
            const currentPlayerId = localPlayerId;
            
            console.log(`[Cairn INPUT HANDLER] Comparing identities: discovery=${discoveryPlayerId?.slice(0, 16)}... vs current=${currentPlayerId?.slice(0, 16)}...`);
            
            // Check if this discovery is for our player
            if (discoveryPlayerId === currentPlayerId) {
                const cairnId = discovery.cairnId;
                
                // Only play sound if we haven't already played it for this cairn
                if (!playedSoundForCairnsRef.current.has(cairnId)) {
                    console.log(`[Cairn INPUT HANDLER] ✓ First discovery confirmed! Playing cairn_unlock sound for cairn ${cairnId}`);
                    playImmediateSound('cairn_unlock');
                    playedSoundForCairnsRef.current.add(cairnId);
                } else {
                    console.log(`[Cairn INPUT HANDLER] Sound already played for cairn ${cairnId}`);
                }
            } else {
                console.log('[Cairn INPUT HANDLER] Discovery is for another player, skipping sound');
            }
        };
        
        // Register callback for PlayerDiscoveredCairn inserts
        connection.db.playerDiscoveredCairn.onInsert(handlePlayerDiscoveredCairnInsert);
        
        return () => {
            connection.db.playerDiscoveredCairn.removeOnInsert(handlePlayerDiscoveredCairnInsert);
        };
    }, [connection, localPlayerId]);

    // ADDED: Clear radial menu state when building mode ends (switching tools)
    useEffect(() => {
        if (!buildingState?.isBuilding) {
            // Building mode ended - clear all radial menu state
            radialMenuShownRef.current = false;
            setShowBuildingRadialMenu(false);
            if (radialMenuTimeoutRef.current) {
                clearTimeout(radialMenuTimeoutRef.current);
                radialMenuTimeoutRef.current = null;
            }
        }
    }, [buildingState?.isBuilding]);

    // Synchronize local crouch state with server state to prevent desync
    // Don't override optimistic state while pending requests are in flight
    useEffect(() => {
        if (localPlayer?.isCrouching !== undefined && !pendingCrouchToggleRef.current) {
            setIsCrouching(localPlayer.isCrouching);
        }
    }, [localPlayer?.isCrouching]);

    // Jump offset calculation is now handled directly in processInputsAndActions
    // to avoid React re-renders every frame

    // --- Timer Management Functions (Outside of useEffect to avoid cleanup issues) ---
    const startHoldTimer = useCallback((holdTarget: InteractionProgressState, connection: DbConnection) => {
        // Calculate duration based on target type using helper functions
        const currentTarget = closestTargetRef.current;
        const duration = currentTarget && holdTarget.targetType === 'knocked_out_player' ? 
            getHoldDuration(currentTarget) : 
            currentTarget && hasSecondaryHoldAction(currentTarget) ? 
                getSecondaryHoldDuration(currentTarget) : 
                HOLD_INTERACTION_DURATION_MS;

        console.log(`[E-Timer] Setting up timer for ${duration}ms - holdTarget:`, holdTarget);
        const timerId = setTimeout(() => {
            try {
                // console.log(`[E-Timer] *** TIMER FIRED *** after ${duration}ms for:`, holdTarget);
                // Timer fired, so this is a successful HOLD action.
                // Re-check if we are still close to the original target using unified system
                const currentTarget = closestTargetRef.current;
                console.log(`[E-Timer] Current target check:`, currentTarget ? formatTargetForLogging(currentTarget) : 'null');

                let actionTaken = false;

                // Validate that we still have the same target
                const targetStillValid = currentTarget && 
                    currentTarget.type === holdTarget.targetType && 
                    currentTarget.id === holdTarget.targetId &&
                    isTargetValid(currentTarget);

                if (targetStillValid) {
                    switch (holdTarget.targetType) {
                        case 'knocked_out_player':
                            console.log('[E-Hold ACTION] Attempting to revive player:', holdTarget.targetId);
                            connection.reducers.reviveKnockedOutPlayer(Identity.fromString(holdTarget.targetId as string));
                            actionTaken = true;
                            break;
                        case 'water':
                            console.log('[E-Hold ACTION] Attempting to drink water');
                            connection.reducers.drinkWater();
                            actionTaken = true;
                            break;
                        case 'campfire':
                            console.log('[E-Hold ACTION] Attempting to toggle campfire burning:', holdTarget.targetId);
                            connection.reducers.toggleCampfireBurning(Number(holdTarget.targetId));
                            actionTaken = true;
                            break;
                        case 'furnace':
                            console.log('[E-Hold ACTION] Attempting to toggle furnace burning:', holdTarget.targetId);
                            connection.reducers.toggleFurnaceBurning(Number(holdTarget.targetId));
                            actionTaken = true;
                            break;
                        case 'barbecue':
                            console.log('[E-Hold ACTION] Attempting to toggle barbecue burning:', holdTarget.targetId);
                            connection.reducers.toggleBarbecueBurning(Number(holdTarget.targetId));
                            actionTaken = true;
                            break;
                        case 'turret' as InteractionTargetType:
                            // Check if turret is empty (no ammo) and not a monument turret
                            const turret = turrets?.get(String(holdTarget.targetId));
                            if (turret && !turret.ammoInstanceId && !turret.isMonument) {
                                console.log('[E-Hold ACTION] Attempting to pickup empty turret:', holdTarget.targetId);
                                connection.reducers.pickupTurret(Number(holdTarget.targetId));
                                actionTaken = true;
                            }
                            break;
                        case 'lantern':
                            if (currentTarget.data?.isEmpty) {
                                console.log('[E-Hold ACTION] Attempting to pickup empty lantern:', holdTarget.targetId);
                                connection.reducers.pickupLantern(Number(holdTarget.targetId));
                                actionTaken = true;
                            } else {
                                console.log('[E-Hold ACTION] Attempting to toggle lantern burning:', holdTarget.targetId);
                                connection.reducers.toggleLantern(Number(holdTarget.targetId));
                                actionTaken = true;
                            }
                            break;
                        case 'box':
                            if (currentTarget.data?.isEmpty) {
                                console.log('[E-Hold ACTION] Attempting to pickup storage box:', holdTarget.targetId);
                                connection.reducers.pickupStorageBox(Number(holdTarget.targetId));
                                actionTaken = true;
                            } else {
                                console.log('[E-Hold FAILED] Storage box is no longer empty');
                            }
                            break;
                        case 'stash':
                            console.log('[E-Hold ACTION] Attempting to toggle stash visibility:', holdTarget.targetId);
                            connection.reducers.toggleStashVisibility(Number(holdTarget.targetId));
                            actionTaken = true;
                            break;
                        case 'homestead_hearth':
                            console.log('[E-Hold ACTION] Attempting to grant building privilege from hearth:', holdTarget.targetId);
                            connection.reducers.grantBuildingPrivilegeFromHearth(Number(holdTarget.targetId));
                            actionTaken = true;
                            break;
                        case 'door':
                            // Pickup door (owner only - server validates)
                            console.log('[E-Hold ACTION] Attempting to pickup door:', holdTarget.targetId);
                            connection.reducers.pickupDoor(holdTarget.targetId as bigint);
                            actionTaken = true;
                            break;
                        default:
                            console.log('[E-Hold FAILED] Unknown target type:', holdTarget.targetType);
                    }
                } else {
                    console.log('[E-Hold FAILED] Target no longer valid. Expected:', holdTarget.targetType, holdTarget.targetId, 'Current:', currentTarget ? formatTargetForLogging(currentTarget) : 'null');
                }

                // Clean up UI and state
                // console.log(`[E-Timer] *** TIMER COMPLETE *** Action taken:`, actionTaken);
                setInteractionProgress(null);
                setIsActivelyHolding(false);
                isEHeldDownRef.current = false; // Reset the master hold flag
                eKeyHoldTimerRef.current = null; // Clear the timer ref itself
            } catch (error) {
                // console.error(`[E-Timer] ERROR in timer callback:`, error);
                // Clean up state even if there was an error
                setInteractionProgress(null);
                setIsActivelyHolding(false);
                isEHeldDownRef.current = false;
                eKeyHoldTimerRef.current = null;
            }
        }, duration);

        eKeyHoldTimerRef.current = timerId;
        // console.log(`[E-Timer] Timer assigned to ref. Timer ID:`, timerId);

        // Debug: Check if timer ref gets cleared unexpectedly
        setTimeout(() => {
            if (eKeyHoldTimerRef.current === null) {
                // console.log(`[E-Timer] *** TIMER REF WAS CLEARED *** Timer ${timerId} ref became null before 250ms!`);
            } else if (eKeyHoldTimerRef.current !== timerId) {
                // console.log(`[E-Timer] *** TIMER REF CHANGED *** Timer ${timerId} ref is now:`, eKeyHoldTimerRef.current);
            } else {
                // console.log(`[E-Timer] Timer ${timerId} ref still valid at 100ms checkpoint`);
            }
        }, 100);
    }, []);

    const clearHoldTimer = useCallback(() => {
        if (eKeyHoldTimerRef.current) {
            // console.log(`[E-Timer] Clearing timer manually. Timer ID:`, eKeyHoldTimerRef.current);
            clearTimeout(eKeyHoldTimerRef.current as number);
            eKeyHoldTimerRef.current = null;
        }
    }, []);

    // --- Attempt Swing Function (extracted from canvas click logic) ---
    const attemptSwing = useCallback(() => {
        // 🎣 FISHING INPUT FIX: Disable weapon swinging while fishing
        if (isFishing) {
            console.log('[Input] Swing blocked - player is fishing');
            return;
        }
        
        if (!connectionRef.current?.reducers || !localPlayerId) return;

        const localEquipment = activeEquipmentsRef.current?.get(localPlayerId);
        const itemDef = itemDefinitionsRef.current?.get(String(localEquipment?.equippedItemDefId));

        if (!localEquipment || localEquipment.equippedItemDefId === null || localEquipment.equippedItemInstanceId === null) {
            // Unarmed
            const nowUnarmed = Date.now();
            if (nowUnarmed - lastClientSwingAttemptRef.current < SWING_COOLDOWN_MS) return;
            if (nowUnarmed - Number(localEquipment?.swingStartTimeMs || 0) < SWING_COOLDOWN_MS) return;
            try {
                // 🎬 CLIENT-AUTHORITATIVE ANIMATION: Register swing immediately for smooth visuals
                registerLocalPlayerSwing();
                // 🔊 IMMEDIATE SOUND: Play weapon swing sound for instant feedback
                // playWeaponSwingSound(0.8);
                connectionRef.current.reducers.useEquippedItem();
                lastClientSwingAttemptRef.current = nowUnarmed;
                lastServerSwingTimestampRef.current = nowUnarmed;
            } catch (err) {
                console.error("[attemptSwing Unarmed] Error calling useEquippedItem reducer:", err);
            }
        } else {
            // Armed (melee/tool)
            if (!itemDef) return;
            if (itemDef.name === "Bandage" || itemDef.name === "Selo Olive Oil" || itemDef.name === "Hunting Bow" || itemDef.category === SpacetimeDB.ItemCategory.RangedWeapon) {
                // Ranged/Bandage/Selo Olive Oil should not be triggered by swing
                return;
            }
            const now = Date.now();
            const attackIntervalMs = itemDef.attackIntervalSecs ? itemDef.attackIntervalSecs * 1000 : SWING_COOLDOWN_MS;
            if (now - lastServerSwingTimestampRef.current < attackIntervalMs) return;
            if (now - lastClientSwingAttemptRef.current < attackIntervalMs) return;
            if (now - Number(localEquipment.swingStartTimeMs) < attackIntervalMs) return;
            try {
                // 🎬 CLIENT-AUTHORITATIVE ANIMATION: Register swing immediately for smooth visuals
                registerLocalPlayerSwing();
                // 🔊 IMMEDIATE SOUND: Only play generic swing for non-resource tools
                const activeItem = activeEquipmentsRef.current.get(localPlayerId || '');
                const itemDef = itemDefinitionsRef.current.get(activeItem?.equippedItemDefId?.toString() || '');
                
                // Don't play immediate sounds for resource gathering tools - let server handle those
                const isResourceTool = itemDef?.name && (
                    itemDef.name.toLowerCase().includes('hatchet') || 
                    itemDef.name.toLowerCase().includes('axe') ||
                    itemDef.name.toLowerCase().includes('pickaxe') ||
                    itemDef.name.toLowerCase().includes('pick')
                );
                
                if (!isResourceTool) {
                    // Play immediate sound for combat weapons and other tools
                    // playWeaponSwingSound(0.8);
                }
                connectionRef.current.reducers.useEquippedItem();
                lastClientSwingAttemptRef.current = now;
                lastServerSwingTimestampRef.current = now;
            } catch (err) {
                console.error("[attemptSwing Armed] Error calling useEquippedItem reducer:", err);
            }
        }
    }, [localPlayerId, isFishing]); // 🎣 FISHING INPUT FIX: Add isFishing dependency

    // --- Input Event Handlers ---
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const key = event.key.toLowerCase();
            
            // Enhanced chat input detection to prevent race conditions
            const target = event.target as Element;
            const activeElement = document.activeElement as Element;
            
            // Check if ANY input is currently focused (either event target or active element)
            const isChatInputFocused = target?.getAttribute('data-is-chat-input') === 'true' || 
                                     target?.closest('[data-is-chat-input="true"]') !== null ||
                                     target?.tagName === 'INPUT' ||
                                     target?.tagName === 'TEXTAREA' ||
                                     activeElement?.getAttribute('data-is-chat-input') === 'true' ||
                                     activeElement?.tagName === 'INPUT' ||
                                     activeElement?.tagName === 'TEXTAREA';
            
            const isUIFocused = isChatting || isGameMenuOpen || !!isSearchingCraftRecipes || isChatInputFocused;
            
            if (isUIFocused) {
                console.log('[InputHandler] Input blocked - UI focused:', { 
                    key,
                    isChatting, 
                    isGameMenuOpen, 
                    isSearchingCraftRecipes, 
                    isChatInputFocused,
                    targetTag: target?.tagName,
                    targetDataAttr: target?.getAttribute('data-is-chat-input'),
                    activeElement: document.activeElement?.tagName,
                    activeElementDataAttr: document.activeElement?.getAttribute('data-is-chat-input')
                });
                
                // If user is trying to use space but chat input is blocking, try to clear focus
                // Note: Removed F key from this check as it interferes with typing 'f' in inputs
                // Skip clearing if the input explicitly allows spacebar (e.g., matronage name input)
                const allowsSpacebar = target?.getAttribute('data-allow-spacebar') === 'true' ||
                    document.activeElement?.getAttribute('data-allow-spacebar') === 'true';
                if (key === ' ' && isChatInputFocused && !isChatting && !isSearchingCraftRecipes && !allowsSpacebar) {
                    console.log('[InputHandler] Attempting to clear stuck chat input focus');
                    forceClearInputFocus();
                }
                
                return;
            }

            // This block prevents non-essential game actions from firing while inventory/map is open
            const allowedKeysInUI = ['i', 'tab', 'escape', 'm', 'g']; // 'g' is now allowed
            if ((isInventoryOpen || isMinimapOpen) && !allowedKeysInUI.includes(key)) {
                return;
            }

            // Handle toggles first, as they should work even if other conditions fail
            if (!event.repeat) {
                switch (key) {
                    case 'z':
                        setIsAutoAttacking(prev => {
                            const newState = !prev;
                            if (newState) {
                                // Trigger immediate swing when enabling auto-attack
                                setTimeout(() => attemptSwing(), 0);
                            }
                            return newState;
                        });
                        return; // Handled
                    case 'c':
                        // Check if player is on water before allowing crouch toggle
                        if (localPlayerRef.current?.isOnWater) {
                            console.log('[Input] Crouch blocked - player is on water');
                            return; // Don't allow crouching on water
                        }
                        setIsCrouching(prev => {
                            pendingCrouchToggleRef.current = true; // Mark as pending
                            connectionRef.current?.reducers.toggleCrouch();
                            // Clear pending flag after a brief delay (server should respond by then)
                            setTimeout(() => {
                                pendingCrouchToggleRef.current = false;
                            }, 200); // 200ms should be enough for server response
                            return !prev;
                        });
                        return; // Handled
                    // NOTE: 'g' key for map is now handled in GameScreen.tsx 
                    // to properly manage interfaceInitialView (always opens to map)
                    case 'm': // Handle music panel toggle here
                        setMusicPanelVisible(prev => !prev);
                        event.preventDefault(); // Prevent typing 'm' in chat etc.
                        console.log('[M-Key] Toggled music control panel');
                        return;
                    case 'r': // ADDED: Rotate triangle foundation shape
                        if (buildingStateRef.current?.isBuilding && buildingActionsRef.current) {
                            event.preventDefault();
                            // Only rotate triangle foundation shapes (fences use dynamic edge detection like walls)
                            if (buildingStateRef.current.mode !== 'fence') {
                                buildingActionsRef.current.rotateTriangleShape();
                                console.log('[R-Key] Rotated triangle foundation shape');
                            }
                        }
                        return;
                }
            }

            // Placement cancellation (checked before general input disabled)
            if (key === 'escape' && placementInfo) {
                placementActionsRef.current?.cancelPlacement();
                return;
            }

            // Movement keys are now handled by useMovementInput hook
            // Only handle non-movement keys here to avoid conflicts

            // Spacebar Handler (Jump or Dodge Roll)
            if (key === ' ' && !event.repeat) {
                // 🎣 FISHING INPUT FIX: Disable jumping while fishing
                if (isFishing) {
                    console.log('[Input] Jump blocked - player is fishing');
                    event.preventDefault();
                    event.stopPropagation(); // 🎣 FISHING INPUT FIX: Stop event from reaching other handlers
                    event.stopImmediatePropagation(); // 🎣 FISHING INPUT FIX: Stop all other listeners
                    return;
                }
                
                // Don't trigger actions when game menus are open
                if (isGameMenuOpen) {
                    return; // Let menus handle spacebar for scrolling
                }

                // Don't trigger actions when in menu components (to prevent interfering with scrolling)
                const target = event.target as Element;
                if (target) {
                    // Check if target or active element has data-allow-spacebar attribute (for search inputs)
                    const allowsSpacebar = target.getAttribute('data-allow-spacebar') === 'true' ||
                        document.activeElement?.getAttribute('data-allow-spacebar') === 'true';
                    if (allowsSpacebar) {
                        return; // Let the input handle spacebar for typing
                    }
                    
                    const isInMenu = target.closest('[data-scrollable-region]') ||
                        target.closest('.menuContainer') ||
                        target.closest('[style*="zIndex: 2000"]') ||
                        target.closest('[style*="z-index: 2000"]') ||
                        document.querySelector('[style*="zIndex: 2000"]') ||
                        document.querySelector('[style*="z-index: 2000"]');
                    if (isInMenu) {
                        return; // Let the menu handle spacebar for scrolling
                    }
                }

                if (localPlayerRef.current && !localPlayerRef.current.isDead && !localPlayerRef.current.isKnockedOut) {
                    event.preventDefault(); // Prevent spacebar from scrolling the page

                    // Check if player is moving (either via keyboard input or auto-walk)
                    const moveX = movementDirectionRef.current.x;
                    const moveY = movementDirectionRef.current.y;
                    const isMoving = Math.abs(moveX) > 0.01 || Math.abs(moveY) > 0.01 || isAutoWalkingRef.current;

                    if (isMoving) {
                        // Dodge Roll (works with both manual movement and auto-walk)
                        try {
                            if (connectionRef.current?.reducers) {
                                connectionRef.current.reducers.dodgeRoll(moveX, moveY);
                                console.log('[Input] Dodge roll triggered', { direction: { x: moveX, y: moveY }, isAutoWalking: isAutoWalkingRef.current });
                            }
                        } catch (err) {
                            console.error("[InputHandler] Error calling dodgeRoll:", err);
                        }
                    } else {
                        // Jump (only when truly stationary - no manual input AND no auto-walk)
                        try {
                            jump();
                            console.log('[Input] Jump triggered (stationary)');
                        } catch (err) {
                            console.error("[InputHandler] Error calling jump:", err);
                        }
                    }
                }
            }

            // Multi-function key ('f'): Water container filling + Headlamp toggle
            if (key === 'f' && !event.repeat) {
                if (isPlayerDead) return;
                
                let handledWaterFilling = false;
                let handledHeadlampToggle = false;
                
                // === WATER CONTAINER FILLING (equipped item) ===
                const localPlayerActiveEquipment = activeEquipmentsRef.current?.get(localPlayerId || '');
                if (localPlayerActiveEquipment?.equippedItemInstanceId && localPlayerActiveEquipment?.equippedItemDefId) {
                    const equippedItemDef = itemDefinitionsRef.current?.get(localPlayerActiveEquipment.equippedItemDefId.toString());
                    
                    if (equippedItemDef && isWaterContainer(equippedItemDef.name)) {
                        // Get the water container item
                        const waterContainer = inventoryItems.get(localPlayerActiveEquipment.equippedItemInstanceId.toString());
                        
                        if (waterContainer && connectionRef.current?.reducers && localPlayerRef.current?.isOnWater) {
                            console.log('[F-Key] Player is on water - attempting to fill container');
                            
                            // TODO: Add salt water detection when implemented
                            const isOnSaltWater = false; // Placeholder - all water is fresh for now
                            
                            if (!isOnSaltWater) {
                                // Calculate remaining capacity using helper functions
                                const currentWaterContent = getWaterContent(waterContainer) || 0; // in liters
                                const maxCapacityLiters = getWaterCapacity(equippedItemDef.name); // in liters
                                const remainingCapacityMl = Math.floor((maxCapacityLiters - currentWaterContent) * 1000); // Convert L to mL

                                console.log(`[F-Key] Current water: ${currentWaterContent}L, Max: ${maxCapacityLiters}L, Remaining: ${remainingCapacityMl}mL`);

                                if (remainingCapacityMl > 0) {
                                    const fillAmount = Math.min(250, remainingCapacityMl); // Fill 250mL or remaining capacity
                                    console.log(`[F-Key] Attempting to fill ${equippedItemDef.name} with ${fillAmount}mL from fresh water source`);

                                    try {
                                        connectionRef.current.reducers.fillWaterContainerFromNaturalSource(
                                            localPlayerActiveEquipment.equippedItemInstanceId, 
                                            fillAmount
                                        );
                                        console.log(`[F-Key] Successfully called fillWaterContainerFromNaturalSource`);
                                        handledWaterFilling = true;
                                    } catch (err) {
                                        console.error('[F-Key] Error filling water container:', err);
                                    }
                                } else {
                                    console.log('[F-Key] Water container is already full');
                                }
                            } else {
                                console.log('[F-Key] Cannot fill water container from salt water source');
                            }
                        }
                    }
                }
                
                // === HEADLAMP / SNORKEL TOGGLE (head armor slot) ===
                // Check if player has a headlamp or snorkel equipped in head armor slot
                let handledSnorkelToggle = false;
                const activeArmor = activeEquipmentsRef.current?.get(localPlayerId || '');
                if (activeArmor?.headItemInstanceId && connectionRef.current?.reducers) {
                    // Get the head armor item
                    const headItem = inventoryItems.get(activeArmor.headItemInstanceId.toString());
                    if (headItem) {
                        const headItemDef = itemDefinitionsRef.current?.get(headItem.itemDefId.toString());
                        if (headItemDef) {
                            // Check for Headlamp
                            if (headItemDef.name === 'Headlamp') {
                                console.log('[F-Key] Toggling headlamp');
                                try {
                                    connectionRef.current.reducers.toggleHeadlamp();
                                    console.log('[F-Key] Successfully called toggleHeadlamp');
                                    handledHeadlampToggle = true;
                                } catch (err) {
                                    console.error('[F-Key] Error toggling headlamp:', err);
                                }
                            }
                            // Check for Snorkel (must be on water to toggle)
                            else if (headItemDef.name === 'Reed Diver\'s Helm') {
                                if (localPlayerRef.current?.isOnWater) {
                                    // Check if we're about to go UNDERWATER (toggling snorkel ON)
                                    const isCurrentlySnorkeling = localPlayerRef.current?.isSnorkeling ?? false;
                                    
                                    // If going underwater and torch is equipped, unequip it first for seamless transition
                                    if (!isCurrentlySnorkeling && localPlayerId) {
                                        const localPlayerActiveEquip = activeEquipmentsRef.current?.get(localPlayerId);
                                        if (localPlayerActiveEquip?.equippedItemDefId) {
                                            const equippedDef = itemDefinitionsRef.current?.get(localPlayerActiveEquip.equippedItemDefId.toString());
                                            if (equippedDef?.name === 'Torch') {
                                                console.log('[F-Key] Unequipping torch before going underwater for seamless transition');
                                                try {
                                                    // Use Identity.fromString to convert localPlayerId to proper Identity type
                                                    const playerIdentity = Identity.fromString(localPlayerId);
                                                    connectionRef.current.reducers.clearActiveItemReducer(playerIdentity);
                                                } catch (err) {
                                                    console.error('[F-Key] Error unequipping torch:', err);
                                                }
                                            }
                                        }
                                    }
                                    
                                    console.log('[F-Key] Toggling snorkel (player is on water)');
                                    try {
                                        connectionRef.current.reducers.toggleSnorkel();
                                        console.log('[F-Key] Successfully called toggleSnorkel');
                                        handledSnorkelToggle = true;
                                    } catch (err) {
                                        console.error('[F-Key] Error toggling snorkel:', err);
                                    }
                                } else {
                                    console.log('[F-Key] Cannot toggle snorkel - player is not on water');
                                }
                            }
                        }
                    }
                }
                
                // Log if no action was taken
                if (!handledWaterFilling && !handledHeadlampToggle && !handledSnorkelToggle) {
                    console.log('[F-Key] No applicable action - no water container on water, no headlamp, or no snorkel on water');
                }
                
                return;
            }


            // Interaction key ('e')
            if (key === 'e' && !event.repeat && !isEHeldDownRef.current) {
                isEHeldDownRef.current = true;
                eKeyDownTimestampRef.current = Date.now();

                const currentConnection = connectionRef.current;
                if (!currentConnection?.reducers) return;

                const currentTarget = closestTargetRef.current;
                console.log('[E-KeyDown] Current target:', currentTarget ? formatTargetForLogging(currentTarget) : 'null');

                // Set up a timer for ANY potential hold action.
                // The keyUp handler will decide if it was a tap or a hold.

                // Determine if current target supports hold actions
                let holdTarget: InteractionProgressState | null = null;
                
                if (currentTarget && isTargetValid(currentTarget)) {
                    console.log('[E-KeyDown] Valid target found:', formatTargetForLogging(currentTarget));
                    
                    // Check for hold-first targets (highest priority)
                    if (isHoldInteraction(currentTarget)) {
                        holdTarget = { 
                            targetId: currentTarget.id, 
                            targetType: currentTarget.type,
                            startTime: eKeyDownTimestampRef.current 
                        };
                        console.log('[E-KeyDown] Setting up primary hold target:', holdTarget);
                    } 
                    // Check for secondary hold actions (interface targets that also support hold)
                    else if (hasSecondaryHoldAction(currentTarget)) {
                        holdTarget = { 
                            targetId: currentTarget.id, 
                            targetType: currentTarget.type,
                            startTime: eKeyDownTimestampRef.current 
                        };
                        console.log('[E-KeyDown] Setting up secondary hold target:', holdTarget, 'isEmpty:', currentTarget.data?.isEmpty);
                    }
                    // If no hold action is available, trigger tap action immediately for instant responsiveness
                    else if (isTapInteraction(currentTarget)) {
                        console.log('[E-KeyDown] Immediate tap interaction:', getActionType(currentTarget));
                        // Trigger tap action immediately for vegetables, dropped items, cairns, etc.
                        tapActionTriggeredOnKeyDownRef.current = true; // Mark that we've triggered the action
                        switch (currentTarget.type) {
                            case 'harvestable_resource':
                                const resourceId = currentTarget.id as bigint;
                                console.log('[E-KeyDown] Immediate harvest:', resourceId);
                                currentConnection.reducers.interactWithHarvestableResource(resourceId);
                                break;
                            case 'dropped_item':
                                console.log('[E-KeyDown] Immediate pickup:', currentTarget.id);
                                currentConnection.reducers.pickupDroppedItem(currentTarget.id as bigint);
                                break;
                            case 'cairn':
                                // Interact with cairn: call reducer, play audio, show lore text in SOVA chat
                                if (typeof currentTarget.id === 'bigint') {
                                    const cairnId = currentTarget.id;
                                    const cairn = cairns?.get(String(cairnId));
                                    
                                    console.log(`[Cairn] KeyDown interaction - cairnId: ${cairnId}, cairn found: ${!!cairn}`);
                                    
                                    if (cairn) {
                                        // If audio is already playing, stop it first so we can restart
                                        if (isCairnAudioPlaying()) {
                                            console.log('[Cairn] Audio already playing, stopping to restart');
                                            stopCairnLoreAudio();
                                        }
                                        
                                        // Check if this is the first time THIS PLAYER is discovering this cairn
                                        // Must filter by player identity since playerDiscoveredCairns contains ALL players' discoveries
                                        const isFirstDiscovery = !Array.from(playerDiscoveredCairns?.values() || [])
                                            .some(discovery => 
                                                discovery.playerIdentity?.toHexString() === localPlayerId &&
                                                discovery.cairnId === cairnId
                                            );
                                        console.log(`[Cairn] isFirstDiscovery check: localPlayerId=${localPlayerId?.slice(0, 16)}, cairnId=${cairnId}, result=${isFirstDiscovery}`);
                                        
                                        // Find the lore entry
                                        const loreEntry = CAIRN_LORE_TIDBITS.find(entry => entry.id === cairn.loreId);
                                        console.log(`[Cairn] Found lore entry for cairn ${cairnId}:`, loreEntry?.id, loreEntry?.index, 'isFirstDiscovery:', isFirstDiscovery);
                                        
                                        // Calculate discovery count for THIS PLAYER only
                                        const currentDiscoveryCount = Array.from(playerDiscoveredCairns?.values() || [])
                                            .filter(d => d.playerIdentity?.toHexString() === localPlayerId).length;
                                        const newDiscoveryCount = isFirstDiscovery ? currentDiscoveryCount + 1 : currentDiscoveryCount;
                                        const totalCairns = getTotalCairnLoreCount();
                                        
                                        // Call the reducer
                                        try {
                                            currentConnection.reducers.interactWithCairn(cairnId);
                                            console.log(`[Cairn] Reducer called for cairn ${cairnId}`);
                                            
                                            // Note: Sound is played via PlayerDiscoveredCairn.onInsert callback
                                            // to ensure it only plays on actual first discovery (after server confirms)
                                            
                                            if (loreEntry) {
                                                // Create lore audio element
                                                console.log(`[Cairn] Creating audio for lore index ${loreEntry.index}`);
                                                const loreAudio = createCairnLoreAudio(loreEntry.index, 0.9);
                                                
                                                // Play with SovaSoundBox if available (shows waveform, click to cancel)
                                                if (loreAudio) {
                                                    if (showSovaSoundBox) {
                                                        loreAudio.play().then(() => {
                                                            showSovaSoundBox(loreAudio, `SOVA: ${loreEntry.title}`);
                                                        }).catch(err => {
                                                            console.warn(`[Cairn] Failed to play lore audio:`, err);
                                                            // CRITICAL: Clear the pending flag if audio fails to play
                                                            // Otherwise notification sounds will be blocked forever
                                                            stopCairnLoreAudio();
                                                        });
                                                    } else {
                                                        // Fallback: play without SovaSoundBox
                                                        loreAudio.play().catch(err => {
                                                            console.warn(`[Cairn] Failed to play lore audio (fallback):`, err);
                                                            // CRITICAL: Clear the pending flag if audio fails to play
                                                            stopCairnLoreAudio();
                                                        });
                                                    }
                                                }
                                                
                                                // Show notification
                                                if (onCairnNotification) {
                                                    console.log(`[Cairn] Showing notification - ${newDiscoveryCount}/${totalCairns}`);
                                                    onCairnNotification({
                                                        id: `cairn_${cairnId}_${Date.now()}`,
                                                        cairnNumber: newDiscoveryCount,
                                                        totalCairns: totalCairns,
                                                        title: loreEntry.title,
                                                        isFirstDiscovery: isFirstDiscovery,
                                                        timestamp: Date.now()
                                                    });
                                                }
                                                
                                                // Add lore text to SOVA chat with tab flash
                                                if (addSOVAMessage) {
                                                    addSOVAMessage({
                                                        id: `cairn_${cairnId}_${Date.now()}`,
                                                        text: loreEntry.text,
                                                        isUser: false,
                                                        timestamp: new Date(),
                                                        flashTab: true // Flash the SOVA tab to draw attention
                                                    });
                                                } else {
                                                    console.warn('[Cairn] addSOVAMessage not available, cannot display lore text');
                                                }
                                            } else {
                                                console.warn(`[Cairn] Lore entry not found for lore_id: ${cairn.loreId}`);
                                            }
                                        } catch (error) {
                                            console.error('[Cairn] Error interacting with cairn:', error);
                                        }
                                    } else {
                                        console.warn(`[Cairn] Cairn not found in map: ${cairnId}`);
                                    }
                                }
                                break;
                            case 'milkable_animal':
                                // Milk a tamed animal (caribou or walrus)
                                if (typeof currentTarget.id === 'bigint') {
                                    const animalId = currentTarget.id;
                                    console.log(`[Milk] Attempting to milk animal: ${animalId}`);
                                    try {
                                        // Cast to any until bindings are regenerated after server build
                                        (currentConnection.reducers as any).milkAnimal(animalId);
                                        console.log(`[Milk] Reducer called for animal ${animalId}`);
                                    } catch (error) {
                                        console.error('[Milk] Error milking animal:', error);
                                    }
                                }
                                break;
                        }
                    }
                } else {
                    if (!currentTarget) {
                        console.log('[E-KeyDown] No target available for interaction (waiting for parent components to pass closestInteractableTarget prop)');
                    } else {
                        console.log('[E-KeyDown] Target is invalid:', formatTargetForLogging(currentTarget));
                    }
                }

                if (holdTarget && currentTarget) {
                    const expectedDuration = currentTarget.type === 'knocked_out_player' ? 
                        getHoldDuration(currentTarget) : 
                        getSecondaryHoldDuration(currentTarget);
                        
                    console.log('[E-Hold START]', { 
                        holdTarget,
                        expectedDuration
                    });
                    setInteractionProgress(holdTarget);
                    setIsActivelyHolding(true);

                    startHoldTimer(holdTarget, currentConnection);
                }
            }
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            const key = event.key.toLowerCase();
            keysPressed.current.delete(key);

            // Movement key handling is now done by useMovementInput hook
            // Only handle non-movement keys here to avoid conflicts

            if (key === 'e') {
                if (isEHeldDownRef.current) { // Check if E was being held for an interaction
                    const holdDuration = Date.now() - eKeyDownTimestampRef.current;
                                            // Get the current target for tap action processing
                        const currentTarget = closestTargetRef.current;

                    // Always clear the timer if it exists (in case keyUp happens before timer fires)
                    console.log(`[E-KeyUp] Timer ref state: ${eKeyHoldTimerRef.current} (holdDuration: ${holdDuration}ms)`);
                    if (eKeyHoldTimerRef.current) {
                        console.log(`[E-KeyUp] *** CLEARING TIMER *** Timer ID: ${eKeyHoldTimerRef.current}, holdDuration: ${holdDuration}ms`);
                        clearTimeout(eKeyHoldTimerRef.current as number);
                        eKeyHoldTimerRef.current = null;
                    } else {
                        console.log(`[E-KeyUp] No timer to clear (holdDuration: ${holdDuration}ms)`);
                    }

                    // Reset hold state and unconditionally clear interaction progress if a hold was active
                    isEHeldDownRef.current = false;
                    eKeyDownTimestampRef.current = 0;
                    if (interactionProgress) { // If there was any interaction progress, clear it now
                        setInteractionProgress(null);
                    }

                    // Also ensure isActivelyHolding is false if E key is up and was part of a hold
                    setIsActivelyHolding(false);

                    // Check if tap action was already triggered on keyDown (for instant responsiveness)
                    const wasTapActionTriggeredOnKeyDown = tapActionTriggeredOnKeyDownRef.current;
                    tapActionTriggeredOnKeyDownRef.current = false; // Reset flag

                    // Check if it was a TAP or HOLD based on duration and target type
                    const expectedDuration = currentTarget?.type === 'knocked_out_player' ? REVIVE_HOLD_DURATION_MS : 
                                            currentTarget && hasSecondaryHoldAction(currentTarget) ? getSecondaryHoldDuration(currentTarget) :
                                            HOLD_INTERACTION_DURATION_MS;

                    console.log('[E-KeyUp] Processing hold/tap decision:', {
                        holdDuration,
                        expectedDuration,
                        wasLongEnough: holdDuration >= expectedDuration,
                        wasTapActionTriggeredOnKeyDown,
                        currentTarget: currentTarget ? formatTargetForLogging(currentTarget) : 'null'
                    });

                    if (holdDuration >= expectedDuration) {
                        // This was a HOLD that completed naturally - actions should have been handled by timer
                        console.log('[E-KeyUp] HOLD completed naturally - timer should have handled action');
                    } else if (!wasTapActionTriggeredOnKeyDown) {
                        // This was a TAP (or early release) - handle tap interactions only if not already triggered on keyDown
                        console.log('[E-KeyUp] Processing as TAP interaction');
                        let tapActionTaken = false;

                        // Handle tap actions using unified target system
                        if (connectionRef.current?.reducers && currentTarget && isTargetValid(currentTarget)) {
                            // console.log('[E-Tap ACTION] Processing tap for:', formatTargetForLogging(currentTarget));
                            
                            // Handle immediate tap actions (harvest/pickup)
                            if (isTapInteraction(currentTarget)) {
                                switch (currentTarget.type) {
                                    case 'harvestable_resource':
                                        // Enhanced debugging: Get the actual resource data for detailed logging
                                        const resourceId = currentTarget.id as bigint;
                                        
                                        // Try to get the resource entity from the connection's database
                                        let resourceEntity = null;
                                        try {
                                            if (connectionRef.current?.db?.harvestableResource) {
                                                // Use the generated table handle to find the resource by ID
                                                resourceEntity = Array.from(connectionRef.current.db.harvestableResource.iter())
                                                    .find(resource => resource.id === resourceId);
                                            }
                                        } catch (error) {
                                            console.warn('[E-Tap ACTION] Error accessing harvestable resources:', error);
                                        }
                                        
                                        if (resourceEntity) {
                                            // console.log('[E-Tap ACTION] 🌱 HARVESTING RESOURCE - Details:', {
                                            //     id: resourceId,
                                            //     plantType: resourceEntity.plantType,
                                            //     position: `(${resourceEntity.posX}, ${resourceEntity.posY})`,
                                            //     chunkIndex: resourceEntity.chunkIndex,
                                            //     respawnAt: resourceEntity.respawnAt,
                                            //     isRespawning: !!resourceEntity.respawnAt
                                            // });
                                            
                                            // Also log just the plant type tag for easy scanning
                                            // console.log(`[E-Tap ACTION] 🎯 Harvesting: ${resourceEntity.plantType.tag} at (${resourceEntity.posX.toFixed(1)}, ${resourceEntity.posY.toFixed(1)})`);
                                        } else {
                                            console.warn('[E-Tap ACTION] ⚠️ Resource not found in cache:', resourceId);
                                            // Log target details we do have
                                            // console.log('[E-Tap ACTION] Target details:', {
                                            //     id: resourceId,
                                            //     type: currentTarget.type,
                                            //     position: currentTarget.position,
                                            //     distance: currentTarget.distance,
                                            //     data: currentTarget.data
                                            // });
                                        }
                                        
                                        // console.log('[E-Tap ACTION] Harvesting resource:', currentTarget.id);
                                        connectionRef.current.reducers.interactWithHarvestableResource(resourceId);
                                        tapActionTaken = true;
                                        break;
                                    case 'dropped_item':
                                        // console.log('[E-Tap ACTION] Picking up dropped item:', currentTarget.id);
                                        connectionRef.current.reducers.pickupDroppedItem(currentTarget.id as bigint);
                                        tapActionTaken = true;
                                        break;
                                    case 'door':
                                        // Toggle door open/close state
                                        console.log('[E-Tap ACTION] Interacting with door:', currentTarget.id);
                                        connectionRef.current.reducers.interactDoor(currentTarget.id as bigint);
                                        tapActionTaken = true;
                                        break;
                                }
                            }
                            // Handle interface opening actions for containers/interactables
                            else if (isInterfaceInteraction(currentTarget)) {
                                switch (currentTarget.type) {
                                    case 'campfire':
                                        // console.log('[E-Tap ACTION] Opening campfire interface:', currentTarget.id);
                                        onSetInteractingWith({ type: 'campfire', id: currentTarget.id });
                                        tapActionTaken = true;
                                        break;
                                    case 'furnace':
                                        // console.log('[E-Tap ACTION] Opening furnace interface:', currentTarget.id);
                                        onSetInteractingWith({ type: 'furnace', id: currentTarget.id });
                                        tapActionTaken = true;
                                        break;
                                    case 'barbecue':
                                        // console.log('[E-Tap ACTION] Opening barbecue interface:', currentTarget.id);
                                        onSetInteractingWith({ type: 'barbecue', id: currentTarget.id });
                                        tapActionTaken = true;
                                        break;
                                    case 'lantern':
                                        // console.log('[E-Tap ACTION] Opening lantern interface:', currentTarget.id);
                                        onSetInteractingWith({ type: 'lantern', id: currentTarget.id });
                                        tapActionTaken = true;
                                        break;
                                    case 'turret' as InteractionTargetType: {
                                        // Monument turrets cannot be interacted with
                                        const tapTurret = turrets?.get(String(currentTarget.id));
                                        if (tapTurret && tapTurret.isMonument) break;
                                        // console.log('[E-Tap ACTION] Opening turret interface:', currentTarget.id);
                                        onSetInteractingWith({ type: 'turret' as InteractionTargetType, id: currentTarget.id });
                                        tapActionTaken = true;
                                        break;
                                    }
                                    case 'box':
                                        // console.log('[E-Tap ACTION] Opening box interface:', currentTarget.id);
                                        onSetInteractingWith({ type: 'wooden_storage_box', id: currentTarget.id });
                                        tapActionTaken = true;
                                        break;
                                    case 'stash':
                                        // console.log('[E-Tap ACTION] Opening stash interface:', currentTarget.id);
                                        onSetInteractingWith({ type: 'stash', id: currentTarget.id });
                                        tapActionTaken = true;
                                        break;
                                    case 'corpse':
                                        // Check corpse protection before opening
                                        const corpseId = currentTarget.id.toString();
                                        const corpse = playerCorpses?.get(corpseId);
                                        
                                        if (corpse && corpse.lockedUntil && localPlayer) {
                                            const now = Date.now();
                                            const lockExpires = Number(corpse.lockedUntil.microsSinceUnixEpoch / 1000n);
                                            const isOwner = corpse.playerIdentity.toHexString() === localPlayer.identity.toHexString();
                                            
                                            if (now < lockExpires && !isOwner) {
                                                // Corpse is protected and player is not the owner - play Sova sound
                                                console.log('[E-Tap ACTION] Corpse protected - playing sova_corpse_protected.mp3');
                                                const sovaAudio = new Audio('/sounds/sova_corpse_protected.mp3');
                                                sovaAudio.volume = 0.8;
                                                sovaAudio.play().catch(err => console.warn('Failed to play corpse protection sound:', err));
                                                tapActionTaken = true;
                                                break;
                                            }
                                        }
                                        
                                        // console.log('[E-Tap ACTION] Opening corpse interface:', currentTarget.id);
                                        onSetInteractingWith({ type: 'player_corpse', id: currentTarget.id });
                                        tapActionTaken = true;
                                        break;
                                    case 'sleeping_bag':
                                        //  console.log('[E-Tap ACTION] Opening sleeping bag interface:', currentTarget.id);
                                        onSetInteractingWith({ type: 'sleeping_bag', id: currentTarget.id });
                                        tapActionTaken = true;
                                        break;
                                    case 'rain_collector':
                                        // console.log('[E-Tap ACTION] Opening rain collector interface:', currentTarget.id);
                                        onSetInteractingWith({ type: 'rain_collector', id: currentTarget.id });
                                        tapActionTaken = true;
                                        break;
                                    case 'homestead_hearth':
                                        // console.log('[E-Tap ACTION] Opening hearth interface:', currentTarget.id);
                                        onSetInteractingWith({ type: 'homestead_hearth', id: currentTarget.id });
                                        tapActionTaken = true;
                                        break;
                                    case 'fumarole':
                                        // console.log('[E-Tap ACTION] Opening fumarole interface:', currentTarget.id);
                                        onSetInteractingWith({ type: 'fumarole', id: currentTarget.id });
                                        tapActionTaken = true;
                                        break;
                                    case 'broth_pot':
                                        // console.log('[E-Tap ACTION] Opening broth pot interface:', currentTarget.id);
                                        onSetInteractingWith({ type: 'broth_pot', id: currentTarget.id });
                                        tapActionTaken = true;
                                        break;
                                    case 'alk_station':
                                        // Check if panel was just closed to prevent immediate reopen
                                        if (!wasAlkPanelJustClosed()) {
                                            // console.log('[E-Tap ACTION] Opening ALK station interface:', currentTarget.id);
                                            onSetInteractingWith({ type: 'alk_station', id: currentTarget.id });
                                            tapActionTaken = true;
                                        } else {
                                            console.log('[E-Tap ACTION] Skipping ALK station open - panel was just closed');
                                            tapActionTaken = true; // Still mark as taken to prevent other actions
                                        }
                                        break;
                                    // Note: cairn is handled in isTapInteraction block above, not here
                                }
                            }
                        } else {
                            if (!connectionRef.current?.reducers) {
                                console.warn('[E-Tap ACTION] No connection/reducers available');
                            } else if (!currentTarget) {
                                console.log('[E-Tap ACTION] No target available for interaction');
                            } else if (!isTargetValid(currentTarget)) {
                                console.warn('[E-Tap ACTION] Target is invalid:', formatTargetForLogging(currentTarget));
                            } else {
                                console.warn('[E-Tap ACTION] Unknown reason for action failure');
                            }
                        }

                        // console.log('[E-KeyUp] TAP processing complete. Action taken:', tapActionTaken);
                    }
                }
            }
        };

        // --- Mouse Handlers ---
        const handleMouseDown = (event: MouseEvent) => {
            if (isPlayerDead) return;
            if (event.target !== canvasRef?.current) return;
            if (isInventoryOpen) return;
            if (isActivelyHolding) return;
            
            // Enhanced chat input detection for mouse events
            const target = event.target as Element;
            const activeElement = document.activeElement as Element;
            
            // Check if ANY input is currently focused (either event target or active element)
            const isChatInputFocused = target?.getAttribute('data-is-chat-input') === 'true' || 
                                     target?.closest('[data-is-chat-input="true"]') !== null ||
                                     target?.tagName === 'INPUT' ||
                                     target?.tagName === 'TEXTAREA' ||
                                     activeElement?.getAttribute('data-is-chat-input') === 'true' ||
                                     activeElement?.tagName === 'INPUT' ||
                                     activeElement?.tagName === 'TEXTAREA';
            
            if (isChatting || isChatInputFocused) {
                // console.log('[InputHandler] Mouse input blocked - chat focused:', { 
                //     isChatting, 
                //     isChatInputFocused,
                //     targetTag: target?.tagName,
                //     targetDataAttr: target?.getAttribute('data-is-chat-input')
                // });
                
                // If user is trying to left-click but chat input is blocking, try to clear focus
                // Only clear if not actively searching in crafting recipes
                if (event.button === 0 && isChatInputFocused && !isChatting && !isSearchingCraftRecipes) {
                    // console.log('[InputHandler] Attempting to clear stuck chat input focus on mouse click');
                    forceClearInputFocus();
                }
                
                return;
            }

            if (event.button === 0) { // Left Click
                // 🎣 FISHING INPUT FIX: Disable left mouse button actions while fishing
                if (isFishing) {
                    // console.log('[Input] Left mouse blocked - player is fishing');
                    event.preventDefault();
                    return;
                }
                
                // ADDED: Cancel throw aim on left click DOWN (while holding right-click to prepare throw)
                if (isAimingThrowRef.current) {
                    isAimingThrowRef.current = false;
                    if (connectionRef.current?.reducers) {
                        try {
                            connectionRef.current.reducers.setThrowAim(false);
                        } catch (err) {
                            console.error('[ThrowAim] Error cancelling throw aim:', err);
                        }
                    }
                    event.preventDefault();
                    return; // Don't process other left-click actions when cancelling throw
                }
                
                // Normal left click logic for attacks, interactions, etc.
                isMouseDownRef.current = true;

                const localPlayerActiveEquipment = localPlayerId ? activeEquipmentsRef.current?.get(localPlayerId) : undefined;
                // console.log("[InputHandler DEBUG MOUSEDOWN] localPlayerId:", localPlayerId, "activeEquip:", !!localPlayerActiveEquipment, "itemDefs:", !!itemDefinitionsRef.current);

                if (localPlayerActiveEquipment?.equippedItemDefId && itemDefinitionsRef.current) {
                    const equippedItemDef = itemDefinitionsRef.current.get(String(localPlayerActiveEquipment.equippedItemDefId));
                    //  console.log("[InputHandler DEBUG MOUSEDOWN] Equipped item Def (raw object): ", equippedItemDef);

                    if (equippedItemDef) {
                        // console.log("[InputHandler DEBUG MOUSEDOWN] Equipped item name: ", equippedItemDef.name, "Category tag:", equippedItemDef.category?.tag);

                        // 1. Ranged Weapon Firing
                        if (equippedItemDef.category?.tag === "RangedWeapon") {
                            if (localPlayerActiveEquipment.isReadyToFire) {
                                const currentPlayer = localPlayerRef.current;
                                // CRITICAL: Use getCurrentPositionNow() for EXACT position at this moment
                                // This calculates position on-demand, not from last animation frame
                                const exactPos = getCurrentPositionNowRef.current?.();
                                const fallbackPos = predictedPositionRef.current;
                                if (connectionRef.current?.reducers && worldMousePosRefInternal.current.x !== null && worldMousePosRefInternal.current.y !== null && currentPlayer) {
                                    // console.log("[InputHandler MOUSEDOWN] Ranged weapon loaded. Firing!");
                                    // Use EXACT position calculated at this moment for perfect accuracy
                                    const fireX = exactPos?.x ?? fallbackPos?.x ?? currentPlayer.positionX;
                                    const fireY = exactPos?.y ?? fallbackPos?.y ?? currentPlayer.positionY;
                                    connectionRef.current.reducers.fireProjectile(
                                        worldMousePosRefInternal.current.x, 
                                        worldMousePosRefInternal.current.y,
                                        fireX,
                                        fireY
                                    );
                                } else {
                                    console.warn("[InputHandler MOUSEDOWN] Cannot fire ranged weapon: No connection/reducers or invalid mouse position.");
                                }
                            } else {
                                // console.log("[InputHandler MOUSEDOWN] Ranged weapon equipped but not ready to fire (isReadyToFire: false).");
                            }
                            return; // Ranged weapon logic handled (fired or noted as not ready)
                        }
                        // 2. Torch: Prevent left-click swing   
                        else if (equippedItemDef.name === "Torch") {
                            // console.log("[InputHandler MOUSEDOWN] Torch equipped. Left-click does nothing (use Right-Click to toggle).");
                            return; // Torch has no default left-click action here
                        }
                        // 3. Bandage: Prevent left-click swing (already handled by right-click)
                        else if (equippedItemDef.name === "Bandage") {
                            // console.log("[InputHandler MOUSEDOWN] Bandage equipped. Left-click does nothing. Use Right-Click.");
                            return;
                        }
                                                // 5. Water Containers: Prevent left-click pouring while on water, only allow crop watering
                        else if (isWaterContainer(equippedItemDef.name) && localPlayerActiveEquipment.equippedItemInstanceId) {
                            // console.log('[InputHandler] Left-click with water container');
                            
                            // Get the water container item first
                            const waterContainer = inventoryItems.get(localPlayerActiveEquipment.equippedItemInstanceId.toString());
                            if (!waterContainer || !connectionRef.current?.reducers) {
                                // console.log('[InputHandler] No water container found or no connection');
                                return;
                            }
                            
                            // Prevent left-click actions while on water tiles to avoid race conditions
                            if (localPlayerRef.current?.isOnWater) {
                                // console.log('[InputHandler] Player is on water - left-click disabled for water containers (use F key to fill)');
                                return;
                            } else {
                                // console.log('[InputHandler] Player not on water - checking for crop watering');
                                // Not on water - check if container has water for watering crops
                                if (hasWaterContent(waterContainer)) {
                                    // console.log("[InputHandler] Water container with water equipped. Calling water_crops reducer.");
                                    connectionRef.current.reducers.waterCrops(localPlayerActiveEquipment.equippedItemInstanceId);
                                    return;
                                } else {
                                    // console.log('[InputHandler] No water content - falling through to normal swing behavior');
                                }
                                // If no water content, fall through to normal swing behavior
                            }
                        }
                        // 6. Fertilizer: Apply to nearby crops on left-click
                        else if (equippedItemDef.name === "Fertilizer" && localPlayerActiveEquipment.equippedItemInstanceId) {
                            console.log('[InputHandler] Left-click with fertilizer');
                            
                            // Get the fertilizer item
                            const fertilizerItem = inventoryItems.get(localPlayerActiveEquipment.equippedItemInstanceId.toString());
                            if (!fertilizerItem || !connectionRef.current?.reducers) {
                                console.log('[InputHandler] No fertilizer found or no connection', {
                                    fertilizerItem: !!fertilizerItem,
                                    hasReducers: !!connectionRef.current?.reducers,
                                    instanceId: localPlayerActiveEquipment.equippedItemInstanceId?.toString()
                                });
                                return;
                            }
                            
                            // Check if fertilizer has quantity
                            if (fertilizerItem.quantity > 0) {
                                console.log("[InputHandler] Fertilizer equipped. Calling apply_fertilizer reducer.", {
                                    instanceId: localPlayerActiveEquipment.equippedItemInstanceId.toString(),
                                    quantity: fertilizerItem.quantity
                                });
                                try {
                                    connectionRef.current.reducers.applyFertilizer(localPlayerActiveEquipment.equippedItemInstanceId);
                                    console.log("[InputHandler] Successfully called applyFertilizer reducer");
                                    return;
                                } catch (err) {
                                    console.error("[InputHandler] Error applying fertilizer:", err);
                                    return;
                                }
                            } else {
                                console.log('[InputHandler] Fertilizer bag is empty');
                                return;
                            }
                        }
                        // If none of the above special cases, fall through to default item use (melee/tool)
                    } else {
                        // console.log("[InputHandler DEBUG MOUSEDOWN] Equipped item definition NOT FOUND for ID:", localPlayerActiveEquipment.equippedItemDefId);
                        // Fall through to default unarmed action if item def is missing
                    }
                }

                // Default action for other items (tools, melee weapons) or if unarmed
                // ⚠️ FIX: Use attemptSwing() which has proper cooldown checks
                // Previously this block called registerLocalPlayerSwing() + useEquippedItem() without
                // checking cooldowns, causing animations to play even when server rejected the attack
                attemptSwing();
            } else if (event.button === 2) { // Right Click
                if (isPlayerDead) return;
                if (isInventoryOpen) return;

                // console.log("[InputHandler] Right mouse button pressed");
                isRightMouseDownRef.current = true;

                // ADDED: Check for Blueprint on right mouse down
                const localPlayerActiveEquipment = localPlayerId ? activeEquipmentsRef.current?.get(localPlayerId) : undefined;
                if (localPlayerActiveEquipment?.equippedItemDefId && itemDefinitionsRef.current) {
                    const equippedItemDef = itemDefinitionsRef.current.get(String(localPlayerActiveEquipment.equippedItemDefId));
                    if (equippedItemDef?.name === "Blueprint") {
                        // Clear upgrade menu if it's showing (switching from hammer to blueprint)
                        if (showUpgradeRadialMenu) {
                            setShowUpgradeRadialMenu(false);
                            upgradeMenuFoundationIdRef.current = null;
                            radialMenuShownRef.current = false;
                        }
                        // Don't show menu if it's already showing (prevent flickering)
                        if (showBuildingRadialMenu || radialMenuShownRef.current) {
                            return;
                        }
                        // Get mouse position for radial menu
                        const mouseX = event.clientX;
                        const mouseY = event.clientY;
                        setRadialMenuMouseX(mouseX);
                        setRadialMenuMouseY(mouseY);
                        // Show menu after a short delay to allow for drag detection
                        if (radialMenuTimeoutRef.current) {
                            clearTimeout(radialMenuTimeoutRef.current);
                            radialMenuTimeoutRef.current = null;
                        }
                        console.log('[BuildingRadialMenu] Right-click detected with Blueprint, setting up menu at', mouseX, mouseY);
                        radialMenuTimeoutRef.current = setTimeout(() => {
                            console.log('[BuildingRadialMenu] Timeout fired, isRightMouseDown:', isRightMouseDownRef.current);
                            if (isRightMouseDownRef.current) {
                                console.log('[BuildingRadialMenu] Showing radial menu');
                                radialMenuShownRef.current = true;
                                setShowBuildingRadialMenu(true);
                            }
                        }, 100); // 100ms delay before showing menu
                        return;
                    }
                    // ADDED: Check for Repair Hammer on right mouse down
                    // Prioritize walls over foundations - check walls first
                    if (equippedItemDef?.name === "Repair Hammer") {
                        // Check for targeted wall first
                        if (targetedWallRef.current) {
                            // Don't show menu if it's already showing (prevent flickering)
                            if (showBuildingRadialMenu) {
                                setShowBuildingRadialMenu(false);
                                radialMenuShownRef.current = false;
                            }
                            if (showUpgradeRadialMenu || radialMenuShownRef.current) {
                                return;
                            }
                            // Store the wall ID so menu stays open even if targetedWall changes
                            upgradeMenuWallIdRef.current = targetedWallRef.current.id;
                            // Get mouse position for upgrade radial menu
                            const mouseX = event.clientX;
                            const mouseY = event.clientY;
                            setRadialMenuMouseX(mouseX);
                            setRadialMenuMouseY(mouseY);
                            // Show menu after a short delay to allow for drag detection
                            if (radialMenuTimeoutRef.current) {
                                clearTimeout(radialMenuTimeoutRef.current);
                                radialMenuTimeoutRef.current = null;
                            }
                            console.log('[UpgradeRadialMenu] Right-click detected with Repair Hammer on wall, setting up menu at', mouseX, mouseY);
                            radialMenuTimeoutRef.current = setTimeout(() => {
                                if (isRightMouseDownRef.current && upgradeMenuWallIdRef.current !== null) {
                                    console.log('[UpgradeRadialMenu] Showing upgrade radial menu for wall');
                                    radialMenuShownRef.current = true;
                                    setShowUpgradeRadialMenu(true);
                                } else {
                                    // Clear the wall ID if menu didn't show
                                    upgradeMenuWallIdRef.current = null;
                                }
                            }, 100);
                            return;
                        }
                        // Check for targeted fence
                        else if (targetedFenceRef.current) {
                            // Don't show menu if it's already showing (prevent flickering)
                            if (showBuildingRadialMenu) {
                                setShowBuildingRadialMenu(false);
                                radialMenuShownRef.current = false;
                            }
                            if (showUpgradeRadialMenu || radialMenuShownRef.current) {
                                return;
                            }
                            // Store the fence ID so menu stays open even if targetedFence changes
                            upgradeMenuFenceIdRef.current = targetedFenceRef.current.id;
                            // Get mouse position for upgrade radial menu
                            const mouseX = event.clientX;
                            const mouseY = event.clientY;
                            setRadialMenuMouseX(mouseX);
                            setRadialMenuMouseY(mouseY);
                            // Show menu after a short delay to allow for drag detection
                            if (radialMenuTimeoutRef.current) {
                                clearTimeout(radialMenuTimeoutRef.current);
                                radialMenuTimeoutRef.current = null;
                            }
                            console.log('[UpgradeRadialMenu] Right-click detected with Repair Hammer on fence, setting up menu at', mouseX, mouseY);
                            radialMenuTimeoutRef.current = setTimeout(() => {
                                if (isRightMouseDownRef.current && upgradeMenuFenceIdRef.current !== null) {
                                    console.log('[UpgradeRadialMenu] Showing upgrade radial menu for fence');
                                    radialMenuShownRef.current = true;
                                    setShowUpgradeRadialMenu(true);
                                } else {
                                    // Clear the fence ID if menu didn't show
                                    upgradeMenuFenceIdRef.current = null;
                                }
                            }, 100);
                            return;
                        }
                        // Fall back to foundation if no wall or fence is targeted
                        else if (targetedFoundationRef.current) {
                            // Don't show menu if it's already showing (prevent flickering)
                            if (showBuildingRadialMenu) {
                                setShowBuildingRadialMenu(false);
                                radialMenuShownRef.current = false;
                            }
                            if (showUpgradeRadialMenu || radialMenuShownRef.current) {
                                return;
                            }
                            // Store the foundation ID so menu stays open even if targetedFoundation changes
                            upgradeMenuFoundationIdRef.current = targetedFoundationRef.current.id;
                            // Get mouse position for upgrade radial menu
                            const mouseX = event.clientX;
                            const mouseY = event.clientY;
                            setRadialMenuMouseX(mouseX);
                            setRadialMenuMouseY(mouseY);
                            // Show menu after a short delay to allow for drag detection
                            if (radialMenuTimeoutRef.current) {
                                clearTimeout(radialMenuTimeoutRef.current);
                                radialMenuTimeoutRef.current = null;
                            }
                            console.log('[UpgradeRadialMenu] Right-click detected with Repair Hammer on foundation, setting up menu at', mouseX, mouseY);
                            radialMenuTimeoutRef.current = setTimeout(() => {
                                if (isRightMouseDownRef.current && upgradeMenuFoundationIdRef.current !== null) {
                                    console.log('[UpgradeRadialMenu] Showing upgrade radial menu for foundation');
                                    radialMenuShownRef.current = true;
                                    setShowUpgradeRadialMenu(true);
                                } else {
                                    // Clear the foundation ID if menu didn't show
                                    upgradeMenuFoundationIdRef.current = null;
                                }
                            }, 100);
                            return;
                        }
                    }
                }
                
                // ADDED: Check if equipped item is throwable - enter throw aim mode
                if (localPlayerActiveEquipment?.equippedItemDefId && itemDefinitionsRef.current) {
                    const equippedItemDefForThrow = itemDefinitionsRef.current.get(String(localPlayerActiveEquipment.equippedItemDefId));
                    if (equippedItemDefForThrow && isItemThrowable(equippedItemDefForThrow)) {
                        // Enter throw aim mode
                        isAimingThrowRef.current = true;
                        // Notify server (syncs to other players for visual feedback)
                        if (connectionRef.current?.reducers) {
                            try {
                                connectionRef.current.reducers.setThrowAim(true);
                            } catch (err) {
                                console.error('[ThrowAim] Error setting throw aim:', err);
                            }
                        }
                    }
                }

                // Normal right-click logic for context menu, etc.
            }
        };

        const handleMouseUp = (event: MouseEvent) => {
            // Handle both left and right mouse button releases
            if (event.button === 0) { // Left mouse
                isMouseDownRef.current = false;
                
                // ADDED: Cancel throw aim on left click
                if (isAimingThrowRef.current) {
                    isAimingThrowRef.current = false;
                    if (connectionRef.current?.reducers) {
                        try {
                            connectionRef.current.reducers.setThrowAim(false);
                            console.log('[ThrowAim] Cancelled throw aim with left click');
                        } catch (err) {
                            console.error('[ThrowAim] Error cancelling throw aim:', err);
                        }
                    }
                    return; // Don't process other left-click actions when cancelling throw
                }
                
                // ADDED: Close radial menu on left click
                if (showBuildingRadialMenu) {
                    setShowBuildingRadialMenu(false);
                    radialMenuShownRef.current = false;
                }
                // Upgrade menu handles its own clicks - don't close it here
                // It will close itself when clicking outside
            } else if (event.button === 2) { // Right mouse
                isRightMouseDownRef.current = false;
                
                // ADDED: Close radial menu on right mouse release (menu component will handle selection before this)
                if (showBuildingRadialMenu) {
                    // Small delay to let menu component handle selection first
                    setTimeout(() => {
                        setShowBuildingRadialMenu(false);
                        radialMenuShownRef.current = false;
                    }, 50);
                }
                // Close upgrade menu on right mouse release (same as blueprint)
                if (showUpgradeRadialMenu) {
                    // Clear the stored IDs
                    upgradeMenuFoundationIdRef.current = null;
                    upgradeMenuWallIdRef.current = null;
                    upgradeMenuFenceIdRef.current = null;
                    // Small delay to let menu component handle selection first
                    setTimeout(() => {
                        setShowUpgradeRadialMenu(false);
                        radialMenuShownRef.current = false;
                    }, 50);
                }
                // Only clear timeout if menu wasn't shown yet (user released before delay)
                if (radialMenuTimeoutRef.current && !radialMenuShownRef.current) {
                    clearTimeout(radialMenuTimeoutRef.current);
                    radialMenuTimeoutRef.current = null;
                    upgradeMenuFoundationIdRef.current = null;
                    upgradeMenuWallIdRef.current = null;
                    upgradeMenuFenceIdRef.current = null;
                }
            }
        };

        // --- Canvas Click for Placement ---
        const handleCanvasClick = (event: MouseEvent) => {
            if (isPlayerDead) return;

            // 🎣 FISHING INPUT FIX: Disable canvas click actions while fishing
            if (isFishing) {
                // console.log('[Input] Canvas click blocked - player is fishing');
                event.preventDefault();
                return;
            }

            // ADDED: Handle building placement first
            if (buildingStateRef.current?.isBuilding && buildingActionsRef.current && worldMousePosRefInternal.current.x !== null && worldMousePosRefInternal.current.y !== null) {
                buildingActionsRef.current.attemptPlacement(worldMousePosRefInternal.current.x, worldMousePosRefInternal.current.y);
                return;
            }
            
            if (placementInfo && worldMousePosRefInternal.current.x !== null && worldMousePosRefInternal.current.y !== null) {
                const localPlayerPosition = localPlayerRef.current;
                const isTooFar = localPlayerPosition
                    ? isPlacementTooFar(placementInfo, localPlayerPosition.positionX, localPlayerPosition.positionY, worldMousePosRefInternal.current.x, worldMousePosRefInternal.current.y)
                    : false;
                placementActionsRef.current?.attemptPlacement(worldMousePosRefInternal.current.x, worldMousePosRefInternal.current.y, isTooFar);
                return;
            }
            if (isInventoryOpen) return;
            if (isActivelyHolding) return;
            if (event.target !== canvasRef?.current) return;

            // Use existing refs directly
            if (connectionRef.current?.reducers && localPlayerId && localPlayerRef.current && activeEquipmentsRef.current && itemDefinitionsRef.current && worldMousePosRefInternal.current.x !== null && worldMousePosRefInternal.current.y !== null) {
                const localEquipment = activeEquipmentsRef.current.get(localPlayerId);
                const currentPlayer = localPlayerRef.current;
                // CRITICAL: Use getCurrentPositionNow() for EXACT position at this moment
                const exactPos = getCurrentPositionNowRef.current?.();
                const fallbackPos = predictedPositionRef.current;
                if (localEquipment?.equippedItemDefId && currentPlayer) {
                    const itemDef = itemDefinitionsRef.current.get(String(localEquipment.equippedItemDefId));

                    if (itemDef && (itemDef.name === "Hunting Bow" || itemDef.category === SpacetimeDB.ItemCategory.RangedWeapon)) {
                        try {
                            // Use EXACT position calculated at this moment for perfect accuracy
                            const fireX = exactPos?.x ?? fallbackPos?.x ?? currentPlayer.positionX;
                            const fireY = exactPos?.y ?? fallbackPos?.y ?? currentPlayer.positionY;
                            connectionRef.current.reducers.fireProjectile(
                                worldMousePosRefInternal.current.x, 
                                worldMousePosRefInternal.current.y,
                                fireX,
                                fireY
                            );
                            lastClientSwingAttemptRef.current = Date.now();
                            lastServerSwingTimestampRef.current = Date.now();
                            return;
                        } catch (err) {
                            console.error("[CanvasClick Ranged] Error calling fireProjectile reducer:", err);
                        }
                    }
                }
            }

            // --- Re-evaluate swing logic directly for canvas click, similar to attemptSwing ---
            // Ensure connectionRef is used here as well if currentConnection was from outer scope
            if (!connectionRef.current?.reducers || !localPlayerId) return;
            // ... rest of melee swing logic, ensure it uses refs if needed ...
            const localEquipment = activeEquipmentsRef.current?.get(localPlayerId);
            const itemDef = itemDefinitionsRef.current?.get(String(localEquipment?.equippedItemDefId));

            if (!localEquipment || localEquipment.equippedItemDefId === null || localEquipment.equippedItemInstanceId === null) {
                // Unarmed
                const nowUnarmed = Date.now();
                if (nowUnarmed - lastClientSwingAttemptRef.current < SWING_COOLDOWN_MS) return;
                if (nowUnarmed - Number(localEquipment?.swingStartTimeMs || 0) < SWING_COOLDOWN_MS) return;
                try {
                    // 🎬 CLIENT-AUTHORITATIVE ANIMATION: Register swing immediately for smooth visuals
                    registerLocalPlayerSwing();
                    // 🔊 IMMEDIATE SOUND: Play unarmed swing sound
                    // playWeaponSwingSound(0.8);
                    connectionRef.current.reducers.useEquippedItem();
                    lastClientSwingAttemptRef.current = nowUnarmed;
                    lastServerSwingTimestampRef.current = nowUnarmed;
                } catch (err) { console.error("[CanvasClick Unarmed] Error calling useEquippedItem reducer:", err); }
            } else {
                // Armed (melee/tool)
                if (!itemDef) return;
                if (itemDef.name === "Bandage" || itemDef.name === "Selo Olive Oil" || itemDef.name === "Hunting Bow" || itemDef.category === SpacetimeDB.ItemCategory.RangedWeapon) {
                    // Ranged/Bandage/Selo Olive Oil already handled or should not be triggered by this melee path
                    return;
                }
                
                // Water containers are now handled in handleMouseDown to prevent conflicts
                // This section is for regular melee weapons and tools only
                const now = Date.now();
                const attackIntervalMs = itemDef.attackIntervalSecs ? itemDef.attackIntervalSecs * 1000 : SWING_COOLDOWN_MS;
                if (now - lastServerSwingTimestampRef.current < attackIntervalMs) return;
                if (now - lastClientSwingAttemptRef.current < attackIntervalMs) return;
                if (now - Number(localEquipment.swingStartTimeMs) < attackIntervalMs) return;
                try {
                    // 🎬 CLIENT-AUTHORITATIVE ANIMATION: Register swing immediately for smooth visuals
                    registerLocalPlayerSwing();
                    // 🔊 IMMEDIATE SOUND: Only play generic swing for non-resource tools
                    const isResourceTool = itemDef?.name && (
                        itemDef.name.toLowerCase().includes('hatchet') || 
                        itemDef.name.toLowerCase().includes('axe') ||
                        itemDef.name.toLowerCase().includes('pickaxe') ||
                        itemDef.name.toLowerCase().includes('pick')
                    );
                    
                    if (!isResourceTool) {
                        // Play immediate sound for combat weapons and other tools
                        // playWeaponSwingSound(0.8);
                    }
                    connectionRef.current.reducers.useEquippedItem();
                    lastClientSwingAttemptRef.current = now;
                    lastServerSwingTimestampRef.current = now;
                } catch (err) { console.error("[CanvasClick Armed] Error calling useEquippedItem reducer:", err); }
            }
        };

        // --- Context Menu for Placement Cancellation ---
        const handleContextMenu = (event: MouseEvent) => {
            if (isPlayerDead) return;
            if (isInventoryOpen) return;

            // 🎣 FISHING INPUT FIX: Disable context menu actions while fishing
            if (isFishing) {
                // console.log('[Input] Context menu blocked - player is fishing');
                event.preventDefault();
                return;
            }

            const localPlayerActiveEquipment = localPlayerId ? activeEquipmentsRef.current?.get(localPlayerId) : undefined;
            // console.log("[InputHandler DEBUG CTXMENU] localPlayerId:", localPlayerId, "activeEquip:", !!localPlayerActiveEquipment, "itemDefs:", !!itemDefinitionsRef.current);

            if (localPlayerActiveEquipment?.equippedItemDefId && itemDefinitionsRef.current) {
                const equippedItemDef = itemDefinitionsRef.current.get(String(localPlayerActiveEquipment.equippedItemDefId));
                // console.log("[InputHandler DEBUG CTXMENU] Equipped item Def (raw object): ", equippedItemDef);

                if (equippedItemDef) { // <<< NULL CHECK ADDED
                    // console.log("[InputHandler DEBUG CTXMENU] Equipped item name: ", equippedItemDef.name, "Category tag:", equippedItemDef.category?.tag);
                    if (equippedItemDef.category?.tag === "RangedWeapon") {
                        // console.log("[InputHandler CTXMENU] Ranged Weapon equipped. Attempting to load.");
                        event.preventDefault();
                        if (connectionRef.current?.reducers) {
                            // console.log("[InputHandler CTXMENU] Calling loadRangedWeapon reducer.");
                            connectionRef.current.reducers.loadRangedWeapon();
                        } else {
                            console.warn("[InputHandler CTXMENU] No connection or reducers to call loadRangedWeapon.");
                        }
                        return;
                    }
                    else if (equippedItemDef.name === "Torch") {
                        // console.log("[InputHandler CTXMENU] Torch equipped. Attempting to toggle.");
                        event.preventDefault();
                        if (connectionRef.current?.reducers) {
                            // console.log("[InputHandler CTXMENU] Calling toggleTorch reducer.");
                            connectionRef.current.reducers.toggleTorch();
                        } else {
                            console.warn("[InputHandler CTXMENU] No connection or reducers to call toggleTorch.");
                        }
                        return;
                    } else if (equippedItemDef.name === "Flashlight") {
                        // Flashlight right-click to toggle on/off (same as torch)
                        event.preventDefault();
                        if (connectionRef.current?.reducers) {
                            console.log("[InputHandler CTXMENU] Calling toggleFlashlight reducer.");
                            connectionRef.current.reducers.toggleFlashlight();
                        } else {
                            console.warn("[InputHandler CTXMENU] No connection or reducers to call toggleFlashlight.");
                        }
                        return;
                    } else if (equippedItemDef.name === "Blueprint") {
                        // ADDED: Blueprint right-click - prevent context menu, radial menu is handled in mousedown
                        event.preventDefault();
                        return;
                    } else if (equippedItemDef.name === "Repair Hammer") {
                        // ADDED: Repair Hammer right-click - prevent context menu and throwing
                        // Upgrade radial menu is handled in mousedown
                        // Always prevent context menu when Repair Hammer is equipped
                        event.preventDefault();
                        return;
                    } else if (equippedItemDef.name === "Bandage") {
                        // console.log("[InputHandler CTXMENU] Bandage equipped. Attempting to use.");
                        event.preventDefault();
                        if (connectionRef.current?.reducers) {
                            // console.log("[InputHandler CTXMENU] Calling useEquippedItem for Bandage.");
                            // 🔊 IMMEDIATE SOUND: Play button click for bandage use
                            // playButtonClickSound(0.6);
                            connectionRef.current.reducers.useEquippedItem();
                        } else {
                            console.warn("[InputHandler CTXMENU] No connection or reducers to call useEquippedItem for Bandage.");
                        }
                        return;
                    } else if (equippedItemDef.name === "Selo Olive Oil") {
                        // console.log("[InputHandler CTXMENU] Selo Olive Oil equipped. Attempting to use.");
                        event.preventDefault();
                        if (connectionRef.current?.reducers) {
                            // console.log("[InputHandler CTXMENU] Calling useEquippedItem for Selo Olive Oil.");
                            // 🔊 IMMEDIATE SOUND: Play button click for Selo Olive Oil use
                            // playButtonClickSound(0.6);
                            connectionRef.current.reducers.useEquippedItem();
                        } else {
                            console.warn("[InputHandler CTXMENU] No connection or reducers to call useEquippedItem for Selo Olive Oil.");
                        }
                        return;
                    } else if (equippedItemDef.name === "Reed Water Bottle" || equippedItemDef.name === "Plastic Water Jug") {
                        // console.log("[InputHandler] Right-click with water container - attempting to drink");
                        event.preventDefault();
                        
                        // Find the equipped item instance to check if it has water
                        const equippedItemInstance = Array.from(inventoryItems.values()).find((item: SpacetimeDB.InventoryItem) => 
                            item.instanceId === BigInt(localPlayerActiveEquipment?.equippedItemInstanceId || 0)
                        );
                        
                        // console.log(`[InputHandler] Found equipped item instance:`, !!equippedItemInstance);
                        // console.log(`[InputHandler] Has water content:`, equippedItemInstance ? hasWaterContent(equippedItemInstance) : false);
                        
                        if (equippedItemInstance && hasWaterContent(equippedItemInstance)) {
                            if (connectionRef.current?.reducers && localPlayerActiveEquipment?.equippedItemInstanceId) {
                                // console.log("[InputHandler] Calling consumeFilledWaterContainer for equipped water container.");
                                try {
                                    connectionRef.current.reducers.consumeFilledWaterContainer(BigInt(localPlayerActiveEquipment.equippedItemInstanceId));
                                    // console.log("[InputHandler] Successfully called consumeFilledWaterContainer");
                                } catch (err) {
                                    console.error("[InputHandler] Error calling consumeFilledWaterContainer:", err);
                                }
                            } else {
                                console.warn("[InputHandler] No connection or reducers to call consumeFilledWaterContainer for water container.");
                            }
                        } else {
                            // console.log("[InputHandler] Water container is empty, cannot drink.");
                        }
                        return;
                    }
                    else {
                        // console.log("[InputHandler DEBUG CTXMENU] Equipped item is not Ranged, Torch, or Bandage. Proceeding to placement check.");
                    }
                } else {
                    // console.log("[InputHandler DEBUG CTXMENU] Equipped item definition NOT FOUND for ID:", localPlayerActiveEquipment.equippedItemDefId);
                }
            } else {
                // console.log("[InputHandler DEBUG CTXMENU] No active equipment or itemDefinitions for right-click logic.");
            }

            // Check if the equipped item is throwable and handle throwing
            if (localPlayerActiveEquipment?.equippedItemDefId && itemDefinitionsRef.current) {
                const equippedItemDef = itemDefinitionsRef.current.get(String(localPlayerActiveEquipment.equippedItemDefId));

                if (equippedItemDef && isItemThrowable(equippedItemDef)) {
                    event.preventDefault();
                    
                    // CRITICAL: Only throw if we're still in aim mode (not cancelled by left-click)
                    if (!isAimingThrowRef.current) {
                        console.log('[ThrowAim] Throw cancelled - aim was cancelled with left click');
                        return;
                    }

                    // Quick checks
                    if (!connectionRef.current?.reducers || !localPlayerId || isPlayerDead) {
                        // console.log("[InputHandler] Right-click throw - basic requirements not met");
                        isAimingThrowRef.current = false;
                        return;
                    }

                    const player = localPlayerRef.current;
                    if (!player) {
                        // console.log("[InputHandler] Right-click throw - no local player found");
                        isAimingThrowRef.current = false;
                        return;
                    }

                    // Determine throwing direction based on movement or facing direction
                    let throwingDirection = { dx: 0, dy: 1 }; // Default: facing down

                    // Check if player is currently moving
                    const isCurrentlyMoving = (
                        keysPressed.current.has('w') || keysPressed.current.has('arrowup') ||
                        keysPressed.current.has('s') || keysPressed.current.has('arrowdown') ||
                        keysPressed.current.has('a') || keysPressed.current.has('arrowleft') ||
                        keysPressed.current.has('d') || keysPressed.current.has('arrowright')
                    );

                    if (isCurrentlyMoving) {
                        // Use current movement direction
                        const dx = (keysPressed.current.has('d') || keysPressed.current.has('arrowright') ? 1 : 0) -
                            (keysPressed.current.has('a') || keysPressed.current.has('arrowleft') ? 1 : 0);
                        const dy = (keysPressed.current.has('s') || keysPressed.current.has('arrowdown') ? 1 : 0) -
                            (keysPressed.current.has('w') || keysPressed.current.has('arrowup') ? 1 : 0);

                        if (dx !== 0 || dy !== 0) {
                            throwingDirection = { dx, dy };
                        }
                        // console.log("[InputHandler] Right-click throw - using current movement direction:", throwingDirection);
                    } else {
                        // Player is not moving, use their stored facing direction
                        const playerFacingDirection = player.direction || 'down';
                        throwingDirection = getDirectionVector(playerFacingDirection);
                        // console.log("[InputHandler] Right-click throw - using player facing direction:", playerFacingDirection, "->", throwingDirection);
                    }

                    // Calculate target position based on direction and throwing distance
                    const THROWING_DISTANCE = 400.0;
                    const magnitude = Math.sqrt(throwingDirection.dx * throwingDirection.dx + throwingDirection.dy * throwingDirection.dy);
                    const normalizedDx = magnitude > 0 ? throwingDirection.dx / magnitude : 0;
                    const normalizedDy = magnitude > 0 ? throwingDirection.dy / magnitude : 1;

                    const targetX = player.positionX + (normalizedDx * THROWING_DISTANCE);
                    const targetY = player.positionY + (normalizedDy * THROWING_DISTANCE);

                    // console.log("[InputHandler] Right-click - THROWING:", equippedItemDef.name, "from", player.positionX, player.positionY, "to", targetX, targetY, "direction:", throwingDirection);

                    try {
                        connectionRef.current.reducers.throwItem(targetX, targetY);
                        console.log("[ThrowAim] Item thrown successfully!");
                    } catch (err) {
                        console.error("[ThrowAim] Error throwing item:", err);
                    }
                    
                    // Clear throw aim state after throwing
                    isAimingThrowRef.current = false;
                    try {
                        connectionRef.current.reducers.setThrowAim(false);
                    } catch (err) {
                        // Silently ignore - server will clear it anyway in throw_item
                    }

                    return; // Always return after handling throw
                }
            }

            if (placementInfo) {
                // console.log("[InputHandler CTXMENU] Right-click during placement - cancelling placement.");
                event.preventDefault();
                placementActionsRef.current?.cancelPlacement();
            }
            
            // REMOVED: Cancel building mode on right-click - interferes with radial menu flow
            
            // ADDED: Hide radial menu on context menu
            if (showBuildingRadialMenu) {
                event.preventDefault();
                radialMenuShownRef.current = false;
                setShowBuildingRadialMenu(false);
            }
            // Prevent context menu when upgrade menu is showing (but don't close it)
            if (showUpgradeRadialMenu) {
                event.preventDefault();
                return;
            }
        };

        // --- Wheel for Placement Cancellation (optional) ---
        const handleWheel = (event: WheelEvent) => {
            // Don't interfere with scrolling when game menus are open
            if (isGameMenuOpen) {
                return; // Let menus handle their own scrolling
            }

            // ADDED: Cycle foundation shapes when in building mode
            if (buildingStateRef.current?.isBuilding && buildingActionsRef.current) {
                event.preventDefault();
                const direction = event.deltaY > 0 ? 'next' : 'prev';
                buildingActionsRef.current.cycleFoundationShape(direction);
                return;
            }

            if (placementInfo) {
                placementActionsRef.current?.cancelPlacement();
            }
        };

        // --- Blur Handler ---
        const handleBlur = () => {
            // console.log(`[E-Timer] *** WINDOW BLUR CLEARING TIMER *** Timer ID: ${eKeyHoldTimerRef.current}`);
            // REMOVED Sprinting logic from blur handler.
            // keysPressed.current.clear(); // Keep this commented out
            isMouseDownRef.current = false;
            isRightMouseDownRef.current = false; // Reset right mouse state
            
            // ADDED: Clear throw aim state on blur/visibility change
            if (isAimingThrowRef.current) {
                isAimingThrowRef.current = false;
                if (connectionRef.current?.reducers) {
                    try {
                        connectionRef.current.reducers.setThrowAim(false);
                    } catch (err) { /* ignore */ }
                }
            }
            
            isEHeldDownRef.current = false;
            if (eKeyHoldTimerRef.current) clearTimeout(eKeyHoldTimerRef.current);
            eKeyHoldTimerRef.current = null;
            setInteractionProgress(null);
            // NOTE: Auto-attack (Z) intentionally NOT cleared on blur
            // This allows auto-attack to persist through tab-outs for AFK harvesting
        };
        
        // Utility function to force clear all input focus (called when needed)
        const forceClearInputFocus = () => {
            const activeEl = document.activeElement as HTMLElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.getAttribute('data-is-chat-input'))) {
                // console.log('[InputHandler] Force clearing input focus from:', activeEl.tagName, activeEl.getAttribute('data-is-chat-input'));
                activeEl.blur();
                document.body.focus();
                // Small delay to ensure focus change is processed
                setTimeout(() => {
                    if (document.activeElement === activeEl) {
                        // console.log('[InputHandler] Secondary force focus clear');
                        document.body.focus();
                    }
                }, 100);
            }
        };

        // Add global listeners
        window.addEventListener('keydown', handleKeyDown, { capture: true });
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('wheel', handleWheel, { passive: true });
        window.addEventListener('contextmenu', handleContextMenu);
        window.addEventListener('blur', handleBlur);

        // Add listener for canvas click (if canvas ref is passed in)
        const canvas = canvasRef?.current; // Get canvas element from ref
        if (canvas) {
            // Attach the locally defined handler
            canvas.addEventListener('click', handleCanvasClick);
            // console.log("[useInputHandler] Added canvas click listener.");
        } else {
            // console.warn("[useInputHandler] Canvas ref not available on mount to add click listener.");
        }

        // Cleanup
        return () => {
            // Remove global listeners
            window.removeEventListener('keydown', handleKeyDown, { capture: true }); // 🎣 FISHING INPUT FIX: Match capture option in cleanup
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('wheel', handleWheel);
            window.removeEventListener('contextmenu', handleContextMenu);
            window.removeEventListener('blur', handleBlur);
            // Remove canvas listener on cleanup
            if (canvas) {
                canvas.removeEventListener('click', handleCanvasClick);
                // console.log("[useInputHandler] Removed canvas click listener.");
            }
            // Don't clear timers on cleanup - they're short-lived (250ms) and self-cleaning
            // The cleanup was causing timers to be cleared when dependencies changed during hold
            // if (eKeyHoldTimerRef.current) {
            //     console.log(`[E-Timer] *** USEEFFECT CLEANUP CLEARING TIMER *** Timer ID: ${eKeyHoldTimerRef.current}`);
            //     clearTimeout(eKeyHoldTimerRef.current as number);
            //     eKeyHoldTimerRef.current = null;
            // }
        };
    }, [canvasRef, localPlayer?.isDead, placementInfo, jump, attemptSwing, setIsMinimapOpen, isChatting, isSearchingCraftRecipes, isInventoryOpen, isGameMenuOpen, isFishing, movementDirection]);

    // Auto-walk functionality removed - movement handled by usePredictedMovement hook

    // Movement throttling refs
    const lastMovementUpdateRef = useRef<number>(0);
    const MOVEMENT_UPDATE_INTERVAL_MS = 50; // Limit movement updates to 20fps (every 50ms)

    // --- Function to process inputs and call actions (called by game loop) ---
    const processInputsAndActions = useCallback(() => {
        const currentConnection = connectionRef.current;
        const currentLocalPlayer = localPlayerRef.current;
        const currentActiveEquipments = activeEquipmentsRef.current;

        if (!currentConnection?.reducers || !localPlayerId || !currentLocalPlayer) {
            return; // Early return if dependencies aren't ready
        }

        // Get input disabled state based ONLY on player death
        const isInputDisabledState = currentLocalPlayer.isDead;

        // Input is disabled if the player is dead
        // Do not process any game-related input if disabled
        if (isInputDisabledState) {
            return; // Early return - player is dead, skip all input processing
        }

        // MODIFIED: Skip most input processing if player is dead or chatting/searching
        // BUT allow auto-attack to continue in the background for AFK harvesting
        if (!currentLocalPlayer || currentLocalPlayer.isDead || isChatting || isSearchingCraftRecipes) {
            // NOTE: Auto-attack intentionally NOT cancelled when UI is open
            // This allows auto-attack to persist through menus for AFK harvesting
            
            // Also clear jump offset if player is dead or UI is active
            if (currentJumpOffsetYRef.current !== 0) {
                currentJumpOffsetYRef.current = 0;
            }
            
            // Still process auto-attack even when UI is open (but not when dead)
            if (isAutoAttacking && !currentLocalPlayer?.isDead && !placementInfo && !isFishing) {
                attemptSwing();
            }
            return;
        }

        // --- Jump Offset Calculation (moved here for per-frame update) ---
        // Note: Visual animation only, no cooldown logic (server handles that)
        if (currentLocalPlayer && currentLocalPlayer.jumpStartTimeMs > 0) {
            // Server handles all jump cooldown logic - we just show visual animation
            const jumpStartTime = Number(currentLocalPlayer.jumpStartTimeMs);
            const playerId = currentLocalPlayer.identity.toHexString();

            // Check if this is a NEW jump by comparing server timestamps
            const lastKnownServerTime = lastKnownServerJumpTimes.current.get(playerId) || 0;

            if (jumpStartTime !== lastKnownServerTime) {
                // NEW jump detected! Record both server time and client time
                lastKnownServerJumpTimes.current.set(playerId, jumpStartTime);
                clientJumpStartTimes.current.set(playerId, Date.now());
            }

            // Calculate animation based on client time for smooth animation
            const clientStartTime = clientJumpStartTimes.current.get(playerId);
            if (clientStartTime) {
                const elapsedJumpTime = Date.now() - clientStartTime;

                if (elapsedJumpTime < JUMP_DURATION_MS) {
                    const t = elapsedJumpTime / JUMP_DURATION_MS;
                    const jumpOffset = Math.sin(t * Math.PI) * JUMP_HEIGHT_PX;
                    currentJumpOffsetYRef.current = jumpOffset;
                } else {
                    currentJumpOffsetYRef.current = 0; // Animation finished
                }
            }
        } else {
            // No jump active - clean up
            if (currentLocalPlayer) {
                const playerId = currentLocalPlayer.identity.toHexString();
                clientJumpStartTimes.current.delete(playerId);
                lastKnownServerJumpTimes.current.delete(playerId);
            }
            currentJumpOffsetYRef.current = 0;
        }
        // --- End Jump Offset Calculation ---

        // Handle continuous swing check (removed movement tracking for weapons)
        // NOTE: Continuous swing (holding left mouse) now works regardless of inventory UI state
        // This enables chopping wood/mining while managing inventory (same behavior as auto-attack)
        if (isMouseDownRef.current && !placementInfo && !isChatting && !isSearchingCraftRecipes) {
            // 🎣 FISHING INPUT FIX: Disable continuous swing while fishing
            if (!isFishing) {
                // Check if this is an automatic ranged weapon being held down
                const localPlayerActiveEquipment = localPlayerId ? activeEquipmentsRef.current?.get(localPlayerId) : undefined;
                if (localPlayerActiveEquipment?.equippedItemDefId && itemDefinitionsRef.current) {
                    const equippedItemDef = itemDefinitionsRef.current.get(String(localPlayerActiveEquipment.equippedItemDefId));
                    
                    if (equippedItemDef?.category?.tag === "RangedWeapon") {
                        // Check if this is an automatic weapon
                        const weaponStats = rangedWeaponStatsRef.current?.get(equippedItemDef.name || '');
                        
                        if (weaponStats?.isAutomatic && localPlayerActiveEquipment.isReadyToFire) {
                            // AUTOMATIC WEAPON AUTO-FIRE: Fire continuously while holding mouse button
                            const now = performance.now();
                            const fireIntervalMs = (weaponStats.reloadTimeSecs || 0.1) * 1000; // Convert to ms
                            
                            if (now - lastRangedFireTimeRef.current >= fireIntervalMs) {
                                // Fire the weapon
                                const currentPlayer = localPlayerRef.current;
                                const exactPos = getCurrentPositionNowRef.current?.();
                                const fallbackPos = predictedPositionRef.current;
                                
                                if (connectionRef.current?.reducers && 
                                    worldMousePosRefInternal.current.x !== null && 
                                    worldMousePosRefInternal.current.y !== null && 
                                    currentPlayer) {
                                    const fireX = exactPos?.x ?? fallbackPos?.x ?? currentPlayer.positionX;
                                    const fireY = exactPos?.y ?? fallbackPos?.y ?? currentPlayer.positionY;
                                    connectionRef.current.reducers.fireProjectile(
                                        worldMousePosRefInternal.current.x,
                                        worldMousePosRefInternal.current.y,
                                        fireX,
                                        fireY
                                    );
                                    lastRangedFireTimeRef.current = now;
                                }
                            }
                        }
                        // Don't call attemptSwing for ranged weapons (they don't swing)
                    } else {
                        // Non-ranged weapon: use normal swing
                        attemptSwing();
                    }
                } else {
                    // No equipped item or item defs not loaded: use normal swing (unarmed)
                    attemptSwing();
                }
            }
        }

        // Handle auto-attack
        // NOTE: Auto-attack works regardless of UI state (inventory, chat, etc.)
        // This enables AFK harvesting of trees/ores while managing inventory
        if (isAutoAttacking && !placementInfo) {
            // 🎣 FISHING INPUT FIX: Disable auto-attack while fishing
            if (!isFishing) {
                attemptSwing(); // Call internal attemptSwing function for auto-attack
            }
        }
    }, [
        isPlayerDead, attemptSwing, placementInfo,
        localPlayerId, localPlayer, activeEquipments, worldMousePos, connection,
        closestInteractableTarget, onSetInteractingWith,
        isChatting, isSearchingCraftRecipes, setIsMinimapOpen, isInventoryOpen,
        isAutoAttacking, isFishing, movementDirection
    ]);

    // Helper function to check if an item is throwable
    const isItemThrowable = useCallback((itemDef: SpacetimeDB.ItemDefinition | undefined): boolean => {
        if (!itemDef) {
            // console.log("[isItemThrowable] No item definition provided");
            return false;
        }

        // console.log("[isItemThrowable] Checking item:", itemDef.name, "category:", itemDef.category);

        // Don't allow throwing ranged weapons, bandages, or consumables
        if (itemDef.category?.tag === "RangedWeapon") {
            // console.log("[isItemThrowable] Rejected: RangedWeapon");
            return false;
        }
        if (itemDef.name === "Bandage" || itemDef.name === "Selo Olive Oil") {
            // console.log("[isItemThrowable] Rejected: Bandage/Selo Olive Oil");
            return false;
        }
        if (itemDef.name === "Torch") {
            // console.log("[isItemThrowable] Rejected: Torch");
            return false;
        }

        // Allow throwing tools and melee weapons
        const throwableNames = [
            "Rock", "Spear", "Stone Hatchet", "Stone Pickaxe", "Combat Ladle",
            "Bone Club", "Bone Knife", "Stone Spear", "Wooden Spear",
            "Stone Axe", "Stone Knife", "Wooden Club", "Improvised Knife", "Bone Gaff Hook",
            "Bush Knife"
        ];

        const nameMatch = throwableNames.includes(itemDef.name);
        const categoryMatch = itemDef.category?.tag === "Weapon" || itemDef.category?.tag === "Tool";

        // console.log("[isItemThrowable] Name match:", nameMatch, "Category match:", categoryMatch);
        // console.log("[isItemThrowable] Category tag:", itemDef.category?.tag);

        const result = nameMatch || categoryMatch;
        // console.log("[isItemThrowable] Final result:", result);

        return result;
    }, []);

    // ADDED: Helper function to check if Blueprint is equipped
    const isBlueprintEquipped = useCallback(() => {
        if (!localPlayerId || !activeEquipmentsRef.current || !itemDefinitionsRef.current) return false;
        const equipment = activeEquipmentsRef.current.get(localPlayerId);
        if (!equipment?.equippedItemDefId) return false;
        const itemDef = itemDefinitionsRef.current.get(String(equipment.equippedItemDefId));
        return itemDef?.name === 'Blueprint';
    }, [localPlayerId]);

    // ADDED: Only show radial menu if Blueprint is equipped
    const shouldShowRadialMenu = showBuildingRadialMenu && isBlueprintEquipped();

    // --- Return State & Actions ---
    return {
        interactionProgress,
        isActivelyHolding,
        currentJumpOffsetY: currentJumpOffsetYRef.current, // Return current ref value
        isAutoAttacking,
        isCrouching, // Include local crouch state
        // ADDED: Building radial menu state
        showBuildingRadialMenu: shouldShowRadialMenu,
        radialMenuMouseX,
        radialMenuMouseY,
        setShowBuildingRadialMenu, // Expose setter so parent can close menu
        showUpgradeRadialMenu,
        setShowUpgradeRadialMenu,
        processInputsAndActions,
    };
}; 