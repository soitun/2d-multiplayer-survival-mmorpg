import React, { createContext, useContext, useState, ReactNode } from 'react';

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
    };

    return (
        <DebugContext.Provider value={value}>
            {children}
        </DebugContext.Provider>
    );
}; 