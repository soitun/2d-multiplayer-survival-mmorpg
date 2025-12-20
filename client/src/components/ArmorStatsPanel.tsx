/**
 * ArmorStatsPanel.tsx
 * 
 * Displays accumulated armor statistics and special effects from all equipped armor pieces.
 * Shows resistances, immunities, movement speed, warmth, and other bonuses.
 */

import React, { useMemo } from 'react';
import styles from './ArmorStatsPanel.module.css';
import { ItemDefinition } from '../generated';

interface ArmorStatsPanelProps {
    equippedArmor: ItemDefinition[];
}

interface ArmorStats {
    // Resistances
    meleeResistance: number;
    projectileResistance: number;
    fireResistance: number;
    bluntResistance: number;
    slashResistance: number;
    pierceResistance: number;
    coldResistance: number;
    
    // Bonuses
    warmthBonus: number;
    movementSpeedModifier: number;
    staminaRegenModifier: number;
    waterSpeedBonus: number; // Bonus speed while swimming (e.g., Reed Flippers)
    
    // Special Effects
    burnImmunityPieces: number;
    coldImmunityPieces: number;
    wetnessImmunityPieces: number;
    knockbackImmunityPieces: number;
    bleedImmunityPieces: number;
    
    meleeReflection: number;
    fireDamageMultiplier: number;
    detectionBonus: number;
    lowHealthDamageBonus: number;
    
    // Flags
    makesNoiseOnSprint: boolean;
    hasSilentMovement: boolean;
    intimidatesAnimals: boolean;
}

// Special ability hints for specific items
interface AbilityHint {
    icon: string;
    label: string;
    hint: string;
}

const ITEM_ABILITY_HINTS: Record<string, AbilityHint> = {
    "Reed Diver's Helm": {
        icon: '🌊',
        label: 'Dive',
        hint: 'Press [F] over water to submerge'
    },
    "Headlamp": {
        icon: '💡',
        label: 'Light',
        hint: 'Press [F] to toggle light'
    },
};

