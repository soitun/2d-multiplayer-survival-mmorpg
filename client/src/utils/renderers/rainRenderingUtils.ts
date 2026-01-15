/**
 * Rain/Snow Rendering Utilities
 * 
 * Renders pixel art rain or snow particles that fall across the screen.
 * Rain intensity and type are controlled by the server's weather system.
 * In winter, "rain" is visually rendered as snow - same server mechanics,
 * different client-side appearance.
 */

interface RainDrop {
  x: number;
  y: number;
  speed: number;
  length: number;
  opacity: number;
  thickness: number;
  // Snow-specific properties
  drift: number;       // Horizontal drift amount for snow
  driftPhase: number;  // Phase offset for sinusoidal drift
}

interface RainSplash {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
  startTime: number;
  duration: number;
}

interface ThunderFlash {
  startTime: number;
  duration: number;
  intensity: number;
  opacity: number;
}

interface RainSystemState {
  drops: RainDrop[];
  splashes: RainSplash[];
  lastUpdate: number;
  windOffset: number;
  gustPhase: number;
  lastSpawnTime: number;
  thunderFlash: ThunderFlash | null;
}

// Rain base configuration (shared constants)
const RAIN_CONFIG = {
  // Drop counts for different intensities
  LIGHT_RAIN_DROPS: 600,
  MODERATE_RAIN_DROPS: 1200,
  HEAVY_RAIN_DROPS: 2000,
  HEAVY_STORM_DROPS: 3000,
  
  // Screen margins (spawn rain outside visible area)
  SPAWN_MARGIN: 800,
  
  // Gust timing
  GUST_FREQUENCY: 0.5,
  
  // Visual properties (shared)
  RAIN_COLOR: '#87CEEB',         // Light blue
  RAIN_SHADOW_COLOR: '#4682B4',  // Darker blue for depth
  SPLASH_COLOR: '#87CEEB',
};

// Rain configuration - intensity-specific settings for AAA visual quality
// Each level creates a distinctly different visual experience
const RAIN_CONFIGS = {
  // Light Rain: Gentle drizzle, thin drops, minimal wind
  LIGHT: {
    MIN_SPEED: 180,
    MAX_SPEED: 280,
    MIN_LENGTH: 6,
    MAX_LENGTH: 12,
    MIN_THICKNESS: 1,
    MAX_THICKNESS: 1,
    MIN_OPACITY: 0.25,
    MAX_OPACITY: 0.5,
    BASE_ANGLE: 5,           // Almost vertical
    WIND_VARIATION: 3,       // Minimal wind sway
    DROP_MULTIPLIER: 0.6,    // Sparse
    SPLASH_RATE: 10,         // Few splashes
    SPLASH_MIN_RADIUS: 2,
    SPLASH_MAX_RADIUS: 5,
    SPLASH_DURATION: 400,
    STREAK_CHANCE: 0,        // No streaks
  },
  // Moderate Rain: Steady rain, medium drops, some wind
  MODERATE: {
    MIN_SPEED: 250,
    MAX_SPEED: 380,
    MIN_LENGTH: 10,
    MAX_LENGTH: 18,
    MIN_THICKNESS: 1,
    MAX_THICKNESS: 1.5,
    MIN_OPACITY: 0.35,
    MAX_OPACITY: 0.65,
    BASE_ANGLE: 12,          // Slight angle
    WIND_VARIATION: 8,       // Noticeable wind
    DROP_MULTIPLIER: 0.85,   // Medium density
    SPLASH_RATE: 25,         // Regular splashes
    SPLASH_MIN_RADIUS: 3,
    SPLASH_MAX_RADIUS: 8,
    SPLASH_DURATION: 500,
    STREAK_CHANCE: 0,        // No streaks yet
  },
  // Heavy Rain: Downpour, thick drops, strong wind, mist effect
  HEAVY: {
    MIN_SPEED: 350,
    MAX_SPEED: 500,
    MIN_LENGTH: 14,
    MAX_LENGTH: 24,
    MIN_THICKNESS: 1,
    MAX_THICKNESS: 2,
    MIN_OPACITY: 0.45,
    MAX_OPACITY: 0.8,
    BASE_ANGLE: 20,          // Noticeable angle
    WIND_VARIATION: 15,      // Strong gusts
    DROP_MULTIPLIER: 1.0,    // Dense
    SPLASH_RATE: 45,         // Many splashes
    SPLASH_MIN_RADIUS: 4,
    SPLASH_MAX_RADIUS: 12,
    SPLASH_DURATION: 550,
    STREAK_CHANCE: 0.1,      // Some streaks
    MIST_OPACITY: 0.06,      // Light mist overlay
  },
  // Heavy Storm: Torrential, thick fast drops, chaotic wind, reduced visibility
  STORM: {
    MIN_SPEED: 450,
    MAX_SPEED: 650,
    MIN_LENGTH: 18,
    MAX_LENGTH: 35,
    MIN_THICKNESS: 1.5,
    MAX_THICKNESS: 3,
    MIN_OPACITY: 0.5,
    MAX_OPACITY: 0.9,
    BASE_ANGLE: 30,          // Strong angle
    WIND_VARIATION: 25,      // Chaotic gusts
    DROP_MULTIPLIER: 1.3,    // Very dense
    SPLASH_RATE: 70,         // Tons of splashes
    SPLASH_MIN_RADIUS: 5,
    SPLASH_MAX_RADIUS: 16,
    SPLASH_DURATION: 650,
    STREAK_CHANCE: 0.25,     // Many "sheet rain" streaks
    MIST_OPACITY: 0.12,      // Heavier mist
    DARK_OPACITY: 0.08,      // Slight darkening (stormy atmosphere)
  },
};

