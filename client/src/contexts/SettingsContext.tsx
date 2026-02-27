/**
 * SettingsContext.tsx
 *
 * Centralizes all user-configurable audio and visual settings.
 * Previously these were useState hooks scattered in App.tsx, causing the entire
 * component tree (App → GameScreen → GameCanvas) to re-render on every setting
 * change. Now, only components that call useSettings() subscribe to changes.
 *
 * All values are persisted to localStorage and restored on mount.
 */

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

export type FixedSimulationMode = 'off' | 'auto' | 'on';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SettingsContextType {
    // Audio
    musicVolume: number;
    soundVolume: number;
    environmentalVolume: number;
    setMusicVolume: (volume: number) => void;
    setSoundVolume: (volume: number) => void;
    setEnvironmentalVolume: (volume: number) => void;

    // Visual
    allShadowsEnabled: boolean;
    treeShadowsEnabled: boolean;
    weatherOverlayEnabled: boolean;
    stormAtmosphereEnabled: boolean;
    statusOverlaysEnabled: boolean;
    grassEnabled: boolean;
    alwaysShowPlayerNames: boolean;
    cloudsEnabled: boolean;
    waterSurfaceEffectsEnabled: boolean;
    waterSurfaceEffectsIntensity: number;
    worldParticlesQuality: number; // 0=off, 1=low, 2=full
    footprintsEnabled: boolean;
    bloomIntensity: number;
    vignetteIntensity: number;
    chromaticAberrationIntensity: number;
    colorCorrection: number;
    fixedSimulationMode: FixedSimulationMode;
    displayRefreshRateHz: number;
    fixedSimulationEnabled: boolean;
    setAllShadowsEnabled: (enabled: boolean) => void;
    setTreeShadowsEnabled: (enabled: boolean) => void;
    setWeatherOverlayEnabled: (enabled: boolean) => void;
    setStormAtmosphereEnabled: (enabled: boolean) => void;
    setStatusOverlaysEnabled: (enabled: boolean) => void;
    setGrassEnabled: (enabled: boolean) => void;
    setAlwaysShowPlayerNames: (enabled: boolean) => void;
    setCloudsEnabled: (enabled: boolean) => void;
    setWaterSurfaceEffectsEnabled: (enabled: boolean) => void;
    setWaterSurfaceEffectsIntensity: (intensity: number) => void;
    setWorldParticlesQuality: (quality: number) => void;
    setFootprintsEnabled: (enabled: boolean) => void;
    setBloomIntensity: (intensity: number) => void;
    setVignetteIntensity: (intensity: number) => void;
    setChromaticAberrationIntensity: (intensity: number) => void;
    setColorCorrection: (value: number) => void;
    setFixedSimulationMode: (mode: FixedSimulationMode) => void;
    setFixedSimulationEnabled: (enabled: boolean) => void;
}

// ---------------------------------------------------------------------------
// Context + hook
// ---------------------------------------------------------------------------

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettings = (): SettingsContextType => {
    const ctx = useContext(SettingsContext);
    if (ctx === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return ctx;
};

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function loadNumber(key: string, fallback: number, max = 1.0): number {
    const saved = localStorage.getItem(key);
    return saved ? Math.min(parseFloat(saved), max) : fallback;
}

function loadBool(key: string, fallback: boolean): boolean {
    const saved = localStorage.getItem(key);
    return saved ? saved === 'true' : fallback;
}

function loadFixedSimulationMode(): FixedSimulationMode {
    const savedMode = localStorage.getItem('fixedSimulationMode');
    if (savedMode === 'off' || savedMode === 'auto' || savedMode === 'on') {
        return savedMode;
    }
    // Backward compatibility with previous boolean setting.
    const legacyBool = localStorage.getItem('fixedSimulationEnabled');
    if (legacyBool !== null) {
        return legacyBool === 'true' ? 'on' : 'off';
    }
    return 'off';
}

function roundToCommonRefreshRate(hz: number): number {
    const common = [30, 50, 60, 75, 90, 100, 120, 144, 165, 180, 240];
    let best = common[0];
    let bestDistance = Math.abs(hz - best);
    for (const candidate of common) {
        const distance = Math.abs(hz - candidate);
        if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
        }
    }
    return best;
}

