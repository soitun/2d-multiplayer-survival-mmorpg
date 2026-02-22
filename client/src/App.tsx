/**
 * App - Main application root and screen coordinator.
 *
 * Top-level component that initializes core hooks, manages connection/registration
 * state, and conditionally renders LoginScreen or GameScreen. Passes entity data
 * and action callbacks down to GameScreen → GameCanvas.
 *
 * Responsibilities:
 * 1. HOOKS: useGameConnection, useSpacetimeTables, usePlacementManager,
 *    useDragDropManager, useInteractionManager, useMovementInput, usePredictedMovement,
 *    useSoundSystem, useMusicSystem, useAssetLoader, etc.
 *
 * 2. ROUTING: LoginScreen when not connected/registered; GameScreen when in-game.
 *    CyberpunkLoadingScreen during asset preload.
 *
 * 3. ERROR DISPLAY: useErrorDisplay for global connection/UI errors.
 *
 * 4. STATE FLOW: Entity maps and callbacks flow App → GameScreen → GameCanvas.
 *    No direct SpacetimeDB subscriptions in child components.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

// Components
import LoginScreen from './components/LoginScreen';
import GameScreen from './components/GameScreen';
import CyberpunkLoadingScreen from './components/CyberpunkLoadingScreen';

// Blog Components
import BlogPage from './blog/BlogPage';
import BlogPostPage from './blog/BlogPostPage';

// Legal Pages
import PrivacyPage from './components/PrivacyPage';
import TermsPage from './components/TermsPage';
import CookiesPage from './components/CookiesPage';
import AIDisclosurePage from './components/AIDisclosurePage';

// Context Providers
import { GameContextsProvider } from './contexts/GameContexts';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DebugProvider } from './contexts/DebugContext';

// Hooks
import { useGameConnection } from './contexts/GameConnectionContext';
import { usePlayerActions } from './contexts/PlayerActionsContext';
import { useSpacetimeTables } from './hooks/useSpacetimeTables';
import { usePlacementManager } from './hooks/usePlacementManager';
import { useDragDropManager } from './hooks/useDragDropManager';
import { useInteractionManager } from './hooks/useInteractionManager';
import { useAuthErrorHandler } from './hooks/useAuthErrorHandler';
import { useMovementInput } from './hooks/useMovementInput';
import { usePredictedMovement } from './hooks/usePredictedMovement';
import { useSoundSystem, playImmediateSound } from './hooks/useSoundSystem';
import { useSovaSoundBox } from './hooks/useSovaSoundBox';
import { useMusicSystem } from './hooks/useMusicSystem';
import { useMobileDetection } from './hooks/useMobileDetection';
import { useErrorDisplay } from './contexts/ErrorDisplayContext';
import { useSettings } from './contexts/SettingsContext';

// Asset Preloading
import { preloadAllAssets, areAllAssetsPreloaded, AssetLoadingProgress } from './services/assetPreloader';
import { getTileTypeFromChunkData } from './utils/renderers/placementRenderingUtils';

// Assets & Styles
import './App.css';
import { useDebouncedCallback } from 'use-debounce'; // Import debounce helper

// Viewport constants
const VIEWPORT_WIDTH = 1200;
const VIEWPORT_HEIGHT = 800;
const VIEWPORT_BUFFER = 300;
const VIEWPORT_UPDATE_THRESHOLD_SQ = (VIEWPORT_WIDTH / 2) ** 2; // Increased threshold (was WIDTH/4), so updates happen less frequently
const VIEWPORT_UPDATE_DEBOUNCE_MS = 750; // Increased debounce time (was 250ms) to reduce update frequency

// Auto-close interaction when player moves too far from container
import { useInteractionAutoClose } from './hooks/useInteractionAutoClose';

// Import the cut grass effect system
import { initCutGrassEffectSystem, cleanupCutGrassEffectSystem } from './effects/cutGrassEffect';
import { filterVisibleEntities, filterVisibleTrees } from './utils/entityFilteringUtils';
import { resetBrothEffectsState } from './utils/renderers/brothEffectsOverlayUtils';
import { resetInsanityState } from './utils/renderers/insanityOverlayUtils';

// Graceful error boundary that logs errors but doesn't crash the app
class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: any; hasError: boolean }> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { error: null, hasError: false };
    }

    static getDerivedStateFromError(error: any) {
        // Log the error but don't set hasError to true - let the app continue
        console.error('[AppErrorBoundary] Error caught:', error);
        return { error, hasError: false }; // Don't show error UI, just log it
    }

    componentDidCatch(error: any, info: any) {
        // Log detailed error info for debugging
        console.error('[AppErrorBoundary] Detailed error:', error, info);
        // Optionally send to error tracking service here
    }

    render() {
        // Always render children - errors are logged but don't crash the app
        return this.props.children;
    }
}

function AppContent() {
    // --- Global Auth Error Handler ---
    useAuthErrorHandler(); // This will automatically handle 401 errors and invalidate tokens
    
    // --- Auth Hook ---
    const { 
        userProfile, 
        isAuthenticated, 
        isLoading: authLoading, 
        loginRedirect,
        spacetimeToken
    } = useAuth();
    
    // --- Core Hooks --- 
    const {
        connection,
        dbIdentity, // Get the derived SpacetimeDB identity
        isConnected: spacetimeConnected, // Rename for clarity
        isLoading: spacetimeLoading, // Rename for clarity
        error: connectionError,
        registerPlayer,
        retryConnection,
    } = useGameConnection();

    // --- Player Actions ---
    const {
        updateViewport,
        updatePlayerPosition,
        setSprinting,
        stopAutoWalk,
        toggleAutoAttack,
    } = usePlayerActions();

    const [placementState, placementActions] = usePlacementManager(connection);
    const { placementInfo, placementError, placementWarning } = placementState; // Destructure state
    const { cancelPlacement, startPlacement, setPlacementWarning } = placementActions; // Destructure actions
    const { showError } = useErrorDisplay();

    const { interactingWith, handleSetInteractingWith } = useInteractionManager(connection);

    const { draggedItemInfo, dropError, handleItemDragStart, handleItemDrop } = useDragDropManager({ connection, interactingWith, playerIdentity: dbIdentity });

    // --- App-Level State --- 
    const [isRegistering, setIsRegistering] = useState<boolean>(false);
    const [uiError, setUiError] = useState<string | null>(null);
    const [isMinimapOpen, setIsMinimapOpen] = useState<boolean>(false);
    // Initial view for InterfaceContainer (e.g., 'matronage' after creating one)
    const [interfaceInitialView, setInterfaceInitialView] = useState<'minimap' | 'encyclopedia' | 'memory-grid' | 'alk' | 'cairns' | 'matronage' | 'leaderboard' | 'achievements' | undefined>(undefined);
    const [isChatting, setIsChatting] = useState<boolean>(false);
    const [isCraftingSearchFocused, setIsCraftingSearchFocused] = useState(false);
    // Auto-walking state is now managed by PlayerActionsContext via usePredictedMovement
    const [loadingSequenceComplete, setLoadingSequenceComplete] = useState<boolean>(false);
    const [isFishing, setIsFishing] = useState(false);
    
    // Asset preloading state
    const [assetProgress, setAssetProgress] = useState<AssetLoadingProgress | null>(null);
    const [assetsLoaded, setAssetsLoaded] = useState(false);
    const assetPreloadStarted = useRef(false);
    // Music panel state
    const [isMusicPanelVisible, setIsMusicPanelVisible] = useState(false);
    
    // --- Settings (audio + visual) are now in SettingsContext ---
    // Only destructure the values App.tsx actually needs for its own hooks.
    // Settings menus and GameCanvas read directly from useSettings().
    const {
        musicVolume,
        soundVolume,
        environmentalVolume,
        grassEnabled,
    } = useSettings();

    // --- Viewport State & Refs ---
    const [currentViewport, setCurrentViewport] = useState<{ minX: number, minY: number, maxX: number, maxY: number } | null>(null);
    const lastSentViewportCenterRef = useRef<{ x: number, y: number } | null>(null);
    const localPlayerRef = useRef<any>(null); // Ref to hold local player data
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    // --- Pass viewport state to useSpacetimeTables ---
    const { 
      players, trees, clouds, droneEvents, stones, runeStones, cairns, playerDiscoveredCairns, campfires, furnaces, barbecues, lanterns, turrets,
      harvestableResources,
      itemDefinitions, 
      inventoryItems, worldState, activeEquipments, droppedItems, 
      woodenStorageBoxes, recipes, craftingQueueItems, localPlayerRegistered,
      sleepingBags,
      playerCorpses,
      stashes,
      rainCollectors,
      waterPatches,
      fertilizerPatches,
      firePatches,
      placedExplosives,
      hotSprings,
      activeConsumableEffects,
      grass, // Static grass geometry
      grassState, // Dynamic grass state (health, respawn) - split tables optimization
      knockedOutStatus,
      rangedWeaponStats,
      projectiles,
      deathMarkers,
      shelters,
      plantedSeeds,
      minimapCache,
      fishingSessions,
      soundEvents,
      continuousSounds,
      localPlayerIdentity,
      playerDrinkingCooldowns,
      wildAnimals,
      hostileDeathEvents,
      animalCorpses,
      barrels,
      roadLampposts,
      fumaroles,
      basaltColumns,
      livingCorals, // Living coral for underwater harvesting (uses combat system)
      seaStacks,
      homesteadHearths,
      brothPots,
      foundationCells,
      wallCells,
      doors,
      fences,
      playerDodgeRollStates,
      chunkWeather,
      alkStations,
      alkContracts,
      alkPlayerContracts,
      alkState,
      playerShardBalance,
      memoryGridProgress,
      monumentParts,
      largeQuarries,
      playerStats,
      achievementDefinitions,
      playerAchievements,
      achievementUnlockNotifications,
      levelUpNotifications,
      dailyLoginNotifications,
      progressNotifications,
      comparativeStatNotifications,
      leaderboardEntries,
      dailyLoginRewards,
      plantConfigDefinitions,
      discoveredPlants,
      caribouBreedingData,
      walrusBreedingData,
      caribouRutState,
      walrusRutState,
    } = useSpacetimeTables({ 
        connection, 
        cancelPlacement: placementActions.cancelPlacement,
        viewport: currentViewport,
        grassEnabled, // Pass grass toggle to control subscriptions
    });

    // --- Movement Hooks ---
    const isUIFocused = isChatting || isCraftingSearchFocused;
    const localPlayer = dbIdentity ? players.get(dbIdentity.toHexString()) : undefined;
    const isDead = localPlayer?.isDead ?? false;
    
    // --- Calculate Water Speed Bonus from Equipped Armor ---
    // This value is passed to usePredictedMovement for client-side movement prediction
    const waterSpeedBonus = useMemo(() => {
        if (!dbIdentity) return 0;
        
        // Get active equipment for local player
        const activeEquip = activeEquipments.get(dbIdentity.toHexString());
        if (!activeEquip) return 0;
        
        let totalBonus = 0;
        
        // List of all armor slot instance IDs to check
        const armorSlotInstanceIds = [
            activeEquip.headItemInstanceId,
            activeEquip.chestItemInstanceId,
            activeEquip.legsItemInstanceId,
            activeEquip.feetItemInstanceId, // Reed Flippers go here
            activeEquip.handsItemInstanceId,
            activeEquip.backItemInstanceId,
        ].filter((id): id is bigint => id !== undefined);
        
        // For each equipped armor piece, look up its definition and add bonus
        for (const instanceId of armorSlotInstanceIds) {
            // Find the inventory item
            const inventoryItem = Array.from(inventoryItems.values()).find(
                item => item.instanceId === instanceId
            );
            if (!inventoryItem) continue;
            
            // Find the item definition
            const itemDef = Array.from(itemDefinitions.values()).find(
                def => def.id === inventoryItem.itemDefId
            );
            if (!itemDef) continue;
            
            // Add water speed bonus if present (will be available after regenerating bindings)
            const bonus = (itemDef as any).waterSpeedBonus;
            if (typeof bonus === 'number') {
                totalBonus += bonus;
            }
        }
        
        return totalBonus;
    }, [dbIdentity, activeEquipments, inventoryItems, itemDefinitions]);
    
    // --- SOVA Sound Box Hook (for deterministic SOVA voice notifications) ---
    const { showSovaSoundBox, hideSovaSoundBox, revealSovaSoundBoxUI, SovaSoundBoxComponent } = useSovaSoundBox();
    
    // This allows them to access sovaMessageAdder for automatic tab switching/flashing
    
    // --- Mobile Detection ---
    const isMobile = useMobileDetection();
    
    // --- Mobile Tap-to-Walk State ---
    const [tapTarget, setTapTarget] = useState<{ x: number; y: number } | null>(null);
    const [tapAnimation, setTapAnimation] = useState<{ x: number; y: number; startTime: number } | null>(null);
    const TAP_ARRIVAL_THRESHOLD = 16; // Stop when within 16px of destination
    
    // --- Mobile Sprint Override State ---
    // On mobile: always run by default (no walking - screen is smaller). Desktop: undefined (use server state).
    // This is set immediately when mobile sprint button is pressed (no server round-trip)
    const [mobileSprintOverride, setMobileSprintOverride] = useState<boolean | undefined>(undefined);
    
    // Simplified movement input - no complex processing
    // PERFORMANCE FIX: Also get inputStateRef for immediate RAF loop reading
    const { inputState: keyboardInputState, inputStateRef: keyboardInputStateRef, isAutoWalking } = useMovementInput({ 
        isUIFocused: isUIFocused || isDead, // Disable input when dead
        localPlayer,
        onToggleAutoAttack: toggleAutoAttack,
        isFishing,
    });
    
    // Calculate tap-to-walk direction if on mobile and has tap target
    // Uses localPlayer position (server-authoritative) for calculation
    const tapDirection = useMemo(() => {
        if (!isMobile || !tapTarget || !localPlayer) {
            return { x: 0, y: 0 };
        }
        
        const playerX = localPlayer.positionX;
        const playerY = localPlayer.positionY;
        const dx = tapTarget.x - playerX;
        const dy = tapTarget.y - playerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Arrived at destination
        if (distance <= TAP_ARRIVAL_THRESHOLD) {
            return { x: 0, y: 0 };
        }
        
        // Normalize direction
        return {
            x: dx / distance,
            y: dy / distance,
        };
    }, [isMobile, tapTarget, localPlayer, TAP_ARRIVAL_THRESHOLD]);
    
    // Clear tap target when arrived (checked after movement)
    useEffect(() => {
        if (!isMobile || !tapTarget || !localPlayer) return;
        
        const dx = tapTarget.x - localPlayer.positionX;
        const dy = tapTarget.y - localPlayer.positionY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance <= TAP_ARRIVAL_THRESHOLD) {
            setTapTarget(null);
        }
    }, [isMobile, tapTarget, localPlayer, TAP_ARRIVAL_THRESHOLD]);
    
    // Merge keyboard and tap-to-walk input (tap takes precedence when active)
    const inputState = useMemo(() => {
        // If on mobile and tap direction is active, use tap direction
        if (isMobile && (tapDirection.x !== 0 || tapDirection.y !== 0)) {
            return {
                direction: tapDirection,
                sprinting: keyboardInputState.sprinting, // Keep sprint from keyboard
            };
        }
        // Otherwise use keyboard input
        return keyboardInputState;
    }, [isMobile, tapDirection, keyboardInputState]);
    
    // Handle mobile tap event from GameCanvas
    const handleMobileTap = useCallback((worldX: number, worldY: number) => {
        if (!isMobile) return;
        
        setTapTarget({ x: worldX, y: worldY });
        setTapAnimation({ x: worldX, y: worldY, startTime: performance.now() });
        
        // Clear animation after duration
        setTimeout(() => {
            setTapAnimation(null);
        }, 500);
    }, [isMobile]);
    
    // Mobile: run by default (no walking - screen is smaller). Set override on mount when isMobile.
    useEffect(() => {
        if (isMobile) {
            setMobileSprintOverride(true);
            // Server sync: ensure sprint state is persisted
            if (connection?.reducers) {
                try {
                    connection.reducers.setSprinting(true);
                } catch { /* ignore */ }
            }
        } else {
            setMobileSprintOverride(undefined);
        }
    }, [isMobile, connection]);
    
    // PERFORMANCE FIX: Memoize collision entities to prevent recreating filtered Maps on every render.
    // Previously, filterVisibleTrees/filterVisibleEntities ran and allocated new Maps on EVERY render
    // (including unrelated state changes like matronage updates), causing usePredictedMovement
    // to see new object references and recalculate collision data unnecessarily.
    const collisionEntities = useMemo(() => {
        const viewBounds = currentViewport ? {
            viewMinX: currentViewport.minX,
            viewMinY: currentViewport.minY,
            viewMaxX: currentViewport.maxX,
            viewMaxY: currentViewport.maxY
        } : null;
        return {
            trees: viewBounds ? new Map(filterVisibleTrees(trees, viewBounds, Date.now()).map(t => [t.id.toString(), t])) : new Map(),
            stones,
            runeStones: viewBounds ? new Map(filterVisibleEntities(runeStones, viewBounds, Date.now()).map(rs => [rs.id.toString(), rs])) : new Map(),
            cairns: viewBounds ? new Map(filterVisibleEntities(cairns, viewBounds, Date.now()).map(c => [c.id.toString(), c])) : new Map(),
            boxes: woodenStorageBoxes,
            rainCollectors,
            furnaces,
            barbecues,
            shelters,
            players,
            wildAnimals,
            barrels,
            roadLampposts,
            seaStacks,
            wallCells,
            foundationCells,
            homesteadHearths,
            basaltColumns,
            livingCorals,
            doors,
            fences,
            alkStations,
            lanterns,
            turrets,
            monumentParts: monumentParts ?? new Map()
        };
    }, [currentViewport, trees, stones, runeStones, cairns, woodenStorageBoxes, rainCollectors,
        furnaces, barbecues, shelters, players, wildAnimals, barrels, roadLampposts, seaStacks, wallCells,
        foundationCells, homesteadHearths, basaltColumns, livingCorals, doors, fences,
        alkStations, lanterns, turrets, monumentParts]);

    // Simplified predicted movement - minimal lag
    // PERFORMANCE FIX: Pass inputStateRef for immediate input reading in RAF loop (bypasses React state delay)
    const { predictedPosition, getCurrentPositionNow, isAutoAttacking, facingDirection } = usePredictedMovement({
        localPlayer,
        inputState,
        inputStateRef: isMobile ? undefined : keyboardInputStateRef, // Only use ref for desktop (mobile uses tap-to-walk via prop)
        connection,
        isUIFocused,
        playerDodgeRollStates, // Add dodge roll states for speed calculation
        mobileSprintOverride, // Mobile sprint toggle override (immediate, no server round-trip)
        waterSpeedBonus, // Water speed bonus from equipped armor (e.g., Reed Flippers)
        entities: collisionEntities
    });

    // --- Sound System ---
    const localPlayerPosition = predictedPosition ? { x: predictedPosition.x, y: predictedPosition.y } : null;
    const soundSystemState = useSoundSystem({
        soundEvents,
        continuousSounds,
        localPlayerPosition,
        localPlayerIdentity,
        masterVolume: soundVolume,
        environmentalVolume: environmentalVolume,
        chunkWeather, // Pass chunk weather to filter rain sounds based on player's location
        currentSeason: worldState?.currentSeason, // Pass season to mute rain sounds in winter (snow is silent)
    });

    // --- Register Refrigerator Reducer Error Callbacks ---
    // Play error sound and show error when refrigerator/compost/harvestable reducers fail
    useEffect(() => {
        if (!connection?.reducers) return;

        const handleContainerError = (containerType: string, errorMsg: string) => {
            console.log(`[App] ${containerType} validation failed:`, errorMsg);
            playImmediateSound('construction_placement_error', 1.0);
            showError(errorMsg.length > 80 ? errorMsg.slice(0, 77) + '…' : errorMsg);
        };

        // Register error callbacks for all refrigerator reducers
        if (connection.reducers.onMoveItemToRefrigerator) {
            connection.reducers.onMoveItemToRefrigerator((ctx: any, boxId: number, targetSlotIndex: number, itemInstanceId: bigint) => {
                const status = ctx.event?.status;
                if (status?.tag === 'Failed') {
                    handleContainerError('Refrigerator', status.value || 'Cannot move item to refrigerator');
                }
            });
        }

        if (connection.reducers.onQuickMoveToRefrigerator) {
            connection.reducers.onQuickMoveToRefrigerator((ctx: any, boxId: number, itemInstanceId: bigint) => {
                const status = ctx.event?.status;
                if (status?.tag === 'Failed') {
                    handleContainerError('Refrigerator', status.value || 'Cannot move item to refrigerator');
                }
            });
        }

        if (connection.reducers.onSplitStackIntoRefrigerator) {
            connection.reducers.onSplitStackIntoRefrigerator((ctx: any, boxId: number, targetSlotIndex: number, sourceItemInstanceId: bigint, quantityToSplit: number) => {
                const status = ctx.event?.status;
                if (status?.tag === 'Failed') {
                    handleContainerError('Refrigerator', status.value || 'Cannot split into refrigerator');
                }
            });
        }

        // Register error callbacks for all compost reducers
        if (connection.reducers.onMoveItemToCompost) {
            connection.reducers.onMoveItemToCompost((ctx: any, boxId: number, targetSlotIndex: number, itemInstanceId: bigint) => {
                const status = ctx.event?.status;
                if (status?.tag === 'Failed') {
                    handleContainerError('Compost', status.value || 'Cannot move item to compost');
                }
            });
        }

        if (connection.reducers.onQuickMoveToCompost) {
            connection.reducers.onQuickMoveToCompost((ctx: any, boxId: number, itemInstanceId: bigint) => {
                const status = ctx.event?.status;
                if (status?.tag === 'Failed') {
                    handleContainerError('Compost', status.value || 'Cannot move item to compost');
                }
            });
        }

        if (connection.reducers.onSplitStackIntoCompost) {
            connection.reducers.onSplitStackIntoCompost((ctx: any, boxId: number, targetSlotIndex: number, sourceItemInstanceId: bigint, quantityToSplit: number) => {
                const status = ctx.event?.status;
                if (status?.tag === 'Failed') {
                    handleContainerError('Compost', status.value || 'Cannot split into compost');
                }
            });
        }

        // Register error callback for harvestable resource interactions (e.g., seaweed harvest without snorkeling)
        if (connection.reducers.onInteractWithHarvestableResource) {
            connection.reducers.onInteractWithHarvestableResource((ctx: any, resourceId: bigint) => {
                const status = ctx.event?.status;
                if (status?.tag === 'Failed') {
                    const errorMsg = status.value || 'Cannot harvest resource';
                    console.log(`[App] interactWithHarvestableResource failed:`, errorMsg);
                    // Skip "too far away" - player can't reach this state through normal interaction (E only shows when in range)
                    if (errorMsg.toLowerCase().includes('too far')) return;
                    // Skip "already harvested" - not useful for gameplay; player can see the resource is depleted
                    if (errorMsg.toLowerCase().includes('already been harvested') || errorMsg.toLowerCase().includes('respawning')) return;
                    if (errorMsg.includes('underwater') || errorMsg.includes('snorkeling') || errorMsg.includes('seaweed')) {
                        playImmediateSound('error_seaweed_above_water', 1.0);
                    }
                    showError(errorMsg.length > 80 ? errorMsg.slice(0, 77) + '…' : errorMsg);
                }
            });
        }
    }, [connection, showError]);

    // --- Music System ---
    // Get player position for zone-based music (uses predicted position if available)
    const playerMusicPosition = useMemo(() => {
        if (!localPlayer) return null;
        // Use position from localPlayer (predicted position is handled in movement hooks)
        return {
            x: localPlayer.positionX,
            y: localPlayer.positionY
        };
    }, [localPlayer?.positionX, localPlayer?.positionY]);

    const musicSystem = useMusicSystem({
        enabled: true,
        volume: musicVolume,
        crossfadeDuration: 3000, // 3 second crossfade
        shuffleMode: true,
        preloadAll: true,
        // Pass player position and monument parts for zone-based music
        playerPosition: playerMusicPosition,
        monumentParts: monumentParts, // Music system will filter by monument type internally
        alkStations: alkStations, // ALK stations for zone detection
        getTileTypeAtPosition: connection ? (tx, ty) => getTileTypeFromChunkData(connection, tx, ty) : undefined,
    });
    
    // Update music volume when state changes
    useEffect(() => {
        if (musicSystem.setVolume) {
            musicSystem.setVolume(musicVolume);
        }
    }, [musicVolume, musicSystem.setVolume]);

    // --- Asset Preloading ---
    useEffect(() => {
        // Only start preloading once
        if (assetPreloadStarted.current) return;
        assetPreloadStarted.current = true;
        
        // In dev mode, skip the loading screen - assets load on-demand via browser cache
        if (import.meta.env.DEV) {
            console.log('[App] DEV mode - skipping asset preloading (assets load on-demand)');
            setAssetsLoaded(true);
            setAssetProgress({
                phase: 'complete',
                phaseName: 'Dev Mode',
                phaseProgress: 1,
                totalProgress: 1,
                loadedCount: 0,
                totalCount: 0,
                currentAsset: 'Skipped in dev',
                fromCache: 0,
            });
            return;
        }
        
        // Fast path: If all assets are already in memory (reconnect / remount),
        // skip the entire preload process and mark as complete immediately.
        if (areAllAssetsPreloaded()) {
            console.log('[App] 🚀 Assets already in memory cache - skipping preload!');
            setAssetsLoaded(true);
            setAssetProgress({
                phase: 'complete',
                phaseName: 'Cached',
                phaseProgress: 1,
                totalProgress: 1,
                loadedCount: 0,
                totalCount: 0,
                currentAsset: 'All assets cached',
                fromCache: 0,
            });
            return;
        }
        
        console.log('[App] Starting asset preloading...');
        
        preloadAllAssets((progress) => {
            setAssetProgress(progress);
            
            if (progress.phase === 'complete') {
                console.log('[App] ✅ Asset preloading complete!');
                setAssetsLoaded(true);
            }
        }).catch((error) => {
            console.error('[App] Asset preloading failed:', error);
            // Still mark as loaded to not block the game
            setAssetsLoaded(true);
        });
    }, []); // Empty deps - run once on mount

    // Performance monitor removed - all logging was disabled and the recursive RAF loop
    // was still consuming CPU cycles. It also restarted on players.size/connection changes,
    // creating orphaned loops (no cleanup was implemented despite using requestAnimationFrame).
    // Re-enable via browser DevTools Performance tab when profiling is needed.

    // Note: Movement is now handled entirely by usePredictedMovement hook
    // No need for complex movement processing in App.tsx anymore

    // --- Refs for Cross-Hook/Component Communication --- 
    // Ref for Placement cancellation needed by useSpacetimeTables callbacks
    const cancelPlacementActionRef = useRef(cancelPlacement);
    useEffect(() => {
        cancelPlacementActionRef.current = cancelPlacement;
    }, [cancelPlacement]);
    // Ref for placementInfo needed for global context menu effect
    const placementInfoRef = useRef(placementInfo);
    useEffect(() => {
        placementInfoRef.current = placementInfo;
    }, [placementInfo]);

    // --- Debounced Viewport Update ---
    const debouncedUpdateViewport = useDebouncedCallback(
        (vp: { minX: number, minY: number, maxX: number, maxY: number }) => {
            updateViewport(vp.minX, vp.minY, vp.maxX, vp.maxY);
            lastSentViewportCenterRef.current = { x: (vp.minX + vp.maxX) / 2, y: (vp.minY + vp.maxY) / 2 };
        },
        VIEWPORT_UPDATE_DEBOUNCE_MS
    );

    // Track previous player state to detect respawns
    const prevPlayerStateRef = useRef<{ isDead: boolean; positionX: number; positionY: number } | null>(null);

    // --- Effect to Update Viewport Based on Player Position ---
    useEffect(() => {
        const localPlayer = connection?.identity ? players.get(connection.identity.toHexString()) : undefined;
        localPlayerRef.current = localPlayer; // Update ref whenever local player changes

        // If player is gone, dead, or not fully connected yet, clear viewport
        if (!localPlayer || localPlayer.isDead) {
             if (currentViewport) setCurrentViewport(null);
             // Consider if we need to tell the server the viewport is invalid?
             // Server might time out old viewports anyway.
             prevPlayerStateRef.current = localPlayer ? { isDead: localPlayer.isDead, positionX: localPlayer.positionX, positionY: localPlayer.positionY } : null;
             return;
        }

        const playerCenterX = localPlayer.positionX;
        const playerCenterY = localPlayer.positionY;

        // Detect respawn: player was dead and is now alive
        const prevState = prevPlayerStateRef.current;
        const wasDead = prevState?.isDead ?? false;
        const isAlive = !localPlayer.isDead;
        const respawnDetected = wasDead && isAlive;

        // Check if viewport center moved significantly enough
        const lastSentCenter = lastSentViewportCenterRef.current;
        const shouldUpdate = !lastSentCenter ||
            respawnDetected || // Force update on respawn
            (playerCenterX - lastSentCenter.x)**2 + (playerCenterY - lastSentCenter.y)**2 > VIEWPORT_UPDATE_THRESHOLD_SQ;

        if (shouldUpdate) {
            const newMinX = playerCenterX - (VIEWPORT_WIDTH / 2) - VIEWPORT_BUFFER;
            const newMaxX = playerCenterX + (VIEWPORT_WIDTH / 2) + VIEWPORT_BUFFER;
            const newMinY = playerCenterY - (VIEWPORT_HEIGHT / 2) - VIEWPORT_BUFFER;
            const newMaxY = playerCenterY + (VIEWPORT_HEIGHT / 2) + VIEWPORT_BUFFER;
            const newViewport = { minX: newMinX, minY: newMinY, maxX: newMaxX, maxY: newMaxY };

            setCurrentViewport(newViewport); // Update local state immediately for useSpacetimeTables
            debouncedUpdateViewport(newViewport); // Call debounced server update
            
            // Update last sent center immediately to prevent continuous updates
            lastSentViewportCenterRef.current = { x: playerCenterX, y: playerCenterY };
                
            // Reset overlay states ONLY on actual respawn (dead -> alive transition)
            if (respawnDetected) {
                console.log('[App] Respawn detected - resetting overlay states');
                resetBrothEffectsState();
                resetInsanityState();
            }
        }
        
        // Update previous state tracking
        prevPlayerStateRef.current = { isDead: localPlayer.isDead, positionX: playerCenterX, positionY: playerCenterY };
    // Depend on the players map (specifically the local player's position), connection identity, and app connected status.
    }, [players, connection?.identity, debouncedUpdateViewport]); // Removed currentViewport dependency to avoid loops

    // --- Effect to initialize and cleanup cut grass effect system ---
    useEffect(() => {
        if (connection && localPlayerRegistered) {
            initCutGrassEffectSystem(connection);

            return () => {
                cleanupCutGrassEffectSystem();
            };
        }
    }, [connection, localPlayerRegistered]);

    // --- Action Handlers will be defined after loggedInPlayer is available ---

    // --- Global Window Effects --- 
    useEffect(() => {
        // Prevent global context menu unless placing item
        const handleGlobalContextMenu = (event: MouseEvent) => {
            // Don't prevent context menu when dragging sliders or if game menu is open
            if (document.body.style.cursor === 'grabbing') {
                return;
            }
            
            if (!placementInfoRef.current) { // Use ref to check current placement status
                event.preventDefault();
            }
        };
        window.addEventListener('contextmenu', handleGlobalContextMenu);
        return () => {
            window.removeEventListener('contextmenu', handleGlobalContextMenu);
        };
    }, []); // Empty dependency array: run only once on mount

    // --- Effect to handle global key presses that aren't directly game actions ---
    useEffect(() => {
        const handleGlobalKeyDown = (event: KeyboardEvent) => {
            // If chat is active, let the Chat component handle Enter/Escape
            if (isChatting) return;

            // Don't handle keys when dragging sliders
            if (document.body.style.cursor === 'grabbing') {
                return;
            }

            // Auto-walk functionality removed

            // Prevent global context menu unless placing item (moved from other effect)
            if (event.key === 'ContextMenu' && !placementInfoRef.current) {
                event.preventDefault();
            }

            // Other global keybinds could go here if needed
        };

        // Prevent global context menu unless placing item (separate listener for clarity)
        const handleGlobalContextMenu = (event: MouseEvent) => {
            // Don't prevent context menu when dragging sliders
            if (document.body.style.cursor === 'grabbing') {
                return;
            }
            
            if (!placementInfoRef.current) { // Use ref to check current placement status
                event.preventDefault();
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        window.addEventListener('contextmenu', handleGlobalContextMenu);

        return () => {
            window.removeEventListener('keydown', handleGlobalKeyDown);
            window.removeEventListener('contextmenu', handleGlobalContextMenu);
        };
    }, [isChatting]); // Removed isAutoWalking dependency

    // --- Effect to manage registration state based on table hook --- 
    useEffect(() => {
         if (localPlayerRegistered && isRegistering) {
             setIsRegistering(false);
         }
         // Auto-walk functionality removed
         // Maybe add logic here if registration fails?
         // Currently, errors are shown via connectionError or uiError
    }, [localPlayerRegistered, isRegistering]);

    // --- Automatically clear interactionTarget if player moves too far ---
    useInteractionAutoClose({
        interactingWith,
        handleSetInteractingWith,
        connectionIdentity: connection?.identity,
        players,
        woodenStorageBoxes,
        campfires,
        furnaces,
        fumaroles,
        stashes,
        playerCorpses,
        rainCollectors,
    });

    // --- Determine overall loading state ---
    // We'll determine this after loggedInPlayer and getStoredUsername are defined
    

    // --- Handle loading sequence completion ---
    const handleSequenceComplete = useCallback(() => {
        console.log("[App] Loading sequence complete, setting loadingSequenceComplete to true");
        setLoadingSequenceComplete(true);

        // Reveal SovaSoundBox UI so user can close it if loading-screen audio is still playing
        revealSovaSoundBoxUI();

        // Start music when entering the game
        if (!musicSystem.isPlaying) {
            console.log("[App] Starting background music...");
            musicSystem.start().catch(error => {
                console.warn("[App] Failed to start music:", error);
            });
        }
    }, [musicSystem, revealSovaSoundBoxUI]);

    // Reset sequence completion when loading starts again - will be moved after shouldShowLoadingScreen is defined

    // Show placement errors in red box above hotbar (ErrorDisplay)
    // Includes overlap ("Blocked by existing structure"), unknown item type, and client-side placement failures
    const placementMessage = (placementWarning || placementError || '').trim() || null;
    useEffect(() => {
        if (placementMessage) {
            showError(placementMessage);
        }
    }, [placementMessage, showError]);
    

    // --- Find the logged-in player data from the tables --- 
    const loggedInPlayer = dbIdentity ? players.get(dbIdentity.toHexString()) ?? null : null;

    // --- Store last known player info for connection error fallback ---
    useEffect(() => {
        if (loggedInPlayer && dbIdentity) {
            const playerInfo = {
                identity: dbIdentity.toHexString(),
                username: loggedInPlayer.username,
                lastStored: Date.now()
            };
            localStorage.setItem('lastKnownPlayerInfo', JSON.stringify(playerInfo));
        }
    }, [loggedInPlayer, dbIdentity]);

    // --- Action Handlers --- 
    const handleAttemptRegisterPlayer = useCallback(async (usernameToRegister: string | null): Promise<void> => {
        setUiError(null);
        
        // SECURITY: Multiple layers of authentication validation
        // Layer 1: Basic authentication check - Must be authenticated with OpenAuth
        if (!isAuthenticated) {
            console.error("SECURITY: Attempted player registration without proper authentication.");
            const errorMessage = "Authentication required. Please sign in to access the game.";
            throw new Error(errorMessage);
        }
        
        // Layer 2: Verify we have a valid spacetime token
        if (!spacetimeToken) {
            console.error("SECURITY: No valid SpacetimeDB token available for registration.");
            const errorMessage = "Authentication error, please sign out and sign in again.";
            throw new Error(errorMessage);
        }
        
        // Layer 3: Verify SpacetimeDB connection and identity
        // NOTE: For new users after database clearing, we need to allow some flexibility here
        // The connection might be established but identity might not be set yet
        if (!connection) {
            console.error("SECURITY: No valid SpacetimeDB connection for registration.");
            const errorMessage = spacetimeLoading ? 
                "Connecting to game servers, please wait..." : 
                "Please refresh your browser to re-establish connection.";
            throw new Error(errorMessage);
        }
        
        // If we have a connection but no identity yet, wait for it to be established
        if (!dbIdentity) {
            console.warn("SpacetimeDB identity not yet established, waiting for connection to complete...");
            const errorMessage = "Establishing connection, please wait a moment...";
            throw new Error(errorMessage);
        }
        
        // Layer 4: Check SpacetimeDB connection status
        // NOTE: We allow registration attempts even if spacetimeConnected is temporarily false,
        // as long as we have a connection object and identity. This handles the case where
        // the database was cleared and the user is trying to re-register.
        if (!spacetimeConnected) {
            console.warn("SpacetimeDB connection status is false, but proceeding with registration attempt since user is authenticated and has connection identity.");
        }
        
        // Layer 5: Handle existing player reconnection vs new registration
        if (!usernameToRegister || !usernameToRegister.trim()) {
            // This could be a returning player (no username provided)
            // OR a new player who forgot to enter username
            
            // If we have no player data and no username, this is likely an error
            if (!loggedInPlayer) {
                const errorMessage = "Username cannot be empty.";
                setUiError(errorMessage);
                throw new Error(errorMessage);
            }
            // If we have loggedInPlayer data, this is a reconnection attempt
            // The server will handle existing player reconnection in the register_player reducer
        }
        
        // Layer 6: Prevent duplicate registration attempts
        if (isRegistering) {
            console.warn("Registration already in progress, ignoring duplicate request.");
            return;
        }
        
        setIsRegistering(true);
        try {
            // Call the SpacetimeDB registerPlayer reducer 
            // The server handles both new registration and existing player reconnection
            const usernameToSend = usernameToRegister?.trim() || loggedInPlayer?.username || "Player";
            await registerPlayer(usernameToSend);
        } catch (error) {
            setIsRegistering(false);
            throw error; // Re-throw to let LoginScreen handle the error display
        }
    }, [registerPlayer, isAuthenticated, spacetimeConnected, spacetimeToken, connection, dbIdentity, isRegistering, loggedInPlayer]);

    // --- Get stored username for connection error cases ---
    const getStoredUsername = useMemo(() => {
        if (connectionError && isAuthenticated && dbIdentity) {
            const stored = localStorage.getItem('lastKnownPlayerInfo');
            if (stored) {
                try {
                    const playerInfo = JSON.parse(stored);
                    // Only use if it's for the same identity and within last 7 days
                    if (playerInfo.identity === dbIdentity.toHexString() && 
                        (Date.now() - playerInfo.lastStored) < 7 * 24 * 60 * 60 * 1000) {
                        return playerInfo.username;
                    }
                } catch (e) {
                    console.warn('[App] Failed to parse stored player info:', e);
                }
            }
        }
        return null;
    }, [connectionError, isAuthenticated, dbIdentity]);

    // --- Determine loading screen visibility ---
    // Loading screen should ONLY show when:
    // 1. User is authenticated AND has existing player data AND (auth loading OR connection not ready OR sequence not complete)
    // NEW USERS (no player data) NEVER see loading screen - they wait in LoginScreen or see black screen
    const hasPlayerDataOrUsername = loggedInPlayer || getStoredUsername;
    const isSpacetimeReady = !spacetimeLoading && !!connection && !!dbIdentity;
    const shouldShowLoadingScreen = isAuthenticated && hasPlayerDataOrUsername && (authLoading || !isSpacetimeReady || !loadingSequenceComplete);


    // Track when isSpacetimeReady changes (key metric for connection readiness)
    useEffect(() => {
        console.log(`[App] isSpacetimeReady changed to: ${isSpacetimeReady} (spacetimeLoading: ${spacetimeLoading}, connection: ${!!connection}, dbIdentity: ${!!dbIdentity})`);
    }, [isSpacetimeReady, spacetimeLoading, connection, dbIdentity]);

    // Reset sequence completion when loading starts again
    useEffect(() => {
        if (shouldShowLoadingScreen && loadingSequenceComplete) {
            setLoadingSequenceComplete(false);
            
            // Stop music when returning to loading screen
            if (musicSystem.isPlaying) {
                console.log("[App] Stopping music due to returning to loading screen");
                musicSystem.stop();
            }
        }
    }, [shouldShowLoadingScreen, loadingSequenceComplete, musicSystem]);

    // PERFORMANCE FIX: Memoize derived arrays and callbacks passed to GameScreen.
    // Array.from() creates a new array reference on every render, causing GameScreen to re-render
    // (and re-evaluate all its hooks) even when the underlying notification Maps haven't changed.
    const levelUpNotificationsList = useMemo(
        () => Array.from(levelUpNotifications.values()),
        [levelUpNotifications]
    );
    const achievementUnlockNotificationsList = useMemo(
        () => Array.from(achievementUnlockNotifications.values()),
        [achievementUnlockNotifications]
    );
    const handleOpenAchievements = useCallback(() => {
        setInterfaceInitialView('achievements');
        setIsMinimapOpen(true);
    }, []);

    // --- Render Logic ---
    return (
        <div className="App" style={{ backgroundColor: '#111' }}>
            {/* Show loading screen only when needed */} 
            {shouldShowLoadingScreen && (
                <CyberpunkLoadingScreen 
                    authLoading={authLoading}
                    spacetimeLoading={spacetimeLoading}
                    onSequenceComplete={handleSequenceComplete}
                    hasSeenSovaIntro={loggedInPlayer?.hasSeenSovaIntro}
                    musicPreloadProgress={musicSystem.preloadProgress}
                    musicPreloadComplete={musicSystem.preloadProgress >= 1 && !musicSystem.isLoading}
                    assetProgress={assetProgress}
                    assetsLoaded={assetsLoaded}
                    showSovaSoundBox={showSovaSoundBox}
                    hideSovaSoundBox={hideSovaSoundBox}
                    hasStoredUsername={!!getStoredUsername}
                    hasLastKnownPlayer={typeof localStorage !== 'undefined' && !!localStorage.getItem('lastKnownPlayerInfo')}
                />
            )}

            {/* Conditional Rendering: Login vs Game (only if not showing loading screen) */}
            {!shouldShowLoadingScreen && !isAuthenticated && (
                 <LoginScreen
                    handleJoinGame={loginRedirect} // Correctly pass loginRedirect
                    loggedInPlayer={null}
                    connectionError={connectionError}
                    isSpacetimeConnected={spacetimeConnected}
                    isSpacetimeReady={isSpacetimeReady}
                    retryConnection={retryConnection}
                 />
            )}

            {/* If authenticated but not yet registered/connected to game */}
            {!shouldShowLoadingScreen && isAuthenticated && !localPlayerRegistered && (
                 <LoginScreen 
                    handleJoinGame={handleAttemptRegisterPlayer} // Pass the updated handler
                    loggedInPlayer={loggedInPlayer}
                    connectionError={connectionError}
                    storedUsername={getStoredUsername}
                    isSpacetimeConnected={spacetimeConnected}
                    isSpacetimeReady={isSpacetimeReady}
                    retryConnection={retryConnection}
                 />
            )}
            
            {/* If authenticated AND registered/game ready */}
            {!shouldShowLoadingScreen && isAuthenticated && localPlayerRegistered && loggedInPlayer && (
                (() => { 
                    const localPlayerIdentityHex = dbIdentity ? dbIdentity.toHexString() : undefined;
                    return (
                        <>
                        <GameScreen 
                            players={players}
                            trees={trees}
                            clouds={clouds}
                            droneEvents={droneEvents}
                            stones={stones}
                            runeStones={runeStones}
                            cairns={cairns}
                            playerDiscoveredCairns={playerDiscoveredCairns}
                            campfires={campfires}
                            furnaces={furnaces}
                            barbecues={barbecues}
                            lanterns={lanterns}
                            turrets={turrets}
                            harvestableResources={harvestableResources}
                            droppedItems={droppedItems}
                            woodenStorageBoxes={woodenStorageBoxes}
                            sleepingBags={sleepingBags}
                            playerCorpses={playerCorpses}
                            stashes={stashes}
                            shelters={shelters}
                            plantedSeeds={plantedSeeds}
                            minimapCache={minimapCache}
                            wildAnimals={wildAnimals}
                            hostileDeathEvents={hostileDeathEvents}
                            animalCorpses={animalCorpses}
                            barrels={barrels}
                            roadLampposts={roadLampposts}
                            fumaroles={fumaroles}
                            basaltColumns={basaltColumns}
                            livingCorals={livingCorals}
                            seaStacks={seaStacks}
                            homesteadHearths={homesteadHearths}
                            brothPots={brothPots}
                            foundationCells={foundationCells}
                            wallCells={wallCells}
                            doors={doors}
                            fences={fences}
                            inventoryItems={inventoryItems}
                            itemDefinitions={itemDefinitions}
                            worldState={worldState}
                            activeEquipments={activeEquipments}
                            recipes={recipes}
                            craftingQueueItems={craftingQueueItems}
                            localPlayerId={localPlayerIdentityHex} // Pass the hex string here
                            playerIdentity={dbIdentity} 
                            connection={connection}
                            placementInfo={placementInfo}
                            placementActions={placementActions}
                            placementError={placementError}
                            placementWarning={placementWarning}
                            setPlacementWarning={setPlacementWarning}
                            startPlacement={startPlacement}
                            cancelPlacement={cancelPlacement}
                            interactingWith={interactingWith}
                            handleSetInteractingWith={handleSetInteractingWith}
                            draggedItemInfo={draggedItemInfo}
                            onItemDragStart={handleItemDragStart}
                            onItemDrop={handleItemDrop}
                            predictedPosition={predictedPosition}
                            getCurrentPositionNow={getCurrentPositionNow}
                            canvasRef={canvasRef}
                            isMinimapOpen={isMinimapOpen}
                            setIsMinimapOpen={setIsMinimapOpen}
                            interfaceInitialView={interfaceInitialView}
                            setInterfaceInitialView={setInterfaceInitialView}
                            isChatting={isChatting}
                            setIsChatting={setIsChatting}
                            activeConsumableEffects={activeConsumableEffects}
                            grass={grass}
                            grassState={grassState}
                            knockedOutStatus={knockedOutStatus}
                            rangedWeaponStats={rangedWeaponStats}
                            projectiles={projectiles}
                            deathMarkers={deathMarkers}
                            setIsCraftingSearchFocused={setIsCraftingSearchFocused}
                            isCraftingSearchFocused={isCraftingSearchFocused}
                            onFishingStateChange={setIsFishing}
                            fishingSessions={fishingSessions}
                            musicSystem={musicSystem}
                            // Settings props removed -- menus and GameCanvas read from SettingsContext directly
                            soundSystem={soundSystemState}
                            playerDrinkingCooldowns={playerDrinkingCooldowns}
                            rainCollectors={rainCollectors}
                            waterPatches={waterPatches}
                            fertilizerPatches={fertilizerPatches}
                            firePatches={firePatches}
                            placedExplosives={placedExplosives}
                            hotSprings={hotSprings}
                            isMusicPanelVisible={isMusicPanelVisible}
                            setIsMusicPanelVisible={setIsMusicPanelVisible}
                            playerDodgeRollStates={playerDodgeRollStates}
                            movementDirection={inputState.direction}
                            isAutoWalking={isAutoWalking} // Pass auto-walk state for dodge roll detection
                            facingDirection={facingDirection}
                            chunkWeather={chunkWeather}
                            alkStations={alkStations}
                            alkContracts={alkContracts}
                            alkPlayerContracts={alkPlayerContracts}
                            alkState={alkState}
                            playerShardBalance={playerShardBalance}
                            memoryGridProgress={memoryGridProgress}
                            playerStats={playerStats}
                            playerAchievements={playerAchievements}
                            achievementDefinitions={achievementDefinitions}
                            leaderboardEntries={leaderboardEntries}
                            plantConfigDefinitions={plantConfigDefinitions}
                            discoveredPlants={discoveredPlants}
                            caribouBreedingData={caribouBreedingData}
                            walrusBreedingData={walrusBreedingData}
                            caribouRutState={caribouRutState}
                            walrusRutState={walrusRutState}
                            monumentParts={monumentParts}
                            largeQuarries={largeQuarries}
                            // Mobile controls
                            isMobile={isMobile}
                            onMobileTap={handleMobileTap}
                            tapAnimation={tapAnimation}
                            onMobileSprintToggle={setMobileSprintOverride}
                            mobileSprintOverride={mobileSprintOverride}
                            // SOVA Sound Box callback
                            showSovaSoundBox={showSovaSoundBox}
                            // Player progression notifications (unified in UplinkNotifications)
                            levelUpNotifications={levelUpNotificationsList}
                            achievementUnlockNotifications={achievementUnlockNotificationsList}
                            onOpenAchievements={handleOpenAchievements}
                        />
                        {/* SOVA Sound Box - Deterministic voice notifications */}
                        {SovaSoundBoxComponent}
                        </>
                    );
                })()
            )}
        </div>
    );
}

// Wrap the app with our context providers
function App() {
    return (
        <AuthProvider>
            <GameContextsProvider>
                <DebugProvider>
                    <Router>
                        <Routes>
                            <Route path="/" element={<AppErrorBoundary><AppContent /></AppErrorBoundary>} />
                            <Route path="/blog" element={<BlogPage />} />
                            <Route path="/blog/:slug" element={<BlogPostPage />} />
                            <Route path="/privacy" element={<PrivacyPage />} />
                            <Route path="/terms" element={<TermsPage />} />
                            <Route path="/cookies" element={<CookiesPage />} />
                            <Route path="/ai-disclosure" element={<AIDisclosurePage />} />
                        </Routes>
                    </Router>
                </DebugProvider>
            </GameContextsProvider>
        </AuthProvider>
    );
}
export default App;