// Helper to get the appropriate rain config based on intensity
function getRainConfig(intensity: number) {
  if (intensity >= 1.0) return RAIN_CONFIGS.STORM;
  if (intensity >= 0.7) return RAIN_CONFIGS.HEAVY;
  if (intensity >= 0.4) return RAIN_CONFIGS.MODERATE;
  return RAIN_CONFIGS.LIGHT;
}

// Snow configuration - intensity-specific settings for AAA visual quality
// Each level creates a distinctly different visual experience
const SNOW_CONFIGS = {
  // Light Snow: Gentle, sparse, peaceful
  LIGHT: {
    MIN_SPEED: 25,
    MAX_SPEED: 50,
    MIN_SIZE: 1.5,
    MAX_SIZE: 3,
    DRIFT_AMOUNT: 8,         // Minimal drift - almost straight down
    DRIFT_FREQUENCY: 1.0,    // Slow, gentle oscillation
    BASE_ANGLE: 3,           // Nearly vertical
    WIND_MULTIPLIER: 0.2,    // Barely affected by wind
    DROP_MULTIPLIER: 0.5,    // Sparse
  },
  // Moderate Snow: Noticeable, but calm
  MODERATE: {
    MIN_SPEED: 40,
    MAX_SPEED: 80,
    MIN_SIZE: 2,
    MAX_SIZE: 4,
    DRIFT_AMOUNT: 25,        // Noticeable drift
    DRIFT_FREQUENCY: 1.5,    // Moderate oscillation
    BASE_ANGLE: 8,           // Slight angle
    WIND_MULTIPLIER: 0.4,    // Some wind effect
    DROP_MULTIPLIER: 0.7,    // Medium density
  },
  // Heavy Snow: Dense, fast, building up
  HEAVY: {
    MIN_SPEED: 60,
    MAX_SPEED: 120,
    MIN_SIZE: 2.5,
    MAX_SIZE: 5,
    DRIFT_AMOUNT: 45,        // Strong drift
    DRIFT_FREQUENCY: 2.0,    // Faster oscillation
    BASE_ANGLE: 15,          // Noticeable angle
    WIND_MULTIPLIER: 0.7,    // Affected by wind
    DROP_MULTIPLIER: 0.9,    // Dense
  },
  // Blizzard: Extreme, chaotic, reduced visibility
  BLIZZARD: {
    MIN_SPEED: 160,          // Much faster
    MAX_SPEED: 300,          // Very fast gusts
    MIN_SIZE: 2,             // Slightly smaller for dense blizzard look
    MAX_SIZE: 5,
    DRIFT_AMOUNT: 100,       // Extreme horizontal drift
    DRIFT_FREQUENCY: 3.5,    // Rapid, chaotic oscillation
    BASE_ANGLE: 55,          // Very sideways - driving snow
    WIND_MULTIPLIER: 1.5,    // Heavily affected by gusts
    DROP_MULTIPLIER: 1.4,    // Very dense (more particles instead of streaks)
    FOG_OPACITY: 0.15,       // Whiteout effect
  },
  // Visual properties (shared)
  SNOW_COLOR: '#FFFFFF',
  SNOW_SHADOW_COLOR: '#E8E8E8',
  MIN_OPACITY: 0.5,
  MAX_OPACITY: 0.95,
};

