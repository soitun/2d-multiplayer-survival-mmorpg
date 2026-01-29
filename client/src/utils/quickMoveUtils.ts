/**
 * quickMoveUtils.ts
 * 
 * Centralized utility for quick-moving items to/from containers.
 * This eliminates code duplication across InventoryUI, Hotbar, and useHotLoot.
 */

import { DbConnection, WoodenStorageBox, Stash, Campfire, Fumarole, BrothPot } from '../generated';
import { isWaterContainer } from './waterContainerHelpers';
import { getContainerTypeFromSlotType } from './containerUtils';

// Box type constants (must match server)
const BOX_TYPE_REFRIGERATOR = 2;
const BOX_TYPE_COMPOST = 3;
const BOX_TYPE_REPAIR_BENCH = 5;
const BOX_TYPE_FISH_TRAP = 10;

export interface QuickMoveContext {
    connection: DbConnection;
    woodenStorageBoxes?: Map<string, WoodenStorageBox>;
    stashes?: Map<string, Stash>;
    campfires?: Map<string, Campfire>;
    fumaroles?: Map<string, Fumarole>;
    brothPots?: Map<string, BrothPot>;
}

export interface QuickMoveTarget {
    type: string;
    id: number | bigint;
}

/**
 * Quick move an item TO a container (depositing from player inventory/hotbar)
 * Returns true if successful, false if the move couldn't be performed
 */
export function quickMoveToContainer(
    ctx: QuickMoveContext,
    target: QuickMoveTarget,
    itemInstanceId: bigint,
    itemDefinitionName?: string
): boolean {
    const { connection, woodenStorageBoxes, stashes, campfires, fumaroles, brothPots } = ctx;
    const containerId = Number(target.id);
    
    if (!connection?.reducers) {
        console.warn('[QuickMove] No connection available');
        return false;
    }

    try {
        switch (target.type) {
            case 'player_corpse':
                connection.reducers.quickMoveToCorpse(containerId, itemInstanceId);
                return true;

            case 'wooden_storage_box':
                // Check box type for compost/refrigerator/repair_bench variants
                const boxEntity = woodenStorageBoxes?.get(containerId.toString());
                if (boxEntity?.boxType === BOX_TYPE_COMPOST) {
                    connection.reducers.quickMoveToCompost(containerId, itemInstanceId);
                } else if (boxEntity?.boxType === BOX_TYPE_REFRIGERATOR) {
                    connection.reducers.quickMoveToRefrigerator(containerId, itemInstanceId);
                } else if (boxEntity?.boxType === BOX_TYPE_REPAIR_BENCH) {
                    connection.reducers.quickMoveToRepairBench(containerId, itemInstanceId);
                } else if (boxEntity?.boxType === BOX_TYPE_FISH_TRAP) {
                    connection.reducers.quickMoveToFishTrap(containerId, itemInstanceId);
                } else {
                    connection.reducers.quickMoveToBox(containerId, itemInstanceId);
                }
                return true;

            case 'stash':
                const stashEntity = stashes?.get(containerId.toString());
                if (stashEntity?.isHidden) {
                    console.warn('[QuickMove] Cannot move to hidden stash');
                    return false;
                }
                connection.reducers.quickMoveToStash(containerId, itemInstanceId);
                return true;

            case 'campfire':
                // Check if broth pot is attached - redirect items there instead of fuel slots
                const campfireEntity = campfires?.get(containerId.toString());
                if (campfireEntity?.attachedBrothPotId) {
                    const pot = brothPots?.get(campfireEntity.attachedBrothPotId.toString());
                    // If item is a water container AND water container slot is empty, use water slot
                    if (itemDefinitionName && isWaterContainer(itemDefinitionName) && !pot?.waterContainerInstanceId) {
                        try {
                            (connection.reducers as any).quickMoveToBrothPotWaterContainer(
                                campfireEntity.attachedBrothPotId,
                                itemInstanceId
                            );
                            return true;
                        } catch (e) {
                            // Fall through to ingredient slots
                        }
                    }
                    // Send to broth pot ingredient slots
                    try {
                        connection.reducers.quickMoveToBrothPot(
                            campfireEntity.attachedBrothPotId,
                            itemInstanceId
                        );
                        return true;
                    } catch (e) {
                        // Fall through to campfire fuel slots
                    }
                }
                // Only send to campfire fuel slots if NO broth pot is attached (or broth pot failed)
                connection.reducers.quickMoveToCampfire(containerId, itemInstanceId);
                return true;

            case 'furnace':
                connection.reducers.quickMoveToFurnace(containerId, itemInstanceId);
                return true;

            case 'barbecue':
                connection.reducers.quickMoveToBarbecue(containerId, itemInstanceId);
                return true;

            case 'fumarole':
                // Check if broth pot is attached - NEVER send to incineration slots
                const fumaroleEntity = fumaroles?.get(containerId.toString());
                if (fumaroleEntity?.attachedBrothPotId) {
                    const pot = brothPots?.get(fumaroleEntity.attachedBrothPotId.toString());
                    // If item is a water container AND water container slot is empty, use water slot
                    if (itemDefinitionName && isWaterContainer(itemDefinitionName) && !pot?.waterContainerInstanceId) {
                        try {
                            (connection.reducers as any).quickMoveToBrothPotWaterContainer(
                                fumaroleEntity.attachedBrothPotId,
                                itemInstanceId
                            );
                            return true;
                        } catch (e) {
                            // Fall through to ingredient slots
                        }
                    }
                    // Send to broth pot ingredient slots
                    try {
                        connection.reducers.quickMoveToBrothPot(
                            fumaroleEntity.attachedBrothPotId,
                            itemInstanceId
                        );
                        return true;
                    } catch (e) {
                        // Fall through - but DON'T send to fumarole incineration!
                        console.warn('[QuickMove] Broth pot full, cannot add item to fumarole');
                        return false;
                    }
                }
                // Only send to fumarole incineration if NO broth pot is attached
                connection.reducers.quickMoveToFumarole(containerId, itemInstanceId);
                return true;

            case 'lantern':
                connection.reducers.quickMoveToLantern(containerId, itemInstanceId);
                return true;

            case 'turret':
                connection.reducers.quickMoveToTurret(containerId, itemInstanceId);
                return true;

            case 'homestead_hearth':
                connection.reducers.quickMoveToHearth(containerId, itemInstanceId);
                return true;

            case 'rain_collector':
                // Rain collectors use a different function signature
                connection.reducers.moveItemToRainCollector(containerId, itemInstanceId, 0);
                return true;

            case 'broth_pot':
                connection.reducers.quickMoveToBrothPot(containerId, itemInstanceId);
                return true;

            default:
                console.warn(`[QuickMove] Unknown container type: ${target.type}`);
                return false;
        }
    } catch (error) {
        console.error('[QuickMove] Error moving item:', error);
        return false;
    }
}

