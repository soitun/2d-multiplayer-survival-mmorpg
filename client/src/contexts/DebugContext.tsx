import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import * as profilerRecording from '../utils/profilerRecording';

interface DebugContextType {
    showAutotileDebug: boolean;
    toggleAutotileDebug: () => void;
    showMusicDebug: boolean;
    toggleMusicDebug: () => void;
    showChunkBoundaries: boolean;
    toggleChunkBoundaries: () => void;
    showInteriorDebug: boolean;
    toggleInteriorDebug: () => void;
    showCollisionDebug: boolean;
    toggleCollisionDebug: () => void;
    showAttackRangeDebug: boolean;
    toggleAttackRangeDebug: () => void;
    showYSortDebug: boolean;
    toggleYSortDebug: () => void;
    showShipwreckDebug: boolean;
    toggleShipwreckDebug: () => void;
    showFpsProfiler: boolean;
    toggleFpsProfiler: () => void;
    isProfilerRecording: boolean;
    startProfilerRecording: () => void;
    stopProfilerRecording: () => Promise<boolean>;
}

const DebugContext = createContext<DebugContextType | undefined>(undefined);

export const useDebug = () => {
    const context = useContext(DebugContext);
    if (context === undefined) {
        throw new Error('useDebug must be used within a DebugProvider');
    }
    return context;
};

interface DebugProviderProps {
    children: ReactNode;
}

export const DebugProvider: React.FC<DebugProviderProps> = ({ children }) => {
    const [showAutotileDebug, setShowAutotileDebug] = useState(false);
    const [showMusicDebug, setShowMusicDebug] = useState(false);
    const [showChunkBoundaries, setShowChunkBoundaries] = useState(false);
    const [showInteriorDebug, setShowInteriorDebug] = useState(false);
    const [showCollisionDebug, setShowCollisionDebug] = useState(false);
    const [showAttackRangeDebug, setShowAttackRangeDebug] = useState(false);
    const [showYSortDebug, setShowYSortDebug] = useState(false);
    const [showShipwreckDebug, setShowShipwreckDebug] = useState(false);
    const [showFpsProfiler, setShowFpsProfiler] = useState(false);
    const [isProfilerRecording, setIsProfilerRecording] = useState(false);

    const toggleAutotileDebug = () => {
        setShowAutotileDebug(prev => !prev);
        console.log('[DebugContext] Autotile debug overlay:', !showAutotileDebug ? 'enabled' : 'disabled');
    };

    const toggleMusicDebug = () => {
        setShowMusicDebug(prev => !prev);
        console.log('[DebugContext] Music debug overlay:', !showMusicDebug ? 'enabled' : 'disabled');
    };

    const toggleChunkBoundaries = () => {
        setShowChunkBoundaries(prev => !prev);
        console.log('[DebugContext] Chunk boundaries:', !showChunkBoundaries ? 'enabled' : 'disabled');
    };

    const toggleInteriorDebug = () => {
        setShowInteriorDebug(prev => !prev);
        console.log('[DebugContext] Interior debug overlay:', !showInteriorDebug ? 'enabled' : 'disabled');
    };

    const toggleCollisionDebug = () => {
        setShowCollisionDebug(prev => !prev);
        console.log('[DebugContext] Collision debug overlay:', !showCollisionDebug ? 'enabled' : 'disabled');
    };

    const toggleAttackRangeDebug = () => {
        setShowAttackRangeDebug(prev => !prev);
        console.log('[DebugContext] Attack range debug overlay:', !showAttackRangeDebug ? 'enabled' : 'disabled');
    };

    const toggleYSortDebug = () => {
        setShowYSortDebug(prev => !prev);
        console.log('[DebugContext] Y-sort debug overlay:', !showYSortDebug ? 'enabled' : 'disabled');
    };

    const toggleShipwreckDebug = () => {
        setShowShipwreckDebug(prev => !prev);
        console.log('[DebugContext] Shipwreck protection debug overlay:', !showShipwreckDebug ? 'enabled' : 'disabled');
    };

    const toggleFpsProfiler = () => {
        setShowFpsProfiler(prev => !prev);
        console.log('[DebugContext] FPS profiler overlay:', !showFpsProfiler ? 'enabled' : 'disabled');
    };

    const startProfilerRecording = useCallback(() => {
        profilerRecording.startRecording();
        setIsProfilerRecording(true);
        console.log('[DebugContext] Profiler recording started');
    }, []);

    const stopProfilerRecording = useCallback(async (): Promise<boolean> => {
        profilerRecording.stopRecording();
        setIsProfilerRecording(false);
        const ok = await profilerRecording.copyToClipboard();
        console.log('[DebugContext] Profiler recording stopped, copied to clipboard:', ok);
        return ok;
    }, []);

    const value = {
        showAutotileDebug,
        toggleAutotileDebug,
        showMusicDebug,
        toggleMusicDebug,
        showChunkBoundaries,
        toggleChunkBoundaries,
        showInteriorDebug,
        toggleInteriorDebug,
        showCollisionDebug,
        toggleCollisionDebug,
        showAttackRangeDebug,
        toggleAttackRangeDebug,
        showYSortDebug,
        toggleYSortDebug,
        showShipwreckDebug,
        toggleShipwreckDebug,
        showFpsProfiler,
        toggleFpsProfiler,
        isProfilerRecording,
        startProfilerRecording,
        stopProfilerRecording,
    };

    return (
        <DebugContext.Provider value={value}>
            {children}
        </DebugContext.Provider>
    );
}; 