// Helper to get the appropriate snow config based on intensity
function getSnowConfig(intensity: number) {
  if (intensity >= 1.0) return SNOW_CONFIGS.BLIZZARD;
  if (intensity >= 0.7) return SNOW_CONFIGS.HEAVY;
  if (intensity >= 0.4) return SNOW_CONFIGS.MODERATE;
  return SNOW_CONFIGS.LIGHT;
}

let rainSystem: RainSystemState = {
  drops: [],
  splashes: [],
  lastUpdate: 0,
  windOffset: 0,
  gustPhase: 0,
  lastSpawnTime: 0,
  thunderFlash: null,
};

/**
 * Creates a splash effect when a raindrop hits the ground
 * Uses intensity-specific splash configuration for varied visual impact
 */
function createSplashWithConfig(x: number, y: number, rainConfig: typeof RAIN_CONFIGS.LIGHT): RainSplash {
  const maxRadius = rainConfig.SPLASH_MIN_RADIUS + 
    Math.random() * (rainConfig.SPLASH_MAX_RADIUS - rainConfig.SPLASH_MIN_RADIUS);
  
  return {
    x,
    y,
    radius: 0,
    maxRadius,
    opacity: 0.7 + Math.random() * 0.3,
    startTime: performance.now(),
    duration: rainConfig.SPLASH_DURATION * (0.8 + Math.random() * 0.4),
  };
}

/**
 * Creates a splash effect (legacy - uses moderate rain defaults)
 */
function createSplash(x: number, y: number): RainSplash {
  return createSplashWithConfig(x, y, RAIN_CONFIGS.MODERATE);
}

/**
 * Creates a new raindrop/snowflake with random properties in world space
 */
function createRainDrop(
  cameraX: number, 
  cameraY: number, 
  canvasWidth: number, 
  canvasHeight: number, 
  intensity: number,
  isWinter: boolean = false
): RainDrop {
  // Calculate world space bounds for spawning (larger area around camera)
  const worldSpawnWidth = canvasWidth + RAIN_CONFIG.SPAWN_MARGIN * 8;
  const worldSpawnHeight = canvasHeight + RAIN_CONFIG.SPAWN_MARGIN * 8;
  
  // Spawn drops in world space around the camera
  const spawnX = cameraX - worldSpawnWidth / 2 + Math.random() * worldSpawnWidth;
  const spawnY = cameraY - worldSpawnHeight / 2 - Math.random() * RAIN_CONFIG.SPAWN_MARGIN;
  
  if (isWinter) {
    // Create snowflake with intensity-specific properties
    const snowConfig = getSnowConfig(intensity);
    const speed = snowConfig.MIN_SPEED + Math.random() * (snowConfig.MAX_SPEED - snowConfig.MIN_SPEED);
    const size = snowConfig.MIN_SIZE + Math.random() * (snowConfig.MAX_SIZE - snowConfig.MIN_SIZE);
    const opacity = SNOW_CONFIGS.MIN_OPACITY + (SNOW_CONFIGS.MAX_OPACITY - SNOW_CONFIGS.MIN_OPACITY) * (0.7 + Math.random() * 0.3);
    
    return {
      x: spawnX,
      y: spawnY,
      speed,
      length: size,      // For snow, length = size (pixel squares)
      opacity,
      thickness: size,   // Snowflakes use size for thickness
      drift: snowConfig.DRIFT_AMOUNT * (0.5 + Math.random() * 0.5),
      driftPhase: Math.random() * Math.PI * 2,
    };
  } else {
    // Create raindrop with intensity-specific properties
    const rainConfig = getRainConfig(intensity);
    const speed = rainConfig.MIN_SPEED + Math.random() * (rainConfig.MAX_SPEED - rainConfig.MIN_SPEED);
    
    // Check if this drop should be a "sheet rain" streak (heavy storms)
    const isStreak = rainConfig.STREAK_CHANCE > 0 && Math.random() < rainConfig.STREAK_CHANCE;
    const baseLength = rainConfig.MIN_LENGTH + Math.random() * (rainConfig.MAX_LENGTH - rainConfig.MIN_LENGTH);
    const length = isStreak ? baseLength * 2.5 : baseLength; // Streaks are longer
    
    const opacity = rainConfig.MIN_OPACITY + (rainConfig.MAX_OPACITY - rainConfig.MIN_OPACITY) * (0.8 + Math.random() * 0.2);
    const thickness = rainConfig.MIN_THICKNESS + Math.random() * (rainConfig.MAX_THICKNESS - rainConfig.MIN_THICKNESS);
    
    return {
      x: spawnX,
      y: spawnY,
      speed,
      length,
      opacity,
      thickness: isStreak ? thickness * 0.8 : thickness, // Streaks are slightly thinner
      drift: 0,
      driftPhase: 0,
    };
  }
}

