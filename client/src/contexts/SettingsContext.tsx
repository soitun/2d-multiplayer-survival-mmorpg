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
    treeShadowsEnabled: boolean;
    weatherOverlayEnabled: boolean;
    statusOverlaysEnabled: boolean;
    grassEnabled: boolean;
    alwaysShowPlayerNames: boolean;
    bloomIntensity: number;
    vignetteIntensity: number;
    chromaticAberrationIntensity: number;
    colorCorrection: number;
    setTreeShadowsEnabled: (enabled: boolean) => void;
    setWeatherOverlayEnabled: (enabled: boolean) => void;
    setStatusOverlaysEnabled: (enabled: boolean) => void;
    setGrassEnabled: (enabled: boolean) => void;
    setAlwaysShowPlayerNames: (enabled: boolean) => void;
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
    const [treeShadowsEnabled, _setTreeShadows] = useState(() => loadBool('treeShadowsEnabled', true));
    const [weatherOverlayEnabled, _setWeatherOverlay] = useState(() => loadBool('weatherOverlayEnabled', true));
    const [statusOverlaysEnabled, _setStatusOverlays] = useState(() => loadBool('statusOverlaysEnabled', true));
    const [grassEnabled, _setGrass] = useState(() => loadBool('grassEnabled', true));
    const [alwaysShowPlayerNames, _setPlayerNames] = useState(() => loadBool('alwaysShowPlayerNames', true));
    const [bloomIntensity, _setBloomIntensity] = useState(() => loadNumber('bloomIntensity', 28, 100));
    const [vignetteIntensity, _setVignetteIntensity] = useState(() => loadNumber('vignetteIntensity', 12, 100));
    const [chromaticAberrationIntensity, _setChromaticAberrationIntensity] = useState(() => loadNumber('chromaticAberrationIntensity', 8, 100));
    const [colorCorrection, _setColorCorrection] = useState(() => loadNumber('colorCorrection', 58, 100));

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

    const setTreeShadowsEnabled = useCallback((e: boolean) => {
        _setTreeShadows(e);
        localStorage.setItem('treeShadowsEnabled', e.toString());
    }, []);

    const setWeatherOverlayEnabled = useCallback((e: boolean) => {
        _setWeatherOverlay(e);
        localStorage.setItem('weatherOverlayEnabled', e.toString());
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
        treeShadowsEnabled,
        weatherOverlayEnabled,
        statusOverlaysEnabled,
        grassEnabled,
        alwaysShowPlayerNames,
        bloomIntensity,
        vignetteIntensity,
        chromaticAberrationIntensity,
        colorCorrection,
        setTreeShadowsEnabled,
        setWeatherOverlayEnabled,
        setStatusOverlaysEnabled,
        setGrassEnabled,
        setAlwaysShowPlayerNames,
        setBloomIntensity,
        setVignetteIntensity,
        setChromaticAberrationIntensity,
        setColorCorrection,
    }), [
        musicVolume, soundVolume, environmentalVolume,
        treeShadowsEnabled, weatherOverlayEnabled, statusOverlaysEnabled,
        grassEnabled, alwaysShowPlayerNames, bloomIntensity, vignetteIntensity,
        chromaticAberrationIntensity, colorCorrection,
        setMusicVolume, setSoundVolume, setEnvironmentalVolume,
        setTreeShadowsEnabled, setWeatherOverlayEnabled, setStatusOverlaysEnabled,
        setGrassEnabled, setAlwaysShowPlayerNames, setBloomIntensity, setVignetteIntensity,
        setChromaticAberrationIntensity, setColorCorrection,
    ]);

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
};