function estimateRefreshRateHz(sampleCount = 45): Promise<number> {
    return new Promise((resolve) => {
        if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') {
            resolve(60);
            return;
        }
        const timestamps: number[] = [];
        let rafId = 0;
        const step = (ts: number) => {
            timestamps.push(ts);
            if (timestamps.length >= sampleCount) {
                const deltas: number[] = [];
                for (let i = 1; i < timestamps.length; i += 1) {
                    deltas.push(timestamps[i] - timestamps[i - 1]);
                }
                deltas.sort((a, b) => a - b);
                const medianDelta = deltas[Math.floor(deltas.length / 2)] || (1000 / 60);
                const estimated = 1000 / medianDelta;
                resolve(roundToCommonRefreshRate(estimated));
                return;
            }
            rafId = requestAnimationFrame(step);
        };
        rafId = requestAnimationFrame(step);
        window.setTimeout(() => {
            if (timestamps.length < 8) {
                cancelAnimationFrame(rafId);
                resolve(60);
            }
        }, 1500);
    });
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // --- Audio ---
    const [musicVolume, _setMusicVolume] = useState(() => loadNumber('musicVolume', 0.20));
    const [soundVolume, _setSoundVolume] = useState(() => loadNumber('soundVolume', 0.50));
    const [environmentalVolume, _setEnvironmentalVolume] = useState(() => loadNumber('environmentalVolume', 1.0));

    // --- Visual ---
    const [allShadowsEnabled, _setAllShadows] = useState(() => {
        const saved = localStorage.getItem('allShadowsEnabled');
        if (saved !== null) return saved === 'true';
        // Backward compatibility: if legacy tree shadow setting exists, mirror it.
        return loadBool('treeShadowsEnabled', true);
    });
    const [treeShadowsEnabled, _setTreeShadows] = useState(() => loadBool('treeShadowsEnabled', true));
    const [weatherOverlayEnabled, _setWeatherOverlay] = useState(() => loadBool('weatherOverlayEnabled', true));
    const [stormAtmosphereEnabled, _setStormAtmosphere] = useState(() => {
        const saved = localStorage.getItem('stormAtmosphereEnabled');
        if (saved !== null) return saved === 'true';
        const legacy = localStorage.getItem('weatherOverlayEnabled');
        return legacy !== null ? legacy === 'true' : true;
    });
    const [statusOverlaysEnabled, _setStatusOverlays] = useState(() => loadBool('statusOverlaysEnabled', true));
    const [grassEnabled, _setGrass] = useState(() => loadBool('grassEnabled', true));
    const [alwaysShowPlayerNames, _setPlayerNames] = useState(() => loadBool('alwaysShowPlayerNames', true));
    const [cloudsEnabled, _setCloudsEnabled] = useState(() => loadBool('cloudsEnabled', true));
    const [waterSurfaceEffectsEnabled, _setWaterSurfaceEffectsEnabled] = useState(() => loadBool('waterSurfaceEffectsEnabled', true));
    const [waterSurfaceEffectsIntensity, _setWaterSurfaceEffectsIntensity] = useState(() => loadNumber('waterSurfaceEffectsIntensity', 75, 100));
    const [worldParticlesQuality, _setWorldParticlesQuality] = useState(() => Math.round(loadNumber('worldParticlesQuality', 2, 2)));
    const [footprintsEnabled, _setFootprintsEnabled] = useState(() => loadBool('footprintsEnabled', true));
    const [bloomIntensity, _setBloomIntensity] = useState(() => loadNumber('bloomIntensity', 0, 100));
    const [vignetteIntensity, _setVignetteIntensity] = useState(() => loadNumber('vignetteIntensity', 0, 100));
    const [chromaticAberrationIntensity, _setChromaticAberrationIntensity] = useState(() => loadNumber('chromaticAberrationIntensity', 0, 100));
    const [colorCorrection, _setColorCorrection] = useState(() => loadNumber('colorCorrection', 50, 100));
    const [fixedSimulationMode, _setFixedSimulationMode] = useState<FixedSimulationMode>(() => loadFixedSimulationMode());
    const [displayRefreshRateHz, _setDisplayRefreshRateHz] = useState<number>(60);

    // --- Setters (persist to localStorage) ---
    const setMusicVolume = useCallback((v: number) => {
        _setMusicVolume(v);
        localStorage.setItem('musicVolume', v.toString());
    }, []);

    const setSoundVolume = useCallback((v: number) => {
        _setSoundVolume(v);
        localStorage.setItem('soundVolume', v.toString());
    }, []);

    const setEnvironmentalVolume = useCallback((v: number) => {
        _setEnvironmentalVolume(v);
        localStorage.setItem('environmentalVolume', v.toString());
    }, []);

    const setAllShadowsEnabled = useCallback((e: boolean) => {
        _setAllShadows(e);
        localStorage.setItem('allShadowsEnabled', e.toString());
    }, []);

    const setTreeShadowsEnabled = useCallback((e: boolean) => {
        _setTreeShadows(e);
        localStorage.setItem('treeShadowsEnabled', e.toString());
    }, []);

    const setWeatherOverlayEnabled = useCallback((e: boolean) => {
        _setWeatherOverlay(e);
        localStorage.setItem('weatherOverlayEnabled', e.toString());
    }, []);

    const setStormAtmosphereEnabled = useCallback((e: boolean) => {
        _setStormAtmosphere(e);
        localStorage.setItem('stormAtmosphereEnabled', e.toString());
    }, []);

    const setStatusOverlaysEnabled = useCallback((e: boolean) => {
        _setStatusOverlays(e);
        localStorage.setItem('statusOverlaysEnabled', e.toString());
    }, []);

    const setGrassEnabled = useCallback((e: boolean) => {
        _setGrass(e);
        localStorage.setItem('grassEnabled', e.toString());
    }, []);

    const setAlwaysShowPlayerNames = useCallback((e: boolean) => {
        _setPlayerNames(e);
        localStorage.setItem('alwaysShowPlayerNames', e.toString());
    }, []);

    const setCloudsEnabled = useCallback((e: boolean) => {
        _setCloudsEnabled(e);
        localStorage.setItem('cloudsEnabled', e.toString());
    }, []);

    const setWaterSurfaceEffectsEnabled = useCallback((e: boolean) => {
        _setWaterSurfaceEffectsEnabled(e);
        localStorage.setItem('waterSurfaceEffectsEnabled', e.toString());
    }, []);

    const setWaterSurfaceEffectsIntensity = useCallback((i: number) => {
        const clamped = Math.max(0, Math.min(100, i));
        _setWaterSurfaceEffectsIntensity(clamped);
        localStorage.setItem('waterSurfaceEffectsIntensity', clamped.toString());
    }, []);

    const setWorldParticlesQuality = useCallback((q: number) => {
        const clamped = Math.max(0, Math.min(2, Math.round(q)));
        _setWorldParticlesQuality(clamped);
        localStorage.setItem('worldParticlesQuality', clamped.toString());
    }, []);

    const setFootprintsEnabled = useCallback((e: boolean) => {
        _setFootprintsEnabled(e);
        localStorage.setItem('footprintsEnabled', e.toString());
    }, []);

    const setBloomIntensity = useCallback((i: number) => {
        const clamped = Math.max(0, Math.min(100, i));
        _setBloomIntensity(clamped);
        localStorage.setItem('bloomIntensity', clamped.toString());
    }, []);

    const setVignetteIntensity = useCallback((i: number) => {
        const clamped = Math.max(0, Math.min(100, i));
        _setVignetteIntensity(clamped);
        localStorage.setItem('vignetteIntensity', clamped.toString());
    }, []);

    const setChromaticAberrationIntensity = useCallback((i: number) => {
        const clamped = Math.max(0, Math.min(100, i));
        _setChromaticAberrationIntensity(clamped);
        localStorage.setItem('chromaticAberrationIntensity', clamped.toString());
    }, []);

    const setColorCorrection = useCallback((v: number) => {
        const clamped = Math.max(0, Math.min(100, v));
        _setColorCorrection(clamped);
        localStorage.setItem('colorCorrection', clamped.toString());
    }, []);

    React.useEffect(() => {
        let mounted = true;
        estimateRefreshRateHz().then((hz) => {
            if (mounted) {
                _setDisplayRefreshRateHz(hz);
            }
        });
        return () => {
            mounted = false;
        };
    }, []);

    const setFixedSimulationMode = useCallback((mode: FixedSimulationMode) => {
        _setFixedSimulationMode(mode);
        localStorage.setItem('fixedSimulationMode', mode);
        // Keep legacy key updated for compatibility with older builds/settings.
        localStorage.setItem('fixedSimulationEnabled', String(mode === 'on'));
    }, []);

    const setFixedSimulationEnabled = useCallback((enabled: boolean) => {
        _setFixedSimulationMode(enabled ? 'on' : 'off');
        localStorage.setItem('fixedSimulationMode', enabled ? 'on' : 'off');
        localStorage.setItem('fixedSimulationEnabled', enabled.toString());
    }, []);

    // Auto mode favors smooth variable-step movement on modern high-refresh displays.
    // Fixed simulation remains available via explicit "on" for deterministic debugging.
    const fixedSimulationEnabled = fixedSimulationMode === 'on'
        || (fixedSimulationMode === 'auto' && displayRefreshRateHz >= 240);

    // Memoize the context value to prevent unnecessary consumer re-renders
    // when the provider's parent re-renders but settings haven't changed.
    const value = useMemo<SettingsContextType>(() => ({
        musicVolume,
        soundVolume,
        environmentalVolume,
        setMusicVolume,
        setSoundVolume,
        setEnvironmentalVolume,
        allShadowsEnabled,
        treeShadowsEnabled,
        weatherOverlayEnabled,
        stormAtmosphereEnabled,
        statusOverlaysEnabled,
        grassEnabled,
        alwaysShowPlayerNames,
        cloudsEnabled,
        waterSurfaceEffectsEnabled,
        waterSurfaceEffectsIntensity,
        worldParticlesQuality,
        footprintsEnabled,
        bloomIntensity,
        vignetteIntensity,
        chromaticAberrationIntensity,
        colorCorrection,
        fixedSimulationMode,
        displayRefreshRateHz,
        fixedSimulationEnabled,
        setAllShadowsEnabled,
        setTreeShadowsEnabled,
        setWeatherOverlayEnabled,
        setStormAtmosphereEnabled,
        setStatusOverlaysEnabled,
        setGrassEnabled,
        setAlwaysShowPlayerNames,
        setCloudsEnabled,
        setWaterSurfaceEffectsEnabled,
        setWaterSurfaceEffectsIntensity,
        setWorldParticlesQuality,
        setFootprintsEnabled,
        setBloomIntensity,
        setVignetteIntensity,
        setChromaticAberrationIntensity,
        setColorCorrection,
        setFixedSimulationMode,
        setFixedSimulationEnabled,
    }), [
        musicVolume, soundVolume, environmentalVolume,
        allShadowsEnabled, treeShadowsEnabled, weatherOverlayEnabled, stormAtmosphereEnabled, statusOverlaysEnabled,
        grassEnabled, alwaysShowPlayerNames, cloudsEnabled, waterSurfaceEffectsEnabled,
        waterSurfaceEffectsIntensity, worldParticlesQuality, footprintsEnabled, bloomIntensity,
        vignetteIntensity, chromaticAberrationIntensity, colorCorrection,
        fixedSimulationMode, displayRefreshRateHz, fixedSimulationEnabled,
        setMusicVolume, setSoundVolume, setEnvironmentalVolume,
        setAllShadowsEnabled, setTreeShadowsEnabled, setWeatherOverlayEnabled, setStormAtmosphereEnabled, setStatusOverlaysEnabled,
        setGrassEnabled, setAlwaysShowPlayerNames, setCloudsEnabled, setWaterSurfaceEffectsEnabled,
        setWaterSurfaceEffectsIntensity, setWorldParticlesQuality, setFootprintsEnabled,
        setBloomIntensity, setVignetteIntensity, setChromaticAberrationIntensity, setColorCorrection,
        setFixedSimulationMode,
        setFixedSimulationEnabled,
    ]);

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
};