/**
 * Updates rain/snow drop positions and removes drops that have fallen off screen
 */
function updateRainDrops(
  deltaTime: number, 
  cameraX: number,
  cameraY: number,
  canvasWidth: number, 
  canvasHeight: number, 
  intensity: number,
  isWinter: boolean = false
): void {
  const currentTime = performance.now();
  
  // Update wind effects - gust intensity varies by weather type
  rainSystem.gustPhase += deltaTime * RAIN_CONFIG.GUST_FREQUENCY;
  
  // Calculate fall angle with wind - both rain and snow use intensity-specific settings
  let baseAngle: number;
  let windVariation: number;
  let driftFrequency: number;
  
  if (isWinter) {
    const snowConfig = getSnowConfig(intensity);
    const windGust = Math.sin(rainSystem.gustPhase) * 10; // Base wind variation
    baseAngle = snowConfig.BASE_ANGLE;
    windVariation = windGust * snowConfig.WIND_MULTIPLIER;
    driftFrequency = snowConfig.DRIFT_FREQUENCY;
    rainSystem.windOffset = windVariation;
  } else {
    const rainConfig = getRainConfig(intensity);
    const windGust = Math.sin(rainSystem.gustPhase) * rainConfig.WIND_VARIATION;
    baseAngle = rainConfig.BASE_ANGLE;
    windVariation = windGust;
    driftFrequency = 2.0;
    rainSystem.windOffset = windGust;
  }
  
  const fallAngle = (baseAngle + windVariation) * (Math.PI / 180);
  const horizontalSpeed = Math.sin(fallAngle);
  const verticalSpeed = Math.cos(fallAngle);
  
  // Calculate world space bounds for culling (larger area around camera)
  const cullMargin = RAIN_CONFIG.SPAWN_MARGIN * 2;
  const leftBound = cameraX - canvasWidth / 2 - cullMargin;
  const rightBound = cameraX + canvasWidth / 2 + cullMargin;
  const topBound = cameraY - canvasHeight / 2 - cullMargin;
  const bottomBound = cameraY + canvasHeight / 2 + cullMargin;
  
  // Update existing drops
  for (let i = rainSystem.drops.length - 1; i >= 0; i--) {
    const drop = rainSystem.drops[i];
    
    if (isWinter && drop.drift > 0) {
      // Snow: update drift phase and apply sinusoidal horizontal movement
      // Drift frequency varies by intensity (blizzard = chaotic, light = gentle)
      drop.driftPhase += deltaTime * driftFrequency;
      const driftOffset = Math.sin(drop.driftPhase) * drop.drift * deltaTime;
      // In blizzards, horizontal movement is much stronger
      const horizontalMultiplier = intensity >= 1.0 ? 0.8 : 0.3;
      drop.x += driftOffset + drop.speed * horizontalSpeed * deltaTime * horizontalMultiplier;
      drop.y += drop.speed * verticalSpeed * deltaTime;
    } else {
      // Rain: normal movement
      drop.x += drop.speed * horizontalSpeed * deltaTime;
      drop.y += drop.speed * verticalSpeed * deltaTime;
    }
    
    // Remove drops that have moved too far from camera (world space culling)
    if (drop.x > rightBound || 
        drop.x < leftBound ||
        drop.y < topBound ||
        drop.y > bottomBound) {
      rainSystem.drops.splice(i, 1);
    }
  }
  
  // Create random splashes across the entire visible area (only for rain, not snow)
  if (intensity > 0 && !isWinter) {
    const rainConfig = getRainConfig(intensity);
    const splashRate = rainConfig.SPLASH_RATE;
    const splashesToCreate = Math.max(1, Math.floor(splashRate * deltaTime));
    
    for (let i = 0; i < splashesToCreate; i++) {
      const splashX = cameraX - canvasWidth / 2 + Math.random() * canvasWidth;
      const splashY = cameraY - canvasHeight / 2 + Math.random() * canvasHeight;
      rainSystem.splashes.push(createSplashWithConfig(splashX, splashY, rainConfig));
    }
  }
  
  // Update splash effects (rain splashes or snow landing)
  for (let i = rainSystem.splashes.length - 1; i >= 0; i--) {
    const splash = rainSystem.splashes[i];
    const elapsed = currentTime - splash.startTime;
    const progress = elapsed / splash.duration;
    
    if (progress >= 1.0) {
      rainSystem.splashes.splice(i, 1);
    } else {
      splash.radius = Math.max(0, splash.maxRadius * progress);
      splash.opacity = Math.max(0, (0.8 + Math.random() * 0.2) * (1.0 - progress));
    }
  }
  
  // Determine target drop count based on intensity
  // Both rain and snow use intensity-specific multipliers for different visual density
  const dropMultiplier = isWinter 
    ? getSnowConfig(intensity).DROP_MULTIPLIER 
    : getRainConfig(intensity).DROP_MULTIPLIER;
  let targetDropCount = 0;
  if (intensity > 0) {
    if (intensity <= 0.4) {
      targetDropCount = Math.floor(RAIN_CONFIG.LIGHT_RAIN_DROPS * intensity / 0.4 * dropMultiplier);
    } else if (intensity <= 0.7) {
      targetDropCount = Math.floor((RAIN_CONFIG.LIGHT_RAIN_DROPS + 
        RAIN_CONFIG.MODERATE_RAIN_DROPS * (intensity - 0.4) / 0.3) * dropMultiplier);
    } else if (intensity < 1.0) {
      targetDropCount = Math.floor((RAIN_CONFIG.LIGHT_RAIN_DROPS + RAIN_CONFIG.MODERATE_RAIN_DROPS +
        RAIN_CONFIG.HEAVY_RAIN_DROPS * (intensity - 0.7) / 0.3) * dropMultiplier);
    } else {
      targetDropCount = Math.floor((RAIN_CONFIG.LIGHT_RAIN_DROPS + RAIN_CONFIG.MODERATE_RAIN_DROPS + 
        RAIN_CONFIG.HEAVY_RAIN_DROPS + RAIN_CONFIG.HEAVY_STORM_DROPS) * dropMultiplier);
    }
  }
  
  // INSTANT FILL: If we have significantly fewer drops than needed, instantly spawn them
  const currentDropCount = rainSystem.drops.length;
  if (currentDropCount < targetDropCount * 0.7) {
    const dropsNeeded = targetDropCount - currentDropCount;
    
    for (let i = 0; i < dropsNeeded; i++) {
      const newDrop = createRainDrop(cameraX, cameraY, canvasWidth, canvasHeight, intensity, isWinter);
      
      const spawnAreaHeight = canvasHeight + RAIN_CONFIG.SPAWN_MARGIN * 4;
      newDrop.y = cameraY - canvasHeight / 2 - RAIN_CONFIG.SPAWN_MARGIN + Math.random() * spawnAreaHeight;
      
      rainSystem.drops.push(newDrop);
    }
  }
  
  // Continuous spawning for new drops at the top
  // Snow spawn rate varies by intensity - blizzards spawn more rapidly
  const snowSpawnMultiplier = isWinter ? (intensity >= 1.0 ? 60 : intensity >= 0.7 ? 40 : 25) : 50;
  const spawnRate = intensity * snowSpawnMultiplier;
  const dropsToSpawn = Math.floor(spawnRate * deltaTime);
  
  for (let i = 0; i < dropsToSpawn && rainSystem.drops.length < targetDropCount * 1.2; i++) {
    const newDrop = createRainDrop(cameraX, cameraY, canvasWidth, canvasHeight, intensity, isWinter);
    newDrop.y = cameraY - canvasHeight / 2 - RAIN_CONFIG.SPAWN_MARGIN;
    rainSystem.drops.push(newDrop);
  }
  
  // Remove excess drops if intensity decreased
  while (rainSystem.drops.length > targetDropCount * 1.3) {
    rainSystem.drops.pop();
  }
}

