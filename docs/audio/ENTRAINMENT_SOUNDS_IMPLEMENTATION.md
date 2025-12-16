# Entrainment Sounds Implementation

## Overview
Complete sound system for the Entrainment effect (max insanity death sentence). Includes both random quote playback and continuous ambient background sound.

## Files Created/Modified

### New Files
- **`client/src/hooks/useEntrainmentSovaSounds.ts`** - Main hook for Entrainment sounds

### Modified Files
- **`client/src/App.tsx`** - Integrated the Entrainment sounds hook

## Sound Files Required

### Quote Sounds (60 files)
**Location:** `public/sounds/`

**Naming Convention:**
- `sova_entrainment_1.mp3` through `sova_entrainment_60.mp3`
- Each file contains one of the 60 Entrainment quotes from `docs/SOVA_ENTRAINMENT_QUOTES.md`

**Audio Requirements:**
- Should have distortion/glitch effects baked into the audio files
- Volume: 0.8 (slightly louder than normal SOVA quotes for urgency)
- Duration: Varies per quote (typically 3-10 seconds)

### Ambient Sound (1 file)
**Location:** `public/sounds/`

**Naming Convention:**
- `sova_entrainment_ambient.mp3`

**Audio Requirements:**
- Continuous loop (seamless looping)
- Heavy distortion/glitch effects baked in
- Low-pass filtered for muffled effect
- Volume: 0.3 (background ambience, not overpowering)
- Duration: 30-60 seconds (loops seamlessly)

## How It Works

### Quote System
1. **Detection:** Hook detects when Entrainment effect is applied to local player
2. **First Quote:** Plays after 5-15 second delay (random)
3. **Subsequent Quotes:** Random interval of 30-90 seconds between quotes
4. **No Interruption:** Won't play a new quote if one is already playing
5. **Continuous Loop:** When a quote ends, schedules the next one automatically

### Ambient Sound System
1. **Starts:** When Entrainment effect is detected
2. **Loops:** Continuously until Entrainment is cleared
3. **Stops:** When Entrainment effect is removed (death/respawn)

### Effect Lifecycle
```
Player reaches 100 insanity
    ↓
Entrainment effect applied
    ↓
Hook detects effect
    ↓
Ambient sound starts looping
    ↓
First quote plays after 5-15 seconds
    ↓
Quotes play every 30-90 seconds (random)
    ↓
Player dies
    ↓
Entrainment effect cleared
    ↓
Ambient sound stops
    ↓
Quote system stops
```

## Code Integration

### Hook Usage
```typescript
useEntrainmentSovaSounds({ 
  activeConsumableEffects, 
  localPlayerId: dbIdentity?.toHexString() 
});
```

### Detection Logic
The hook checks for Entrainment effect by:
1. Looking through `activeConsumableEffects` map
2. Finding effects where `playerId` matches local player
3. Checking if `effectType.tag === 'Entrainment'`

## Technical Details

### Quote Scheduling Algorithm
1. Check if Entrainment is still active
2. Check if a quote is currently playing
3. If playing, wait 2 seconds and check again
4. If not playing, schedule next quote with random delay (30-90s)
5. When quote ends, automatically schedule next one

### Audio Management
- Uses HTML5 Audio API for simplicity
- Tracks current playing quote via `currentQuoteAudioRef`
- Tracks ambient sound via `ambientAudioRef`
- Properly cleans up on unmount or effect removal

### Performance Considerations
- Uses refs to avoid unnecessary re-renders
- Checks quote playback status before scheduling new ones
- Cleans up timers and audio elements properly
- No memory leaks

## Testing Checklist

✅ **Quote System:**
- [ ] Entrainment effect applied → First quote plays after 5-15 seconds
- [ ] Quotes continue playing every 30-90 seconds
- [ ] New quote doesn't interrupt currently playing quote
- [ ] Quotes stop when Entrainment effect is cleared

✅ **Ambient Sound:**
- [ ] Ambient sound starts when Entrainment effect is applied
- [ ] Ambient sound loops continuously
- [ ] Ambient sound stops when Entrainment effect is cleared
- [ ] Ambient sound volume is appropriate (not too loud)

✅ **Effect Clearing:**
- [ ] Player dies → All sounds stop
- [ ] Player respawns → No sounds playing (Entrainment cleared)
- [ ] Effect removed manually → Sounds stop immediately

✅ **Edge Cases:**
- [ ] Multiple Entrainment effects (shouldn't happen, but handle gracefully)
- [ ] Audio files missing → Graceful failure (warnings in console)
- [ ] Browser autoplay restrictions → Handled via play().catch()

## Audio Production Notes

### Quote Audio Files
- Record SOVA voice saying each of the 60 quotes
- Apply heavy distortion/glitch effects during production
- Add subtle pitch variations for variety
- Ensure consistent volume levels across all files
- Keep background noise minimal (focus on voice)

### Ambient Audio File
- Create continuous distorted/glitchy loop
- Low-frequency rumble or static
- Should be subtle enough to not overpower quotes
- Seamless loop point (no audible gap)
- 30-60 second duration recommended

## Future Enhancements

Potential improvements:
1. **Web Audio API Integration:** Real-time distortion effects (currently relies on baked-in effects)
2. **Dynamic Volume:** Ambient volume could pulse with Entrainment damage ticks
3. **Spatial Audio:** If multiplayer, quotes could have spatial positioning
4. **Visual Feedback:** Screen effects synchronized with audio (already handled by overlay system)

## Related Files
- `docs/SOVA_ENTRAINMENT_QUOTES.md` - All 60 Entrainment quotes
- `client/src/utils/renderers/insanityOverlayUtils.ts` - Visual overlay for Entrainment
- `server/src/active_effects.rs` - Entrainment effect definition and damage logic