/**
 * Quick move an item FROM a container TO player inventory (withdrawing)
 * Uses container-specific reducers based on the source slot type
 */
export function quickMoveToPlayer(
    connection: DbConnection | null,
    slotType: string,
    containerId: number | bigint,
    slotIndex: number
): boolean {
    if (!connection?.reducers) {
        console.warn('[QuickMoveToPlayer] No connection available');
        return false;
    }

    const containerIdNum = Number(containerId);
    
    // Convert slot type to container type (e.g., 'campfire_fuel' -> 'campfire')
    const containerType = getContainerTypeFromSlotType(slotType) || slotType;

    try {
        switch (containerType) {
            case 'wooden_storage_box':
                connection.reducers.quickMoveFromBox(containerIdNum, slotIndex);
                return true;

            case 'player_corpse':
                connection.reducers.quickMoveFromCorpse(containerIdNum, slotIndex);
                return true;

            case 'stash':
                connection.reducers.quickMoveFromStash(containerIdNum, slotIndex);
                return true;

            case 'campfire':
                connection.reducers.quickMoveFromCampfire(containerIdNum, slotIndex);
                return true;

            case 'furnace':
                connection.reducers.quickMoveFromFurnace(containerIdNum, slotIndex);
                return true;

            case 'barbecue':
                connection.reducers.quickMoveFromBarbecue(containerIdNum, slotIndex);
                return true;

            case 'fumarole':
                connection.reducers.quickMoveFromFumarole(containerIdNum, slotIndex);
                return true;

            case 'lantern':
                connection.reducers.quickMoveFromLantern(containerIdNum, slotIndex);
                return true;

            case 'turret':
                connection.reducers.quickMoveFromTurret(containerIdNum, slotIndex);
                return true;

            case 'homestead_hearth':
                connection.reducers.quickMoveFromHearth(containerIdNum, slotIndex);
                return true;

            case 'rain_collector':
                connection.reducers.quickMoveFromRainCollector(containerIdNum, slotIndex);
                return true;

            case 'broth_pot':
                connection.reducers.quickMoveFromBrothPot(containerIdNum, slotIndex);
                return true;

            default:
                console.warn(`[QuickMoveToPlayer] Unknown container type: ${containerType}`);
                return false;
        }
    } catch (error) {
        console.error('[QuickMoveToPlayer] Error:', error);
        return false;
    }
}
