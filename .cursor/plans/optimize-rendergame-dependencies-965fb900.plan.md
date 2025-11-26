<!-- 965fb900-0f25-4329-b9a8-9a40cf7af1d8 3479266b-a410-415a-92ea-67dd53b57b1a -->
# Optimize renderGame Dependency Array

## Problem

The `renderGame` useCallback in [GameCanvas.tsx](client/src/components/GameCanvas.tsx) has ~70 dependencies. A few of these change very frequently, causing the callback to be recreated constantly:

- `animationFrame` - changes every frame (60x/sec)
- `worldMousePos.x`, `worldMousePos.y` - changes on mouse move
- `cameraOffsetX`, `cameraOffsetY` - changes on camera movement
- `predictedPosition` - changes on player movement

## Solution

Convert these high-frequency values to refs. The callback reads from `.current` instead of closing over the value, so it doesn't need to be in the dependency array.

## Implementation

### Step 1: Create refs for high-frequency values

Add new refs near line 312 in GameCanvas.tsx:

```typescript
const animationFrameRef = useRef(animationFrame);
const worldMousePosRef = useRef(worldMousePos);
const cameraOffsetRef = useRef({ x: cameraOffsetX, y: cameraOffsetY });
const predictedPositionRef = useRef(predictedPosition);
```

### Step 2: Keep refs in sync with useEffect

Add sync effects that update the refs when values change:

```typescript
useEffect(() => { animationFrameRef.current = animationFrame; }, [animationFrame]);
useEffect(() => { worldMousePosRef.current = worldMousePos; }, [worldMousePos]);
useEffect(() => { cameraOffsetRef.current = { x: cameraOffsetX, y: cameraOffsetY }; }, [cameraOffsetX, cameraOffsetY]);
useEffect(() => { predictedPositionRef.current = predictedPosition; }, [predictedPosition]);
```

### Step 3: Update renderGame to read from refs

Inside `renderGame`, change:

```typescript
// Before
const currentWorldMouseX = worldMousePos.x;
const currentWorldMouseY = worldMousePos.y;

// After  
const currentWorldMouseX = worldMousePosRef.current.x;
const currentWorldMouseY = worldMousePosRef.current.y;
```

Similarly for `cameraOffsetX/Y`, `animationFrame`, and `predictedPosition`.

### Step 4: Remove from dependency array

Remove these from the dependency array (lines 2588-2629):

- `animationFrame`
- `worldMousePos.x`, `worldMousePos.y`
- `cameraOffsetX`, `cameraOffsetY`
- `predictedPosition`

## Expected Impact

- Reduces callback recreations from ~60/second to only when entity data actually changes
- Zero feature changes - rendering logic remains identical
- Easy to verify - game should look and behave exactly the same

## Risk Mitigation

- Test player movement and camera following
- Test mouse interactions (placement, hovering)
- Test animation smoothness
- If any issues, refs can be easily reverted to direct values

### To-dos

- [ ] Create refs for animationFrame, worldMousePos, cameraOffset, predictedPosition
- [ ] Add useEffect hooks to keep refs in sync with their source values
- [ ] Update renderGame to read from refs instead of closed-over values
- [ ] Remove converted values from renderGame dependency array
- [ ] Test player movement, camera, mouse interactions, and animations