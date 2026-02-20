<!-- bd327e59-fc0a-4663-af42-017d69e34789 dda83c64-9d9f-4caf-acb8-5d689a6169de -->
# Mobile Controls Implementation Plan

## Summary

Add tap-to-walk mobile controls with visual feedback, mobile chat support, and conditionally hide desktop-only UI elements.

## Implementation Steps

### 1. Create Mobile Detection Hook

Create a new hook [`client/src/hooks/useMobileDetection.ts`](client/src/hooks/useMobileDetection.ts) that:

- Detects touch devices via `window.matchMedia('(pointer: coarse)')` and `'ontouchstart' in window`
- Returns `isMobile` boolean
- Handles SSR (server-side rendering) safety

### 2. Create Tap-to-Walk System

Create a new hook [`client/src/hooks/useTapToWalk.ts`](client/src/hooks/useTapToWalk.ts) that:

- Listens for touch events on canvas
- Converts tap screen position to world coordinates using camera offset
- Sets a target destination position
- Calculates direction vector from player to destination each frame
- Moves player toward destination until within threshold distance (then stops)
- Exposes state for tap animation rendering: `{ targetPosition, showAnimation, animationProgress }`

### 3. Add Tap Animation Rendering

Modify [`client/src/components/GameCanvas.tsx`](client/src/components/GameCanvas.tsx) to:

- Import and use `useTapToWalk` hook (only when mobile)
- Render an animated "tap indicator" sprite/circle at the target position
- Animation: expanding ring that fades out over ~500ms

### 4. Update GameMenuButton to Hamburger Icon

Modify [`client/src/components/GameMenuButton.tsx`](client/src/components/GameMenuButton.tsx) to:

- Change "Menu" text to a hamburger icon (three horizontal lines)
- Keep it compact for mobile

### 5. Conditionally Hide UI on Mobile

Modify [`client/src/components/GameScreen.tsx`](client/src/components/GameScreen.tsx) to:

- Import `useMobileDetection` hook
- Wrap the following components with `{!isMobile && ...}` to hide on mobile:
- `PlayerUI` (inventory/crafting)
- `Hotbar` (quick access slots)
- `TargetingReticle`
- `FishingManager`
- `SOVALoadingBar`
- `VoiceInterface`
- Auto-action status indicators
- `DebugPanel`
- Keep visible on mobile:
- `GameMenuButton` (hamburger)
- `DayNightCycleTracker`
- `Chat` (mobile chat support)
- `SpeechBubbleManager` (other players' messages)
- Game menu overlays (when opened)
- `GameCanvas`

### 6. Make Chat Mobile-Friendly

The existing [`client/src/components/Chat.tsx`](client/src/components/Chat.tsx) already supports touch via standard HTML inputs. Minor adjustments may be needed:

- Ensure chat button/toggle is accessible on mobile
- The chat already opens with Enter key but will need a touch-friendly way to open

## Key Architecture Decisions

- **Movement Direction:** Tap-to-walk calculates direction each frame (not just once) so player smoothly curves toward the destination
- **Stopping Logic:** Player stops when within ~16px of destination (one tile)
- **Integration Point:** The tap-to-walk direction feeds into the existing `inputState.direction` used by `usePredictedMovement`
- **Touch vs Mouse:** On mobile, tap events take precedence; existing mouse handlers remain for desktop

## Files to Create

- `client/src/hooks/useMobileDetection.ts`
- `client/src/hooks/useTapToWalk.ts`

## Files to Modify

- `client/src/components/GameScreen.tsx`
- `client/src/components/GameCanvas.tsx`  
- `client/src/components/GameMenuButton.tsx`

### To-dos

- [ ] Create useMobileDetection hook for device detection
- [ ] Create useTapToWalk hook for tap movement + animation state
- [ ] Add tap animation rendering in GameCanvas
- [ ] Update GameMenuButton to show hamburger icon
- [ ] Conditionally hide desktop UI components on mobile in GameScreen