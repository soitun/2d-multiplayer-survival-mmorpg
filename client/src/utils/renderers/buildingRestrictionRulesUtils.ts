import {
  ActiveEquipment as SpacetimeDBActiveEquipment,
  ItemDefinition as SpacetimeDBItemDefinition,
} from '../../generated/types';
import { BuildingRestrictionZoneConfig } from './buildingRestrictionOverlayUtils';

export function shouldShowBuildingRestrictionOverlay(
  placementInfo: { itemDefId?: bigint; itemName?: string } | null | undefined,
  localPlayerId: string | undefined,
  activeEquipments: Map<string, SpacetimeDBActiveEquipment> | undefined,
  itemDefinitions: Map<string, SpacetimeDBItemDefinition> | undefined
): boolean {
  if (placementInfo) return true;
  if (!localPlayerId || !activeEquipments || !itemDefinitions) return false;

  const localEquipment = activeEquipments.get(localPlayerId);
  if (!localEquipment?.equippedItemDefId) return false;
  const equippedItemDef = itemDefinitions.get(localEquipment.equippedItemDefId.toString());
  if (!equippedItemDef) return false;

  // Blueprint and any placeable item (campfire, broth pot, etc.) should show zones.
  return equippedItemDef.name === 'Blueprint' || equippedItemDef.category?.tag === 'Placeable';
}

export function getMonumentRestrictionRadius(buildingId: string): number {
  if (buildingId.startsWith('shipwreck_')) return 1875;
  if (buildingId.startsWith('fishing_village_')) return 1000;
  if (buildingId.startsWith('whale_bone_graveyard_')) return 1200;
  if (buildingId.startsWith('hunting_village_')) return 1200;
  if (buildingId.startsWith('crashed_research_drone_')) return 800;
  if (buildingId.startsWith('weather_station_')) return 2000;
  if (buildingId.startsWith('wolf_den_')) return 800;
  if (buildingId.startsWith('alpine_village_')) return 600;
  return 0;
}

export function buildLargeQuarryRestrictionZones(
  largeQuarries: Map<string, any>,
  tileSizePx = 48,
  quarryRestrictionRadius = 400
): BuildingRestrictionZoneConfig[] {
  const zones: BuildingRestrictionZoneConfig[] = [];
  largeQuarries.forEach((quarry: any) => {
    const quarryRadiusPx = (quarry.radiusTiles || 0) * tileSizePx;
    const effectiveRadius = quarryRadiusPx + quarryRestrictionRadius;
    zones.push({
      centerX: quarry.worldX,
      centerY: quarry.worldY,
      radius: effectiveRadius,
    });
  });
  return zones;
}

export function buildHotSpringRestrictionZones(
  detectedHotSprings: Array<{ id: string; posX: number; posY: number; radius: number }>,
  monumentRestrictionRadius = 800
): BuildingRestrictionZoneConfig[] {
  return detectedHotSprings.map((hotSpring) => ({
    centerX: hotSpring.posX,
    centerY: hotSpring.posY,
    radius: hotSpring.radius + monumentRestrictionRadius,
  }));
}

export function buildSmallQuarryRestrictionZones(
  detectedQuarries: Array<{ id: string; posX: number; posY: number; radius: number }>,
  quarryRestrictionRadius = 400
): BuildingRestrictionZoneConfig[] {
  return detectedQuarries.map((quarry) => ({
    centerX: quarry.posX,
    centerY: quarry.posY,
    radius: quarry.radius + quarryRestrictionRadius,
  }));
}
