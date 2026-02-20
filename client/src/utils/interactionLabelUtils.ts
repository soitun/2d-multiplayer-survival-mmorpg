/**
 * Human-readable labels for interaction targets (mobile UI, tooltips, etc.)
 */

import type { InteractionTargetType } from '../types/interactions';

/** Get short label for interaction target type (e.g. "PICK", "FIRE", "USE"). */
export function getInteractableLabel(target: { type: InteractionTargetType | string } | null | undefined): string {
  if (!target) return '';
  switch (target.type) {
    case 'harvestable_resource': return 'PICK';
    case 'campfire': return 'FIRE';
    case 'furnace': return 'SMELT';
    case 'fumarole': return 'HEAT';
    case 'lantern': return 'LAMP';
    case 'homestead_hearth': return 'HOME';
    case 'dropped_item': return 'ITEM';
    case 'box': return 'BOX';
    case 'corpse': return 'LOOT';
    case 'stash': return 'STASH';
    case 'sleeping_bag': return 'BED';
    case 'knocked_out_player': return 'HELP';
    case 'water': return 'DRINK';
    case 'rain_collector': return 'WATER';
    case 'broth_pot': return 'COOK';
    case 'door': return 'DOOR';
    case 'alk_station': return 'ALK';
    default: return 'USE';
  }
}
