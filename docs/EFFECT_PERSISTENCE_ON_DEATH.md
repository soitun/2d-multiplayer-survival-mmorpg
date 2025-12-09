# Effect Persistence on Death

## Summary
**All effects are cleared on death EXCEPT BuildingPrivilege.**

This includes:
- ✅ All broth effects (Intoxicated, NightVision, SpeedBoost, etc.)
- ✅ Entrainment (permanent while alive, cleared on death)
- ✅ All DOT effects (Bleed, Burn, Venom, Poisoned, etc.)
- ✅ All healing effects (HealthRegen, BandageBurst, etc.)
- ✅ All status effects (Wet, Exhausted, Cozy, etc.)
- ✅ All rune stone effects (ProductionRune, AgrarianRune, MemoryRune)
- ✅ All environmental effects (HotSpring, Fumarole, SafeZone, TreeCover)

**Only BuildingPrivilege persists through death** (for building permissions).

## Implementation

### Function: `clear_all_effects_on_death`
**Location:** `server/src/active_effects.rs:1751`

**What it does:**
1. Clears all damage-over-time effects (Bleed, Venom)
2. Clears all healing effects (HealthRegen, BandageBurst)
3. **Clears all broth effects** via `clear_broth_effects_on_death()`
4. **Explicitly clears Entrainment** (permanent while alive, cleared on death)
5. Clears all remaining effects EXCEPT BuildingPrivilege

### Broth Effects Cleared on Death
All broth effects are cleared via `clear_broth_effects_on_death()`:
- Intoxicated (drunk effect)
- Poisoned (poison DOT)
- SpeedBoost (movement speed)
- StaminaBoost (reduced hunger/thirst drain)
- NightVision (enhanced night vision)
- WarmthBoost (reduced warmth decay)
- ColdResistance (reduced cold damage)
- PoisonResistance (reduced poison/venom damage)
- FireResistance (reduced fire/burn damage)
- PoisonCoating (weapon coating buff)
- PassiveHealthRegen (slow health regeneration)
- HarvestBoost (bonus mining/chopping yield)

### Entrainment Behavior
- **Category:** Insanity effect (NOT a broth effect)
- **While Alive:** Permanent, cannot be removed (death sentence from max insanity)
- **On Death:** Cleared by the general effect clearing loop (not via `clear_broth_effects_on_death()`)
- **On Respawn:** Player starts fresh with 0 insanity, no Entrainment

## Death Detection Points

`clear_all_effects_on_death()` is called in:
1. **`player_stats.rs`** - When player health reaches 0
2. **`combat.rs`** - When player is killed in combat
3. **`wild_animal_npc/core.rs`** - When killed by wild animals
4. **`knocked_out.rs`** - When player dies from knockout (if applicable)
5. **`chat.rs`** - Admin/debug command (if applicable)

## Client-Side Overlay Clearing

**Location:** `client/src/App.tsx`

When respawn is detected:
- `resetBrothEffectsState()` - Clears intoxicated/night vision overlay animations
- `resetInsanityState()` - Clears insanity overlay animations

**Note:** Server-side effects are the source of truth. Client overlays are just visual feedback.

## Testing Checklist

✅ **Broth Effects:**
- [ ] Drink Intoxicated potion → Die → Respawn → No drunk overlay
- [ ] Drink NightVision potion → Die → Respawn → No night vision overlay
- [ ] Drink SpeedBoost potion → Die → Respawn → No speed boost

✅ **Entrainment:**
- [ ] Reach 100 insanity → Get Entrainment → Die → Respawn → No Entrainment, insanity = 0

✅ **Visual Overlays:**
- [ ] Intoxicated overlay clears on respawn
- [ ] Insanity overlay clears on respawn
- [ ] Health overlay clears on respawn (if applicable)

✅ **Server-Side Effects:**
- [ ] Check database after death - no active consumable effects (except BuildingPrivilege)
- [ ] Check database after respawn - no broth effects, no Entrainment

## Code References

### Server-Side Clearing
- `server/src/active_effects.rs:1751` - `clear_all_effects_on_death()`
- `server/src/active_effects.rs:3029` - `clear_broth_effects_on_death()`
- `server/src/active_effects.rs:3014` - `cancel_broth_effect()`

### Client-Side Overlay Clearing
- `client/src/App.tsx:591-595` - Respawn detection and overlay reset
- `client/src/utils/renderers/brothEffectsOverlayUtils.ts:284` - `resetBrothEffectsState()`
- `client/src/utils/renderers/insanityOverlayUtils.ts:181` - `resetInsanityState()`

### Respawn Stat Reset
- `server/src/respawn.rs:302` - Insanity reset to 0.0
- `server/src/sleeping_bag.rs:292` - Insanity reset to 0.0

## Important Notes

1. **Entrainment is Permanent While Alive:** Once applied at 100 insanity, it cannot be removed except by death. This is intentional - it's a death sentence.

2. **BuildingPrivilege Exception:** This effect persists through death because it's tied to player identity and building permissions, not temporary buffs.

3. **Client Overlays vs Server Effects:** Client overlays are just visual feedback. The server-side effects are authoritative. If server clears an effect, the client overlay should fade out naturally.

4. **Respawn Detection:** Client detects respawn by tracking `isDead` state transitions (was dead → now alive).

## Future Considerations

If new effects are added:
1. Add to `clear_broth_effects_on_death()` if it's a broth effect
2. Add explicit clearing in `clear_all_effects_on_death()` if it's a special case
3. Update this document with the new effect's persistence behavior