const ArmorStatsPanel: React.FC<ArmorStatsPanelProps> = ({ equippedArmor }) => {
    const stats = useMemo((): ArmorStats => {
        const accumulated: ArmorStats = {
            meleeResistance: 0,
            projectileResistance: 0,
            fireResistance: 0,
            bluntResistance: 0,
            slashResistance: 0,
            pierceResistance: 0,
            coldResistance: 0,
            warmthBonus: 0,
            movementSpeedModifier: 0,
            staminaRegenModifier: 0,
            waterSpeedBonus: 0,
            burnImmunityPieces: 0,
            coldImmunityPieces: 0,
            wetnessImmunityPieces: 0,
            knockbackImmunityPieces: 0,
            bleedImmunityPieces: 0,
            meleeReflection: 0,
            fireDamageMultiplier: 1.0,
            detectionBonus: 0,
            lowHealthDamageBonus: 0,
            makesNoiseOnSprint: false,
            hasSilentMovement: false,
            intimidatesAnimals: false,
        };

        equippedArmor.forEach(armor => {
            // Accumulate resistances
            if (armor.armorResistances) {
                accumulated.meleeResistance += armor.armorResistances.meleeResistance || 0;
                accumulated.projectileResistance += armor.armorResistances.projectileResistance || 0;
                accumulated.fireResistance += armor.armorResistances.fireResistance || 0;
                accumulated.bluntResistance += armor.armorResistances.bluntResistance || 0;
                accumulated.slashResistance += armor.armorResistances.slashResistance || 0;
                accumulated.pierceResistance += armor.armorResistances.pierceResistance || 0;
                accumulated.coldResistance += armor.armorResistances.coldResistance || 0;
            }

            // Accumulate bonuses
            accumulated.warmthBonus += armor.warmthBonus || 0;
            accumulated.movementSpeedModifier += armor.movementSpeedModifier || 0;
            accumulated.staminaRegenModifier += armor.staminaRegenModifier || 0;
            // Water speed bonus (e.g., Reed Flippers) - cast to any for generated types compatibility
            const waterBonus = (armor as any).waterSpeedBonus;
            if (typeof waterBonus === 'number') {
                accumulated.waterSpeedBonus += waterBonus;
            }

            // Count immunity pieces
            if (armor.grantsBurnImmunity) accumulated.burnImmunityPieces++;
            if (armor.grantsColdImmunity) accumulated.coldImmunityPieces++;
            if (armor.grantsWetnessImmunity) accumulated.wetnessImmunityPieces++;
            if (armor.grantsKnockbackImmunity) accumulated.knockbackImmunityPieces++;
            if (armor.grantsBleedImmunity) accumulated.bleedImmunityPieces++;

            // Accumulate special effects
            accumulated.meleeReflection += armor.reflectsMeleeDamage || 0;
            if (armor.fireDamageMultiplier) {
                accumulated.fireDamageMultiplier *= armor.fireDamageMultiplier;
            }
            accumulated.detectionBonus += armor.detectionRadiusBonus || 0;
            accumulated.lowHealthDamageBonus += armor.lowHealthDamageBonus || 0;

            // Flags
            if (armor.noiseOnSprint) accumulated.makesNoiseOnSprint = true;
            if (armor.silencesMovement) accumulated.hasSilentMovement = true;
            if (armor.intimidatesAnimals) accumulated.intimidatesAnimals = true;
        });

        // Cap resistances at 90%
        accumulated.meleeResistance = Math.min(accumulated.meleeResistance, 0.9);
        accumulated.projectileResistance = Math.min(accumulated.projectileResistance, 0.9);
        accumulated.fireResistance = Math.min(accumulated.fireResistance, 0.9);
        accumulated.bluntResistance = Math.min(accumulated.bluntResistance, 0.9);
        accumulated.slashResistance = Math.min(accumulated.slashResistance, 0.9);
        accumulated.pierceResistance = Math.min(accumulated.pierceResistance, 0.9);
        accumulated.coldResistance = Math.min(accumulated.coldResistance, 1.0);

        // Cap reflection at 50%
        accumulated.meleeReflection = Math.min(accumulated.meleeReflection, 0.5);

        return accumulated;
    }, [equippedArmor]);

    // Collect ability hints from equipped items
    const abilityHints = useMemo((): AbilityHint[] => {
        const hints: AbilityHint[] = [];
        equippedArmor.forEach(armor => {
            const hint = ITEM_ABILITY_HINTS[armor.name];
            if (hint) {
                hints.push(hint);
            }
        });
        return hints;
    }, [equippedArmor]);

    // Helper to format percentage
    const formatPercent = (value: number, signed: boolean = true): string => {
        const percent = Math.round(value * 100);
        if (percent === 0) return '0%';
        return `${signed && percent > 0 ? '+' : ''}${percent}%`;
    };

    // Helper to format decimal
    const formatDecimal = (value: number, signed: boolean = true): string => {
        const rounded = Math.round(value * 10) / 10;
        if (rounded === 0) return '0';
        return `${signed && rounded > 0 ? '+' : ''}${rounded}`;
    };

    // Check if any armor is equipped
    if (equippedArmor.length === 0) {
        return (
            <div className={styles.armorStatsPanel}>
                <h4 className={styles.title}>⚔️ Armor Stats</h4>
                <div className={styles.emptyState}>No armor equipped</div>
            </div>
        );
    }

    return (
        <div className={styles.armorStatsPanel}>
            <h4 className={styles.title}>⚔️ Armor Stats</h4>

            {/* Resistances Section */}
            <div className={styles.section}>
                <div className={styles.sectionTitle}>🛡️ Resistances</div>
                {stats.meleeResistance > 0 && (
                    <div className={styles.statRow}>
                        <span className={styles.statLabel}>Melee:</span>
                        <span className={styles.statValue}>{formatPercent(stats.meleeResistance, false)}</span>
                    </div>
                )}
                {stats.projectileResistance > 0 && (
                    <div className={styles.statRow}>
                        <span className={styles.statLabel}>Projectile:</span>
                        <span className={styles.statValue}>{formatPercent(stats.projectileResistance, false)}</span>
                    </div>
                )}
                {stats.slashResistance > 0 && (
                    <div className={styles.statRow}>
                        <span className={styles.statLabel}>Slash:</span>
                        <span className={styles.statValue}>{formatPercent(stats.slashResistance, false)}</span>
                    </div>
                )}
                {stats.bluntResistance > 0 && (
                    <div className={styles.statRow}>
                        <span className={styles.statLabel}>Blunt:</span>
                        <span className={styles.statValue}>{formatPercent(stats.bluntResistance, false)}</span>
                    </div>
                )}
                {stats.pierceResistance > 0 && (
                    <div className={styles.statRow}>
                        <span className={styles.statLabel}>Pierce:</span>
                        <span className={styles.statValue}>{formatPercent(stats.pierceResistance, false)}</span>
                    </div>
                )}
                {stats.fireResistance !== 0 && (
                    <div className={styles.statRow}>
                        <span className={styles.statLabel}>Fire:</span>
                        <span className={`${styles.statValue} ${stats.fireResistance < 0 ? styles.negative : ''}`}>
                            {formatPercent(stats.fireResistance, true)}
                        </span>
                    </div>
                )}
                {stats.coldResistance > 0 && (
                    <div className={styles.statRow}>
                        <span className={styles.statLabel}>❄️ Cold:</span>
                        <span className={styles.statValue}>{formatPercent(stats.coldResistance, false)}</span>
                    </div>
                )}
            </div>

            {/* Bonuses Section */}
            {(stats.warmthBonus !== 0 || stats.movementSpeedModifier !== 0 || stats.staminaRegenModifier !== 0 || stats.waterSpeedBonus !== 0) && (
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>✨ Bonuses</div>
                    {stats.warmthBonus !== 0 && (
                        <div className={styles.statRow}>
                            <span className={styles.statLabel}>🔥 Warmth:</span>
                            <span className={`${styles.statValue} ${stats.warmthBonus > 0 ? styles.positive : styles.negative}`}>
                                {formatDecimal(stats.warmthBonus)}/s
                            </span>
                        </div>
                    )}
                    {stats.movementSpeedModifier !== 0 && (
                        <div className={styles.statRow}>
                            <span className={styles.statLabel}>👟 Speed:</span>
                            <span className={`${styles.statValue} ${stats.movementSpeedModifier > 0 ? styles.positive : styles.negative}`}>
                                {formatPercent(stats.movementSpeedModifier)}
                            </span>
                        </div>
                    )}
                    {stats.waterSpeedBonus !== 0 && (
                        <div className={styles.statRow}>
                            <span className={styles.statLabel}>🏊 Water Speed:</span>
                            <span className={`${styles.statValue} ${styles.positive}`}>
                                {formatPercent(stats.waterSpeedBonus)}
                            </span>
                        </div>
                    )}
                    {stats.staminaRegenModifier !== 0 && (
                        <div className={styles.statRow}>
                            <span className={styles.statLabel}>⚡ Stamina Regen:</span>
                            <span className={styles.statValue}>{formatPercent(stats.staminaRegenModifier)}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Immunities Section */}
            {(stats.burnImmunityPieces > 0 || stats.coldImmunityPieces > 0 || stats.wetnessImmunityPieces > 0 || 
              stats.knockbackImmunityPieces > 0 || stats.bleedImmunityPieces > 0) && (
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>🛡️ Immunities</div>
                    {stats.burnImmunityPieces > 0 && (
                        <div className={styles.statRow}>
                            <span className={styles.statLabel}>🔥 Burn:</span>
                            <span className={`${styles.statValue} ${stats.burnImmunityPieces >= 5 ? styles.immune : ''}`}>
                                {stats.burnImmunityPieces}/5 {stats.burnImmunityPieces >= 5 ? '✓' : ''}
                            </span>
                        </div>
                    )}
                    {stats.coldImmunityPieces > 0 && (
                        <div className={styles.statRow}>
                            <span className={styles.statLabel}>❄️ Cold:</span>
                            <span className={`${styles.statValue} ${stats.coldImmunityPieces >= 5 ? styles.immune : ''}`}>
                                {stats.coldImmunityPieces}/5 {stats.coldImmunityPieces >= 5 ? '✓' : ''}
                            </span>
                        </div>
                    )}
                    {stats.wetnessImmunityPieces > 0 && (
                        <div className={styles.statRow}>
                            <span className={styles.statLabel}>💧 Wetness:</span>
                            <span className={`${styles.statValue} ${stats.wetnessImmunityPieces >= 5 ? styles.immune : ''}`}>
                                {stats.wetnessImmunityPieces}/5 {stats.wetnessImmunityPieces >= 5 ? '✓' : ''}
                            </span>
                        </div>
                    )}
                    {stats.knockbackImmunityPieces > 0 && (
                        <div className={styles.statRow}>
                            <span className={styles.statLabel}>💥 Knockback:</span>
                            <span className={`${styles.statValue} ${stats.knockbackImmunityPieces >= 5 ? styles.immune : ''}`}>
                                {stats.knockbackImmunityPieces}/5 {stats.knockbackImmunityPieces >= 5 ? '✓' : ''}
                            </span>
                        </div>
                    )}
                    {stats.bleedImmunityPieces > 0 && (
                        <div className={styles.statRow}>
                            <span className={styles.statLabel}>🩸 Bleed:</span>
                            <span className={`${styles.statValue} ${stats.bleedImmunityPieces >= 3 ? styles.immune : ''}`}>
                                {stats.bleedImmunityPieces}/3 {stats.bleedImmunityPieces >= 3 ? '✓' : ''}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Special Effects Section */}
            {(stats.meleeReflection > 0 || stats.fireDamageMultiplier !== 1.0 || stats.detectionBonus !== 0 || 
              stats.lowHealthDamageBonus > 0 || stats.makesNoiseOnSprint || stats.hasSilentMovement || stats.intimidatesAnimals) && (
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>🌟 Special Effects</div>
                    {stats.meleeReflection > 0 && (
                        <div className={styles.statRow}>
                            <span className={styles.statLabel}>🪞 Melee Reflect:</span>
                            <span className={styles.statValue}>{formatPercent(stats.meleeReflection, false)}</span>
                        </div>
                    )}
                    {stats.fireDamageMultiplier > 1.0 && (
                        <div className={styles.statRow}>
                            <span className={styles.statLabel}>🔥 Fire Damage:</span>
                            <span className={styles.statValue + ' ' + styles.negative}>
                                ×{stats.fireDamageMultiplier.toFixed(1)}
                            </span>
                        </div>
                    )}
                    {stats.detectionBonus !== 0 && (
                        <div className={styles.statRow}>
                            <span className={styles.statLabel}>👁️ Stealth:</span>
                            <span className={styles.statValue + ' ' + styles.positive}>
                                {formatPercent(stats.detectionBonus, false)}
                            </span>
                        </div>
                    )}
                    {stats.lowHealthDamageBonus > 0 && (
                        <div className={styles.statRow}>
                            <span className={styles.statLabel}>⚔️ Low HP Damage:</span>
                            <span className={styles.statValue + ' ' + styles.positive}>
                                {formatPercent(stats.lowHealthDamageBonus)}
                            </span>
                        </div>
                    )}
                    {stats.hasSilentMovement && (
                        <div className={styles.statRow}>
                            <span className={styles.statLabel}>🦊 Silent Movement</span>
                            <span className={styles.statValue + ' ' + styles.positive}>✓</span>
                        </div>
                    )}
                    {stats.intimidatesAnimals && (
                        <div className={styles.statRow}>
                            <span className={styles.statLabel}>🐺 Intimidation</span>
                            <span className={styles.statValue + ' ' + styles.positive}>✓</span>
                        </div>
                    )}
                    {stats.makesNoiseOnSprint && (
                        <div className={styles.statRow}>
                            <span className={styles.statLabel}>🔊 Noisy Sprint</span>
                            <span className={styles.statValue + ' ' + styles.negative}>✓</span>
                        </div>
                    )}
                </div>
            )}

            {/* Ability Hints Section */}
            {abilityHints.length > 0 && (
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>💡 Abilities</div>
                    {abilityHints.map((hint, index) => (
                        <div key={index} className={styles.abilityHint}>
                            <span className={styles.abilityIcon}>{hint.icon}</span>
                            <span className={styles.abilityText}>
                                <strong>{hint.label}:</strong> {hint.hint}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ArmorStatsPanel;

