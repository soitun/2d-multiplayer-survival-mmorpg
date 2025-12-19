<!-- bfa6fec8-5725-4087-a231-d9b6744cf13c 5f3cd836-d470-4469-bc12-00cee37f86e8 -->
# Mobile Controls Implementation

## Approach

Implement tap-to-walk controls (no virtual joystick), mobile-friendly chat access, and a map toggle button. Track mobile players server-side and display a phone icon on their name labels when hovered.

## Key Files to Modify

**Client-side:**

- `client/src/hooks/useMobileDetection.ts` (new) - Detect touch devices
- `client/src/hooks/useTapToMove.ts` (new) - Handle tap-to-walk movement
- `client/src/components/MobileControls.tsx` (new) - Floating buttons for map/chat
- `client/src/hooks/useMovementInput.ts` - Add mobile tap movement support
- `client/src/components/GameCanvas.tsx` - Add touch event handlers
- `client/src/components/GameScreen.tsx` - Integrate mobile controls
- `client/src/App.tsx` - Track and send mobile status to server
- `client/src/utils/renderers/playerRenderingUtils.ts` - Render phone icon on labels

**Server-side:**

- `server/src/player.rs` - Add `is_mobile` field to Player table
- `server/src/lib.rs` - Add `set_mobile_status` reducer

## Implementation Details

### 1. Mobile Detection Hook

Create `useMobileDetection.ts` that checks for touch capability using `'ontouchstart' in window` and screen size. Export `isMobile` boolean.

### 2. Tap-to-Walk System

Create `useTapToMove.ts` hook:

- Listen for `touchstart` events on canvas (not interfering with UI)
- Convert touch coordinates to world position using existing camera/viewport logic
- Calculate direction vector from player to tap position  
- Use existing auto-walk mechanism to walk toward target
- Stop when player reaches destination (within threshold)

### 3. Mobile Controls Component

Create `MobileControls.tsx` with floating buttons:

- **Map button** (bottom-right): Calls `setIsMinimapOpen(prev => !prev)` 
- **Chat button** (bottom-left): Calls `setIsChatting(true)`
- Styled consistently with existing UI (cyan/purple theme)
- Only renders when `isMobile` is true

### 4. Server-side Mobile Tracking

Add `is_mobile: bool` to Player table. Create reducer `set_mobile_status(is_mobile: bool)` called on connect.

### 5. Phone Icon on Player Labels

In `playerRenderingUtils.ts`, modify `drawPlayerNameTag()`:

- Accept `isMobile` parameter
- When `shouldShowLabel` is true and player is mobile, render small phone emoji/icon next to username

## UI Layout (Mobile)

```
+---------------------------+
| [Menu]     [Day/Night]    |  <- Keep existing
|                           |
|                           |
|      (tap anywhere to     |
|         walk there)       |
|                           |
| [Chat]           [Map]    |  <- New mobile buttons
+---------------------------+
```

### To-dos

- [ ] Create useMobileDetection hook for touch device detection
- [ ] Create useTapToMove hook for tap-to-walk movement
- [ ] Create MobileControls component with map/chat buttons
- [ ] Add is_mobile field to Player table and set_mobile_status reducer
- [ ] Add phone icon to player labels for mobile users
- [ ] Integrate mobile controls into GameScreen and App components