/**
 * Renders splash effects on the canvas (rain splashes, not used for snow)
 * Splash size and intensity vary based on rain intensity
 */
function renderSplashes(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  canvasWidth: number,
  canvasHeight: number,
  isWinter: boolean = false,
  intensity: number = 0.5
): void {
  if (rainSystem.splashes.length === 0) return;
  
  // Snow doesn't have splashes in the same way - skip rendering
  if (isWinter) return;
  
  ctx.save();
  
  const screenCenterX = canvasWidth / 2;
  const screenCenterY = canvasHeight / 2;
  const isHeavy = intensity >= 0.7;
  const isStorm = intensity >= 1.0;
  
  rainSystem.splashes.forEach(splash => {
    const screenX = screenCenterX + (splash.x - cameraX);
    const screenY = screenCenterY + (splash.y - cameraY);
    
    const margin = 50;
    if (screenX < -margin || screenX > canvasWidth + margin || 
        screenY < -margin || screenY > canvasHeight + margin) {
      return;
    }
    
    // Larger splashes in storms get a "crown" effect
    const isLargeSplash = splash.maxRadius > 10;
    
    ctx.globalAlpha = splash.opacity * 0.7;
    
    // Inner splash (water droplet)
    ctx.fillStyle = RAIN_CONFIG.SPLASH_COLOR;
    ctx.beginPath();
    ctx.arc(screenX, screenY, splash.radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
    
    // Outer ring
    ctx.strokeStyle = RAIN_CONFIG.SPLASH_COLOR;
    ctx.lineWidth = isStorm ? 1.5 : 1;
    ctx.beginPath();
    ctx.arc(screenX, screenY, splash.radius, 0, Math.PI * 2);
    ctx.stroke();
    
    // Second ring for heavy rain (ripple effect)
    if (isHeavy && splash.radius > splash.maxRadius * 0.3) {
      ctx.globalAlpha = splash.opacity * 0.3;
      ctx.beginPath();
      ctx.arc(screenX, screenY, splash.radius * 1.4, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Crown splash particles for large storm splashes
    if (isStorm && isLargeSplash && splash.radius > splash.maxRadius * 0.2 && splash.radius < splash.maxRadius * 0.6) {
      ctx.globalAlpha = splash.opacity * 0.5;
      ctx.fillStyle = '#a0d4f4'; // Lighter blue for spray
      const numParticles = 5;
      const particleRadius = 1.5;
      for (let i = 0; i < numParticles; i++) {
        const angle = (i / numParticles) * Math.PI * 2;
        const distance = splash.radius * 0.8;
        const px = screenX + Math.cos(angle) * distance;
        const py = screenY + Math.sin(angle) * distance - splash.radius * 0.3; // Slightly above
        ctx.beginPath();
        ctx.arc(px, py, particleRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
  
  ctx.restore();
}

/**
 * Renders rain drops or snowflakes on the canvas
 */
function renderRainDrops(
  ctx: CanvasRenderingContext2D, 
  cameraX: number,
  cameraY: number,
  canvasWidth: number,
  canvasHeight: number,
  intensity: number,
  isWinter: boolean = false
): void {
  if (rainSystem.drops.length === 0) return;
  
  ctx.save();
  
  // Calculate screen center
  const screenCenterX = canvasWidth / 2;
  const screenCenterY = canvasHeight / 2;
  
  if (isWinter) {
    const snowConfig = getSnowConfig(intensity);
    const isBlizzard = intensity >= 1.0;
    
    // Blizzard whiteout effect - soft radial gradient from edges (visibility reduction)
    if (isBlizzard && 'FOG_OPACITY' in snowConfig) {
      const fogOpacity = (snowConfig as any).FOG_OPACITY;
      const centerX = canvasWidth / 2;
      const centerY = canvasHeight / 2;
      const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);
      
      // Create radial gradient - clear in center, foggy at edges (vignette whiteout)
      const gradient = ctx.createRadialGradient(
        centerX, centerY, maxRadius * 0.3,  // Inner circle (clear zone)
        centerX, centerY, maxRadius * 1.1   // Outer circle (full fog)
      );
      gradient.addColorStop(0, `rgba(255, 255, 255, 0)`);           // Clear center
      gradient.addColorStop(0.5, `rgba(240, 245, 250, ${fogOpacity * 0.4})`); // Slight fog mid
      gradient.addColorStop(0.8, `rgba(230, 235, 245, ${fogOpacity * 0.8})`); // More fog
      gradient.addColorStop(1, `rgba(220, 228, 240, ${fogOpacity})`);         // Edge fog (slightly blue-tinted)
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      
      // Add subtle top-down wind haze (snow being blown across screen)
      const windAngle = (snowConfig.BASE_ANGLE + rainSystem.windOffset * snowConfig.WIND_MULTIPLIER) * (Math.PI / 180);
      const hazeGradient = ctx.createLinearGradient(
        canvasWidth * 0.5 - Math.sin(windAngle) * canvasWidth,
        0,
        canvasWidth * 0.5 + Math.sin(windAngle) * canvasWidth,
        canvasHeight
      );
      hazeGradient.addColorStop(0, `rgba(255, 255, 255, ${fogOpacity * 0.3})`);
      hazeGradient.addColorStop(0.5, `rgba(255, 255, 255, 0)`);
      hazeGradient.addColorStop(1, `rgba(255, 255, 255, ${fogOpacity * 0.2})`);
      
      ctx.fillStyle = hazeGradient;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }
    
    // Render snowflakes as pixel-art squares
    rainSystem.drops.forEach((drop, index) => {
      const screenX = screenCenterX + (drop.x - cameraX);
      const screenY = screenCenterY + (drop.y - cameraY);
      
      const margin = 50;
      if (screenX < -margin || screenX > canvasWidth + margin || 
          screenY < -margin || screenY > canvasHeight + margin) {
        return;
      }
      
      // Alternate between main color and shadow color for depth
      const isBackground = index % 4 === 0;
      ctx.fillStyle = isBackground ? SNOW_CONFIGS.SNOW_SHADOW_COLOR : SNOW_CONFIGS.SNOW_COLOR;
      ctx.globalAlpha = drop.opacity * (isBackground ? 0.5 : 1.0);
      
      // Draw snowflake as a pixel-art square (crisp, no anti-aliasing look)
      const size = Math.max(1, Math.floor(drop.thickness));
      ctx.fillRect(
        Math.floor(screenX - size / 2),
        Math.floor(screenY - size / 2),
        size,
        size
      );
      
      // Larger flakes in calm snow get a subtle cross pattern (pixel art snowflake)
      if (size >= 3 && !isBackground && !isBlizzard) {
        ctx.globalAlpha = drop.opacity * 0.4;
        // Add 1px extensions for a + shape
        ctx.fillRect(Math.floor(screenX - size / 2 - 1), Math.floor(screenY), 1, 1);
        ctx.fillRect(Math.floor(screenX + size / 2), Math.floor(screenY), 1, 1);
        ctx.fillRect(Math.floor(screenX), Math.floor(screenY - size / 2 - 1), 1, 1);
        ctx.fillRect(Math.floor(screenX), Math.floor(screenY + size / 2), 1, 1);
      }
    });
  } else {
    // Render rain drops with intensity-specific visual effects
    const rainConfig = getRainConfig(intensity);
    const isStorm = intensity >= 1.0;
    const isHeavy = intensity >= 0.7;
    
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);
    
    // Storm atmosphere - dark vignette effect (darker at edges)
    if (isStorm && 'DARK_OPACITY' in rainConfig) {
      const darkOpacity = (rainConfig as any).DARK_OPACITY;
      const darkGradient = ctx.createRadialGradient(
        centerX, centerY, maxRadius * 0.4,
        centerX, centerY, maxRadius * 1.2
      );
      darkGradient.addColorStop(0, 'rgba(26, 26, 46, 0)');                    // Clear center
      darkGradient.addColorStop(0.6, `rgba(26, 26, 46, ${darkOpacity * 0.5})`);
      darkGradient.addColorStop(1, `rgba(20, 22, 40, ${darkOpacity})`);       // Dark edges
      
      ctx.fillStyle = darkGradient;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }
    
    // Mist/fog overlay for heavy rain and storms - subtle atmospheric haze
    if ((isHeavy || isStorm) && 'MIST_OPACITY' in rainConfig) {
      const mistOpacity = (rainConfig as any).MIST_OPACITY;
      
      // Vertical mist gradient (heavier at bottom, simulating ground mist)
      const mistGradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
      mistGradient.addColorStop(0, `rgba(128, 144, 160, ${mistOpacity * 0.3})`);   // Light top
      mistGradient.addColorStop(0.7, `rgba(128, 144, 160, ${mistOpacity * 0.6})`); // Medium
      mistGradient.addColorStop(1, `rgba(140, 155, 170, ${mistOpacity})`);         // Heavier bottom
      
      ctx.fillStyle = mistGradient;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }
    
    // Calculate fall angle with intensity-specific settings
    const fallAngle = (rainConfig.BASE_ANGLE + rainSystem.windOffset) * (Math.PI / 180);
    const dx = Math.sin(fallAngle);
    const dy = Math.cos(fallAngle);
    
    ctx.lineCap = 'round';
    
    rainSystem.drops.forEach((drop, index) => {
      const screenX = screenCenterX + (drop.x - cameraX);
      const screenY = screenCenterY + (drop.y - cameraY);
      
      const margin = 50;
      if (screenX < -margin || screenX > canvasWidth + margin || 
          screenY < -margin || screenY > canvasHeight + margin) {
        return;
      }
      
      // Check if this is a "sheet rain" streak (longer, slightly transparent)
      const isStreak = drop.length > rainConfig.MAX_LENGTH * 1.5;
      
      // Alternate between main color and shadow color for depth
      const isBackground = index % 3 === 0;
      
      if (isStreak) {
        // Sheet rain effect - slightly more transparent, whitish
        ctx.strokeStyle = '#a0c4e8'; // Lighter blue for streaks
        ctx.globalAlpha = drop.opacity * 0.6;
        ctx.lineWidth = drop.thickness * 0.7;
      } else {
        ctx.strokeStyle = isBackground ? RAIN_CONFIG.RAIN_SHADOW_COLOR : RAIN_CONFIG.RAIN_COLOR;
        ctx.globalAlpha = drop.opacity * (isBackground ? 0.6 : 1.0);
        ctx.lineWidth = drop.thickness;
      }
      
      ctx.beginPath();
      ctx.moveTo(screenX, screenY);
      ctx.lineTo(
        screenX + dx * drop.length,
        screenY + dy * drop.length
      );
      ctx.stroke();
      
      // Add subtle glow for thick drops in heavy rain (water catching light)
      if (drop.thickness >= 2 && !isBackground && !isStreak) {
        ctx.globalAlpha = drop.opacity * 0.2;
        ctx.lineWidth = drop.thickness * 2;
        ctx.stroke();
      }
    });
  }
  
  ctx.restore();
}

/**
 * Triggers a thunder flash effect (INTERNAL USE ONLY - not exported for safety)
 */
function triggerThunderFlash(intensity: number = 0.8): void {
  const duration = 150 + Math.random() * 100; // 150-250ms flash duration
  rainSystem.thunderFlash = {
    startTime: performance.now(),
    duration,
    intensity: Math.max(0.5, Math.min(1.0, intensity)),
    opacity: 1.0,
  };
  console.log(`⚡ Thunder flash triggered with intensity ${intensity.toFixed(2)}`);
}

/**
 * Updates and renders thunder flash overlay
 */
function renderThunderFlash(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number
): void {
  if (!rainSystem.thunderFlash) return;
  
  const flash = rainSystem.thunderFlash;
  const currentTime = performance.now();
  const elapsed = currentTime - flash.startTime;
  
  if (elapsed >= flash.duration) {
    rainSystem.thunderFlash = null;
    return;
  }
  
  // Flash animation: quick bright flash, then fade
  const progress = elapsed / flash.duration;
  let flashOpacity: number;
  
  if (progress < 0.1) {
    // Quick bright flash (first 10% of duration)
    flashOpacity = flash.intensity * (progress / 0.1);
  } else if (progress < 0.3) {
    // Hold at peak (10-30% of duration)
    flashOpacity = flash.intensity;
  } else {
    // Fade out (30-100% of duration)
    flashOpacity = flash.intensity * (1.0 - (progress - 0.3) / 0.7);
  }
  
  // Render white flash overlay
  ctx.save();
  ctx.globalAlpha = flashOpacity * 0.6; // Max 60% opacity to not completely blind
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.restore();
}

/**
 * Main rain/snow rendering function to be called from the game loop
 * In winter, precipitation is rendered as snow instead of rain
 */
export function renderRain(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  canvasWidth: number,
  canvasHeight: number,
  rainIntensity: number, // 0.0 to 1.0 from server
  deltaTime: number, // in seconds
  isWinter: boolean = false // When true, render snow instead of rain
): void {
  // Update rain/snow system
  updateRainDrops(deltaTime, cameraX, cameraY, canvasWidth, canvasHeight, rainIntensity, isWinter);
  
  // Render precipitation if there's any intensity
  if (rainIntensity > 0) {
    renderRainDrops(ctx, cameraX, cameraY, canvasWidth, canvasHeight, rainIntensity, isWinter);
    renderSplashes(ctx, cameraX, cameraY, canvasWidth, canvasHeight, isWinter, rainIntensity);
  }
  
  // Always render thunder flash if active (even if rain intensity is 0)
  // Thunder still makes sense in winter storms (thunder snow!)
  renderThunderFlash(ctx, canvasWidth, canvasHeight);
}

/**
 * Clears all rain drops and splashes (useful for immediate weather changes)
 */
export function clearRain(): void {
  rainSystem.drops = [];
  rainSystem.splashes = [];
}

/**
 * Gets current rain drop count (for debugging)
 */
export function getRainDropCount(): number {
  return rainSystem.drops.length;
}

/**
 * Gets current splash count (for debugging)
 */
export function getSplashCount(): number {
  return rainSystem.splashes.length;
}

/**
 * Safe function to handle server thunder events only (exported for legitimate use)
 * This validates the input and prevents abuse
 */
export function handleServerThunderEvent(serverThunderEvent: { intensity: number; timestamp: any }): void {
  // Validate that this looks like a legitimate server thunder event
  if (!serverThunderEvent || typeof serverThunderEvent.intensity !== 'number') {
    console.warn('[Thunder] Invalid thunder event received from server');
    return;
  }
  
  // Clamp intensity to safe range
  const safeIntensity = Math.max(0.3, Math.min(0.8, serverThunderEvent.intensity));
  
  // Call the internal thunder function
  triggerThunderFlash(safeIntensity);
} 