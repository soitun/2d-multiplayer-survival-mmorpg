import React, { useState } from 'react';
import './InterfaceTabs.css';

interface InterfaceTabsProps {
  currentView: 'minimap' | 'encyclopedia' | 'memory-grid' | 'alk' | 'cairns' | 'matronage';
  onViewChange: (view: 'minimap' | 'encyclopedia' | 'memory-grid' | 'alk' | 'cairns' | 'matronage') => void;
  className?: string;
  hideEncyclopedia?: boolean;
}

const InterfaceTabs: React.FC<InterfaceTabsProps> = ({ 
  currentView, 
  onViewChange, 
  className = '',
  hideEncyclopedia = false
}) => {
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

  const isMinimapActive = currentView === 'minimap';
  const isEncyclopediaActive = currentView === 'encyclopedia';
  const isMemoryGridActive = currentView === 'memory-grid';
  const isAlkActive = currentView === 'alk';
  const isCairnsActive = currentView === 'cairns';
  const isMatronageActive = currentView === 'matronage';

  return (
    <div className={`interface-tabs ${className}`}>
      {/* GRU MAPS Tab */}
      <button
        className={`tab ${isMinimapActive ? 'active' : 'inactive'} ${hoveredTab === 'minimap' ? 'hovered' : ''}`}
        onClick={() => onViewChange('minimap')}
        onMouseEnter={() => setHoveredTab('minimap')}
        onMouseLeave={() => setHoveredTab(null)}
      >
        GRU MAPS
      </button>
      
      {/* Encyclopedia Tab - conditionally rendered */}
      {!hideEncyclopedia && (
        <button
          className={`tab encyclopedia-tab ${isEncyclopediaActive ? 'active' : 'inactive'} ${hoveredTab === 'encyclopedia' ? 'hovered' : ''}`}
          onClick={() => onViewChange('encyclopedia')}
          onMouseEnter={() => setHoveredTab('encyclopedia')}
          onMouseLeave={() => setHoveredTab(null)}
        >
          ENCYCLOPEDIA
        </button>
      )}
      
      {/* Memory Grid Tab */}
      <button
        className={`tab memory-grid-tab ${isMemoryGridActive ? 'active' : 'inactive'} ${hoveredTab === 'memory-grid' ? 'hovered' : ''}`}
        onClick={() => onViewChange('memory-grid')}
        onMouseEnter={() => setHoveredTab('memory-grid')}
        onMouseLeave={() => setHoveredTab(null)}
      >
        MEMORY GRID
      </button>
      
      {/* ALK Provisioning Tab */}
      <button
        className={`tab alk-tab ${isAlkActive ? 'active' : 'inactive'} ${hoveredTab === 'alk' ? 'hovered' : ''}`}
        onClick={() => onViewChange('alk')}
        onMouseEnter={() => setHoveredTab('alk')}
        onMouseLeave={() => setHoveredTab(null)}
      >
        ALK BOARD
      </button>
      
      {/* CAIRNS Tab */}
      <button
        className={`tab cairns-tab ${isCairnsActive ? 'active' : 'inactive'} ${hoveredTab === 'cairns' ? 'hovered' : ''}`}
        onClick={() => onViewChange('cairns')}
        onMouseEnter={() => setHoveredTab('cairns')}
        onMouseLeave={() => setHoveredTab(null)}
      >
        CAIRNS
      </button>
      
      {/* MATRONAGE Tab */}
      <button
        className={`tab matronage-tab ${isMatronageActive ? 'active' : 'inactive'} ${hoveredTab === 'matronage' ? 'hovered' : ''}`}
        onClick={() => onViewChange('matronage')}
        onMouseEnter={() => setHoveredTab('matronage')}
        onMouseLeave={() => setHoveredTab(null)}
      >
        MATRONAGE
      </button>
    </div>
  );
};

export default InterfaceTabs; 