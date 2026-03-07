// Utility functions for calculating effective ammunition damage
// Based on server/src/projectile.rs calculate_projectile_damage function

import { ItemDefinition } from '../generated/types';

interface DamageRange {
  min: number;
  max: number;
}

const COMPATIBLE_WEAPONS_BY_AMMO_TYPE: Record<string, string[]> = {
  Arrow: ['Hunting Bow', 'Crossbow'],
  Bullet: ['Makarov PM', 'PP-91 KEDR'],
  HarpoonDart: ['Reed Harpoon Gun'],
};

const WEAPON_TOOLTIP_LABELS: Record<string, string> = {
  'Hunting Bow': 'Bow',
  'Crossbow': 'Crossbow',
  'Makarov PM': 'Makarov',
  'PP-91 KEDR': 'KEDR',
  'Reed Harpoon Gun': 'Harpoon',
};

/**
 * Calculate effective damage range for ammunition when used with compatible ranged weapons.
 * Based on the projectile damage calculation logic from server/src/projectile.rs
 */
export function calculateEffectiveAmmoDamage(
  ammoDefinition: ItemDefinition,
  itemDefinitions: Map<string, ItemDefinition>,
  availableWeapons?: string[]
): { weaponName: string; damage: DamageRange }[] | null {
  // Only calculate for ammunition category
  if (ammoDefinition.category.tag !== 'Ammunition') {
    return null;
  }

  const ammoTypeTag = ammoDefinition.ammoType?.tag;
  if (!ammoTypeTag) {
    return null;
  }

  const results: { weaponName: string; damage: DamageRange }[] = [];
  const weaponsToCheck = availableWeapons || COMPATIBLE_WEAPONS_BY_AMMO_TYPE[ammoTypeTag] || [];

  for (const weaponName of weaponsToCheck) {
    const weaponDefinition = getWeaponDefinition(itemDefinitions, weaponName);
    if (!weaponDefinition) continue;

    const weaponDamage = {
      min: weaponDefinition.pvpDamageMin ?? 0,
      max: weaponDefinition.pvpDamageMax ?? weaponDefinition.pvpDamageMin ?? 0,
    };

    const effectiveDamage = calculateProjectileDamage(weaponDamage, ammoDefinition);
    if (effectiveDamage) {
      results.push({
        weaponName,
        damage: effectiveDamage
      });
    }
  }

  return results.length > 0 ? results : null;
}

function getWeaponDefinition(
  itemDefinitions: Map<string, ItemDefinition>,
  weaponName: string
): ItemDefinition | null {
  for (const definition of itemDefinitions.values()) {
    if (definition.category.tag === 'RangedWeapon' && definition.name === weaponName) {
      return definition;
    }
  }

  return null;
}

/**
 * Calculate damage for a specific weapon + ammunition combination
 * Implements the same logic as server/src/projectile.rs calculate_projectile_damage
 */
function calculateProjectileDamage(
  weaponDamage: DamageRange,
  ammoDefinition: ItemDefinition
): DamageRange | null {
  const ammoMin = ammoDefinition.pvpDamageMin ?? 0;
  const ammoMax = ammoDefinition.pvpDamageMax ?? ammoMin;

  // Apply damage calculation rules based on ammunition type
  switch (ammoDefinition.name) {
    case 'Fire Arrow':
      // Fire arrows use only ammunition damage, ignoring weapon damage
      return { min: ammoMin, max: ammoMax };
      
    case 'Hollow Reed Arrow':
      // Hollow Reed arrows subtract their damage from weapon damage (minimum 1)
      return {
        min: Math.max(1, weaponDamage.min - ammoMax), // Use max ammo damage for min result
        max: Math.max(1, weaponDamage.max - ammoMin)  // Use min ammo damage for max result
      };
      
    default:
      // Default case: weapon damage + ammunition damage (includes Wooden Arrow with 0 modifier)
      return {
        min: weaponDamage.min + ammoMin,
        max: weaponDamage.max + ammoMax
      };
  }
}

/**
 * Format damage range for display in tooltips
 */
export function formatDamageRange(damage: DamageRange): string {
  if (damage.min === damage.max) {
    return `${damage.min}`;
  }
  return `${damage.min}-${damage.max}`;
}

/**
 * Get a concise tooltip description for ammunition damage
 */
export function getAmmoDamageTooltip(
  ammoDefinition: ItemDefinition,
  itemDefinitions: Map<string, ItemDefinition>
): string | null {
  const effectiveDamages = calculateEffectiveAmmoDamage(ammoDefinition, itemDefinitions);
  if (!effectiveDamages || effectiveDamages.length === 0) {
    return null;
  }

  const damageSummary = effectiveDamages
    .map(({ weaponName, damage }) => `${WEAPON_TOOLTIP_LABELS[weaponName] ?? weaponName} ${formatDamageRange(damage)}`)
    .join(', ');

  switch (ammoDefinition.name) {
    case 'Fire Arrow':
      return `${damageSummary} (ignores weapon damage)`;
    case 'Hollow Reed Arrow':
      return `${damageSummary} (reduces total damage)`;
    case 'Wooden Arrow':
    case '9x18mm Round':
      return `${damageSummary} (neutral modifier)`;
    case 'Bone Arrow':
    case 'Reed Harpoon Dart':
    case 'Venom Harpoon Dart':
      return `${damageSummary} (bonus damage)`;
    case 'Venom Arrow':
      return `${damageSummary} (plus venom)`;
    default:
      return damageSummary;
  }
} 