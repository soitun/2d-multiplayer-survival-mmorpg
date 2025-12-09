# Overlay Fix Summary

## Changes Made

### 1. Extracted Insanity Overlay to Separate File
- **Created**: `client/src/utils/renderers/insanityOverlayUtils.ts`
- **Removed from**: `client/src/utils/renderers/brothEffectsOverlayUtils.ts`
- The insanity overlay is now completely independent and doesn't depend on broth effects

### 2. Updated GameCanvas.tsx
- Added separate import for `renderInsanityOverlay`
- Insanity overlay now renders independently (not tied to `showStatusOverlays` setting)
- Broth effects (NightVision, Intoxicated) still respect `showStatusOverlays` setting

## Main Issue: Status Overlays Setting is Disabled

### The Problem
Your console logs show:
```
[GameCanvas] Broth Effects Overlay SKIPPED - showStatusOverlays: false
```

This means the **Status Overlays** setting is currently **DISABLED** in your game settings.

### What This Affects
When `showStatusOverlays` is false, the following overlays are NOT rendered:
- ❌ Health overlay (red screen when low health)
- ❌ Frost/Cold overlay (blue screen when cold)
- ❌ Weather overlay (atmospheric effects)
- ❌ Broth effects (NightVision, Intoxicated)

### What Still Works
After our changes, the insanity overlay will now render **regardless** of the `showStatusOverlays` setting because:
1. It's a core gameplay mechanic (Memory Shard insanity)
2. It should always be visible when you have insanity

## How to Enable Status Overlays

### Option 1: In-Game Settings Menu
1. Open the game settings menu (usually ESC key)
2. Look for "Visual Settings" or "Graphics Settings"
3. Find the **"STATUS OVERLAYS"** toggle
4. Set it to **ENABLED**

### Option 2: Browser Console
If you want to enable it immediately for testing:
```javascript
localStorage.setItem('statusOverlaysEnabled', 'true');
// Then refresh the page
location.reload();
```

### Option 3: Clear localStorage
```javascript
localStorage.clear();
// Then refresh - this will reset all settings to defaults (which is ENABLED)
location.reload();
```

## Testing the Overlays

### Health Overlay Test
1. Enable Status Overlays
2. Take damage until health is low (< 30%)
3. Screen should turn red around the edges

### Insanity Overlay Test
1. Collect Memory Shards to increase insanity
2. When insanity reaches 10%+, purple/pink glitchy overlay should appear
3. This works **even with Status Overlays disabled** (after our fix)

### Broth Effects Test
1. Enable Status Overlays
2. Drink a NightVision potion at night
3. Screen should have ethereal blue glow
4. Drink an Intoxicated potion
5. Screen should wobble with warm amber tint

## File Structure After Changes

```
client/src/utils/renderers/
├── brothEffectsOverlayUtils.ts  (NightVision, Intoxicated only)
├── insanityOverlayUtils.ts      (Memory Shard insanity - NEW FILE)
├── healthOverlayUtils.ts         (Health and frost overlays)
└── weatherOverlayUtils.ts        (Weather atmospheric effects)
```

Each overlay system is now independent and can be enabled/disabled separately.

