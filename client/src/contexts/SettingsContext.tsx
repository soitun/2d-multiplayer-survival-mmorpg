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

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // --- Audio ---
    const [musicVolume, _setMusicVolume] = useState(() => loadNumber('musicVolume', 0.5));
    const [soundVolume, _setSoundVolume] = useState(() => loadNumber('soundVolume', 0.8));
    const [environmentalVolume, _setEnvironmentalVolume] = useState(() => loadNumber('environmentalVolume', 0.7));

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
    }), [
        musicVolume, soundVolume, environmentalVolume,
        allShadowsEnabled, treeShadowsEnabled, weatherOverlayEnabled, stormAtmosphereEnabled, statusOverlaysEnabled,
        grassEnabled, alwaysShowPlayerNames, cloudsEnabled, waterSurfaceEffectsEnabled,
        waterSurfaceEffectsIntensity, worldParticlesQuality, footprintsEnabled, bloomIntensity,
        vignetteIntensity, chromaticAberrationIntensity, colorCorrection,
        setMusicVolume, setSoundVolume, setEnvironmentalVolume,
        setAllShadowsEnabled, setTreeShadowsEnabled, setWeatherOverlayEnabled, setStormAtmosphereEnabled, setStatusOverlaysEnabled,
        setGrassEnabled, setAlwaysShowPlayerNames, setCloudsEnabled, setWaterSurfaceEffectsEnabled,
        setWaterSurfaceEffectsIntensity, setWorldParticlesQuality, setFootprintsEnabled,
        setBloomIntensity, setVignetteIntensity, setChromaticAberrationIntensity, setColorCorrection,
    ]);

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
};
