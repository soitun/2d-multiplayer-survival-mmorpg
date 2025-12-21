import React, { useState, useMemo } from 'react';
import BlogHeader from '../common/BlogHeader';
import BlogFooter from '../blog/BlogFooter';

// ═══════════════════════════════════════════════════════════════════
// Asset Data Type & Constants
// ═══════════════════════════════════════════════════════════════════
type AssetStatus = 'replaced' | 'placeholder' | 'pending';
type SortField = 'type' | 'name' | 'status' | 'payout' | 'estimate';
type SortDirection = 'asc' | 'desc';

interface AssetItem {
    id: string;
    type: string;
    name: string;
    status: AssetStatus;
    replacementType: string;
    payout: number | null; // null = not yet paid
    estimate: number; // estimated cost to commission
}

// Kickstarter Goal: $18,000
// All asset data in one place for easy updates
const ASSET_DATA: AssetItem[] = [
    // ═══ COMPLETED - Character Sprites (6 sheets) - $325 paid as bundle ═══
    { id: 'char-walk', type: 'Character', name: 'Walk Cycle (6×4 grid, 4 directions)', status: 'replaced', replacementType: 'Human pixel artist', payout: 324.78, estimate: 55 },
    { id: 'char-sprint', type: 'Character', name: 'Sprint Animation (8×4 grid)', status: 'replaced', replacementType: 'Human pixel artist', payout: null, estimate: 55 },
    { id: 'char-idle', type: 'Character', name: 'Idle Animation (4×4 grid, 16 frames)', status: 'replaced', replacementType: 'Human pixel artist', payout: null, estimate: 55 },
    { id: 'char-crouch', type: 'Character', name: 'Crouch Animation (2×4 grid, 8 frames)', status: 'replaced', replacementType: 'Human pixel artist', payout: null, estimate: 40 },
    { id: 'char-swim', type: 'Character', name: 'Swimming Animation (6×4 grid, 24 frames)', status: 'replaced', replacementType: 'Human pixel artist', payout: null, estimate: 60 },
    { id: 'char-dodge', type: 'Character', name: 'Dodge Roll Animation (7×4 grid, 28 frames)', status: 'replaced', replacementType: 'Human pixel artist', payout: null, estimate: 60 },
    
    // ═══ PENDING - Additional Character Animations ═══
    { id: 'char-attack', type: 'Character', name: 'Melee Attack Animations (4 weapons × 4 dirs)', status: 'pending', replacementType: 'Human pixel artist', payout: null, estimate: 280 },
    { id: 'char-death', type: 'Character', name: 'Death/Knocked Out Animation (4 dirs)', status: 'pending', replacementType: 'Human pixel artist', payout: null, estimate: 80 },
    { id: 'char-harvest', type: 'Character', name: 'Harvesting/Mining Animation (4 dirs)', status: 'pending', replacementType: 'Human pixel artist', payout: null, estimate: 120 },
    { id: 'char-carry', type: 'Character', name: 'Carry Heavy Object Animation (4 dirs)', status: 'pending', replacementType: 'Human pixel artist', payout: null, estimate: 100 },
    
    // ═══ PLACEHOLDER - Wild Animals (7 species) - Full animation sets ═══
    { id: 'animal-walrus', type: 'Animal NPC', name: 'Walrus — Idle, Walk, Attack, Death', status: 'placeholder', replacementType: 'Hand-animated sprites', payout: null, estimate: 320 },
    { id: 'animal-wolf', type: 'Animal NPC', name: 'Wolf — Idle, Run, Attack, Death', status: 'placeholder', replacementType: 'Hand-animated sprites', payout: null, estimate: 280 },
    { id: 'animal-fox', type: 'Animal NPC', name: 'Fox — Idle, Run, Flee, Death', status: 'placeholder', replacementType: 'Hand-animated sprites', payout: null, estimate: 240 },
    { id: 'animal-crow', type: 'Animal NPC', name: 'Crow — Idle, Fly, Peck, Death', status: 'placeholder', replacementType: 'Hand-animated sprites', payout: null, estimate: 200 },
    { id: 'animal-tern', type: 'Animal NPC', name: 'Tern — Idle, Fly, Dive, Death', status: 'placeholder', replacementType: 'Hand-animated sprites', payout: null, estimate: 200 },
    { id: 'animal-crab', type: 'Animal NPC', name: 'Crab — Idle, Walk, Pinch, Death', status: 'placeholder', replacementType: 'Hand-animated sprites', payout: null, estimate: 180 },
    { id: 'animal-viper', type: 'Animal NPC', name: 'Viper — Idle, Slither, Strike, Death', status: 'placeholder', replacementType: 'Hand-animated sprites', payout: null, estimate: 200 },
    { id: 'animal-bear', type: 'Animal NPC', name: 'Bear — Idle, Walk, Maul, Death', status: 'pending', replacementType: 'Hand-animated sprites', payout: null, estimate: 350 },
    
    // ═══ PLACEHOLDER - Item Icons (50+ unique items) ═══
    { id: 'items-weapons', type: 'Item Icons', name: 'Weapons (12) — Crossbow, Bow, Pistol, Spear, etc.', status: 'placeholder', replacementType: 'Hand-drawn pixel icons', payout: null, estimate: 360 },
    { id: 'items-tools', type: 'Item Icons', name: 'Tools (10) — Pickaxes, Hatchets, Fishing Rods', status: 'placeholder', replacementType: 'Hand-drawn pixel icons', payout: null, estimate: 300 },
    { id: 'items-consumables', type: 'Item Icons', name: 'Consumables (15) — Bandages, Broths, Food Items', status: 'placeholder', replacementType: 'Hand-drawn pixel icons', payout: null, estimate: 450 },
    { id: 'items-materials', type: 'Item Icons', name: 'Materials (20) — Wood, Stone, Ore, Cloth, Leather', status: 'placeholder', replacementType: 'Hand-drawn pixel icons', payout: null, estimate: 400 },
    { id: 'items-seeds', type: 'Item Icons', name: 'Seeds & Plants (8) — Carrot, Potato, Hemp, Pumpkin', status: 'placeholder', replacementType: 'Hand-drawn pixel icons', payout: null, estimate: 200 },
    { id: 'items-ammo', type: 'Item Icons', name: 'Ammunition (6) — Arrows, Bolts, Pistol Rounds', status: 'placeholder', replacementType: 'Hand-drawn pixel icons', payout: null, estimate: 180 },
    
    // ═══ PLACEHOLDER - Armor Sets (Full character overlays) ═══
    { id: 'armor-cloth', type: 'Armor', name: 'Cloth Set — All animations overlay (6 sheets)', status: 'placeholder', replacementType: 'Masked overlay sprites', payout: null, estimate: 480 },
    { id: 'armor-leather', type: 'Armor', name: 'Leather Set — All animations overlay (6 sheets)', status: 'placeholder', replacementType: 'Masked overlay sprites', payout: null, estimate: 480 },
    { id: 'armor-iron', type: 'Armor', name: 'Iron Set — All animations overlay (6 sheets)', status: 'placeholder', replacementType: 'Masked overlay sprites', payout: null, estimate: 520 },
    { id: 'armor-steel', type: 'Armor', name: 'Steel Set — All animations overlay (6 sheets)', status: 'placeholder', replacementType: 'Masked overlay sprites', payout: null, estimate: 520 },
    { id: 'armor-head', type: 'Armor', name: 'Headgear (8) — Caps, Helmets, Hoods', status: 'placeholder', replacementType: 'Masked overlay sprites', payout: null, estimate: 400 },
    
    // ═══ PLACEHOLDER - Buildings & Structures ═══
    { id: 'build-campfire', type: 'Buildings', name: 'Campfire — Animated flames, smoke', status: 'placeholder', replacementType: 'Hand-drawn sprites', payout: null, estimate: 120 },
    { id: 'build-storage', type: 'Buildings', name: 'Storage Containers (5) — Chests, Crates, Barrels', status: 'placeholder', replacementType: 'Hand-drawn sprites', payout: null, estimate: 200 },
    { id: 'build-crafting', type: 'Buildings', name: 'Crafting Stations (4) — Workbench, Forge, Cauldron', status: 'placeholder', replacementType: 'Hand-drawn sprites', payout: null, estimate: 280 },
    { id: 'build-walls', type: 'Buildings', name: 'Wall Tiles (Wood, Stone, Metal) — All variants', status: 'placeholder', replacementType: 'Hand-drawn tileset', payout: null, estimate: 400 },
    { id: 'build-doors', type: 'Buildings', name: 'Doors & Gates (4) — Open/Close animations', status: 'placeholder', replacementType: 'Hand-drawn sprites', payout: null, estimate: 200 },
    { id: 'build-furniture', type: 'Buildings', name: 'Furniture (10) — Beds, Tables, Chairs, Shelves', status: 'placeholder', replacementType: 'Hand-drawn sprites', payout: null, estimate: 300 },
    
    // ═══ PLACEHOLDER - Environment & Resources ═══
    { id: 'env-trees', type: 'Environment', name: 'Trees (6 types) — Pine, Oak, Palm, Dead + stages', status: 'placeholder', replacementType: 'Hand-drawn sprites', payout: null, estimate: 360 },
    { id: 'env-rocks', type: 'Environment', name: 'Rock Formations (8) — Mining nodes, boulders', status: 'placeholder', replacementType: 'Hand-drawn sprites', payout: null, estimate: 240 },
    { id: 'env-plants', type: 'Environment', name: 'Harvestable Plants (12) — Bushes, Flowers, Crops', status: 'placeholder', replacementType: 'Hand-drawn sprites', payout: null, estimate: 300 },
    { id: 'env-props', type: 'Environment', name: 'World Props (15) — Ruins, Signs, Debris', status: 'placeholder', replacementType: 'Hand-drawn sprites', payout: null, estimate: 350 },
    
    // ═══ PLACEHOLDER - Audio (Full soundtrack & SFX) ═══
    { id: 'audio-ambient-day', type: 'Audio', name: 'Ambient Music — Daytime Themes (3 tracks)', status: 'placeholder', replacementType: 'Original compositions', payout: null, estimate: 600 },
    { id: 'audio-ambient-night', type: 'Audio', name: 'Ambient Music — Nighttime Themes (3 tracks)', status: 'placeholder', replacementType: 'Original compositions', payout: null, estimate: 600 },
    { id: 'audio-combat-music', type: 'Audio', name: 'Combat Music — Battle Themes (2 tracks)', status: 'placeholder', replacementType: 'Original compositions', payout: null, estimate: 500 },
    { id: 'audio-weather', type: 'Audio', name: 'Weather SFX — Rain, Thunder, Wind, Snow', status: 'placeholder', replacementType: 'Human foley artist', payout: null, estimate: 300 },
    { id: 'audio-animals', type: 'Audio', name: 'Animal Sounds (7 species) — Calls, Attacks, Deaths', status: 'placeholder', replacementType: 'Human foley artist', payout: null, estimate: 350 },
    { id: 'audio-combat', type: 'Audio', name: 'Combat SFX — Hits, Shots, Impacts, Deaths', status: 'placeholder', replacementType: 'Human foley artist', payout: null, estimate: 400 },
    { id: 'audio-env', type: 'Audio', name: 'Environment SFX — Footsteps, Water, Fire, Crafting', status: 'placeholder', replacementType: 'Human foley artist', payout: null, estimate: 350 },
    { id: 'audio-ui', type: 'Audio', name: 'UI SFX — Clicks, Notifications, Inventory, Menus', status: 'placeholder', replacementType: 'Human sound designer', payout: null, estimate: 250 },
    
    // ═══ PLACEHOLDER - Terrain Tilesets ═══
    { id: 'terrain-grass', type: 'Terrain', name: 'Grass Tileset — Base, Transitions, Variants', status: 'placeholder', replacementType: 'Hand-drawn tileset', payout: null, estimate: 400 },
    { id: 'terrain-snow', type: 'Terrain', name: 'Snow Tileset — Base, Transitions, Variants', status: 'placeholder', replacementType: 'Hand-drawn tileset', payout: null, estimate: 400 },
    { id: 'terrain-sand', type: 'Terrain', name: 'Sand/Beach Tileset — Base, Transitions', status: 'placeholder', replacementType: 'Hand-drawn tileset', payout: null, estimate: 350 },
    { id: 'terrain-water', type: 'Terrain', name: 'Water Tileset — Ocean, Rivers, Animated waves', status: 'placeholder', replacementType: 'Hand-drawn tileset', payout: null, estimate: 450 },
    { id: 'terrain-paths', type: 'Terrain', name: 'Paths & Roads — Dirt, Stone, Bridges', status: 'placeholder', replacementType: 'Hand-drawn tileset', payout: null, estimate: 300 },
    
    // ═══ PLACEHOLDER - UI Elements ═══
    { id: 'ui-hud', type: 'UI', name: 'HUD Elements — Health, Hunger, Thirst, Stamina bars', status: 'placeholder', replacementType: 'Hand-drawn UI', payout: null, estimate: 300 },
    { id: 'ui-inventory', type: 'UI', name: 'Inventory UI — Slots, Frames, Tooltips', status: 'placeholder', replacementType: 'Hand-drawn UI', payout: null, estimate: 350 },
    { id: 'ui-crafting', type: 'UI', name: 'Crafting UI — Recipe cards, Progress bars', status: 'placeholder', replacementType: 'Hand-drawn UI', payout: null, estimate: 280 },
    { id: 'ui-map', type: 'UI', name: 'Map UI — Minimap, World map, Icons', status: 'placeholder', replacementType: 'Hand-drawn UI', payout: null, estimate: 400 },
    
    // ═══ PLACEHOLDER - Effects & Particles ═══
    { id: 'fx-combat', type: 'Effects', name: 'Combat FX — Blood, Sparks, Muzzle flash', status: 'placeholder', replacementType: 'Hand-drawn animation', payout: null, estimate: 350 },
    { id: 'fx-environment', type: 'Effects', name: 'Environment FX — Fire, Smoke, Dust, Splash', status: 'placeholder', replacementType: 'Hand-drawn animation', payout: null, estimate: 400 },
    { id: 'fx-status', type: 'Effects', name: 'Status FX — Poison, Burn, Freeze, Heal', status: 'placeholder', replacementType: 'Hand-drawn animation', payout: null, estimate: 280 },
];

// Status styling helper
const getStatusStyle = (status: AssetStatus) => {
    switch (status) {
        case 'replaced':
            return { backgroundColor: '#166534', color: '#4ade80' };
        case 'placeholder':
            return { backgroundColor: '#78350f', color: '#fcd34d' };
        case 'pending':
            return { backgroundColor: '#1e3a5f', color: '#60a5fa' };
    }
};

const getStatusLabel = (status: AssetStatus) => {
    switch (status) {
        case 'replaced': return '✓ Replaced';
        case 'placeholder': return 'Placeholder';
        case 'pending': return 'Pending';
    }
};

const getRowBackground = (status: AssetStatus) => {
    switch (status) {
        case 'replaced': return 'rgba(0, 200, 0, 0.1)';
        case 'placeholder': return 'rgba(255, 200, 100, 0.05)';
        case 'pending': return 'rgba(100, 150, 255, 0.08)';
    }
};

const AIDisclosurePage: React.FC = () => {
    // ═══ Table State ═══
    const [sortField, setSortField] = useState<SortField>('payout');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [statusFilter, setStatusFilter] = useState<AssetStatus | 'all'>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    
    // Get unique asset types for filter dropdown
    const assetTypes = useMemo(() => {
        const types = new Set(ASSET_DATA.map(a => a.type));
        return ['all', ...Array.from(types)];
    }, []);
    
    // Sort and filter data
    const processedData = useMemo(() => {
        let data = [...ASSET_DATA];
        
        // Apply filters
        if (statusFilter !== 'all') {
            data = data.filter(a => a.status === statusFilter);
        }
        if (typeFilter !== 'all') {
            data = data.filter(a => a.type === typeFilter);
        }
        
        // Apply sorting
        data.sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case 'type':
                    comparison = a.type.localeCompare(b.type);
                    break;
                case 'name':
                    comparison = a.name.localeCompare(b.name);
                    break;
                case 'status':
                    const statusOrder = { replaced: 0, pending: 1, placeholder: 2 };
                    comparison = statusOrder[a.status] - statusOrder[b.status];
                    break;
                case 'payout':
                    comparison = (a.payout || 0) - (b.payout || 0);
                    break;
                case 'estimate':
                    comparison = a.estimate - b.estimate;
                    break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });
        
        return data;
    }, [sortField, sortDirection, statusFilter, typeFilter]);
    
    // Calculate totals - $18k Kickstarter goal
    const totals = useMemo(() => {
        const totalPaid = ASSET_DATA.reduce((sum, a) => sum + (a.payout || 0), 0);
        const totalEstimateAll = ASSET_DATA.reduce((sum, a) => sum + a.estimate, 0); // All estimates
        const totalEstimateRemaining = ASSET_DATA.filter(a => a.status !== 'replaced').reduce((sum, a) => sum + a.estimate, 0);
        const replacedCount = ASSET_DATA.filter(a => a.status === 'replaced').length;
        const remainingCount = ASSET_DATA.filter(a => a.status !== 'replaced').length;
        const kickstarterGoal = 18000;
        return { totalPaid, totalEstimateAll, totalEstimateRemaining, replacedCount, remainingCount, kickstarterGoal };
    }, []);
    
    // Handle header click for sorting
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };
    
    // Sortable header component
    const SortableHeader: React.FC<{ field: SortField; label: string; align?: 'left' | 'center' | 'right' }> = ({ field, label, align = 'left' }) => (
        <th 
            onClick={() => handleSort(field)}
            style={{ 
                padding: '12px 8px', 
                textAlign: align, 
                color: '#ff8c00', 
                fontWeight: 'bold',
                cursor: 'pointer',
                userSelect: 'none',
                whiteSpace: 'nowrap',
                transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 140, 0, 0.3)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
            {label} {sortField === field && (sortDirection === 'asc' ? '▲' : '▼')}
        </th>
    );
    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: '#0a0a0a',
            color: '#ffffff',
            fontFamily: "'Courier New', Consolas, Monaco, monospace",
            overflowX: 'hidden',
        }}>
            <BlogHeader />

            {/* Main Content */}
            <div style={{
                maxWidth: '800px',
                margin: '0 auto',
                padding: '140px 20px 60px 20px',
                lineHeight: '1.6',
            }}>
                <h1 style={{
                    fontSize: '48px',
                    color: '#ff8c00',
                    marginBottom: '20px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                }}>
                    HOW WE'RE BUILDING THIS GAME
                </h1>

                <div style={{
                    fontSize: '14px',
                    color: 'rgba(255, 255, 255, 0.6)',
                    textAlign: 'center',
                    marginBottom: '60px',
                }}>
                    A commitment to transparency • Last updated: December 2024
                </div>

                {/* ============================================ */}
                {/* SECTION 1: PHILOSOPHY FIRST - Establish shared values */}
                {/* ============================================ */}
                <section style={{ marginBottom: '50px' }}>
                    <h2 style={{
                        fontSize: '24px',
                        color: '#ff8c00',
                        marginBottom: '20px',
                        fontWeight: 'bold',
                    }}>
                        🔥 THE CAMPFIRE AT THE END OF TIME
                    </h2>
                    
                    <div style={{
                        backgroundColor: 'rgba(255, 140, 0, 0.15)',
                        border: '1px solid rgba(255, 140, 0, 0.4)',
                        borderRadius: '8px',
                        padding: '28px',
                        marginBottom: '24px',
                    }}>
                        <p style={{
                            fontSize: '18px',
                            color: 'rgba(255, 255, 255, 0.95)',
                            margin: 0,
                            lineHeight: '1.9',
                            fontStyle: 'italic',
                        }}>
                            "In a world where machines can paint and compose, what remains uniquely human? <strong style={{ color: '#ff8c00' }}>Storytelling.</strong> The raw, authentic narratives that emerge from lived experience, from joy and suffering, from the depths of the soul. These cannot be fabricated. They can only be told."
                        </p>
                    </div>
                    
                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.85)',
                        marginBottom: '20px',
                        lineHeight: '1.8',
                    }}>
                        We believe storytelling may be <strong>the last truly human profession</strong>. Not because AI can't generate words or images that look like stories. It clearly can. But because authentic stories come from somewhere AI cannot reach: the lived human experience, our collective memory, our hopes and fears, our cultural heritage passed down through generations.
                    </p>
                    
                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.85)',
                        marginBottom: '20px',
                        lineHeight: '1.8',
                    }}>
                        Games are one of humanity's most powerful storytelling mediums. They combine <strong>visual art, sound, music, and narrative</strong> — the primary drivers of emotional connection — into interactive experiences that stay with us forever. These elements deserve to be crafted by human hands and hearts.
                    </p>

                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.85)',
                        marginBottom: '20px',
                        lineHeight: '1.8',
                    }}>
                        We see AI as a <strong>prototyping tool,</strong> a way to sketch the outline of what we want to build. But the soul of the game, its stories, its art, its music. These must ultimately flow from human creativity. AI can assist in the scaffolding, but <em>stories come from the soul.</em>
                    </p>

                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        lineHeight: '1.8',
                    }}>
                        We invite you to gather around this campfire at the end of time with us. To share in the telling of true, authentic human stories. That's what games should be. <strong>That's what we're building toward.</strong>
                    </p>
                </section>

                {/* ============================================ */}
                {/* SECTION 2: HUMAN INVESTMENT - Show proof we mean it */}
                {/* ============================================ */}
                <section style={{ marginBottom: '50px' }}>
                    <h2 style={{
                        fontSize: '24px',
                        color: '#ff8c00',
                        marginBottom: '20px',
                        fontWeight: 'bold',
                    }}>
                        🎨 WHERE WE'VE ALREADY INVESTED IN HUMAN ARTISTS
                    </h2>

                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.85)',
                        marginBottom: '24px',
                        lineHeight: '1.8',
                    }}>
                        Actions speak louder than words. Here's where our limited budget has gone to <strong>real human creators</strong>:
                    </p>
                    
                    <div style={{
                        backgroundColor: 'rgba(0, 150, 0, 0.1)',
                        border: '1px solid rgba(0, 200, 0, 0.3)',
                        borderRadius: '8px',
                        padding: '24px',
                        marginBottom: '16px',
                    }}>
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px',
                        }}>
                            <div>
                                <p style={{
                                    fontSize: '16px',
                                    color: 'rgba(255, 255, 255, 0.9)',
                                    marginBottom: '16px',
                                }}>
                                    <strong style={{ color: '#4ade80' }}>Character Sprite Sheets</strong> — Our player character animations were created by talented human pixel artists. This includes all walking, running, crouching, idle, dodge rolling and swimming animations for the babushka characters.
                                </p>
                                <p style={{
                                    fontSize: '14px',
                                    color: 'rgba(255, 255, 255, 0.7)',
                                    margin: 0,
                                    fontStyle: 'italic',
                                }}>
                                    Investment: $324.78
                                </p>
                            </div>
                            
                            {/* Proof of Order */}
                            <div style={{
                                marginTop: '12px',
                                padding: '12px',
                                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                                borderRadius: '6px',
                            }}>
                                <p style={{
                                    fontSize: '12px',
                                    color: 'rgba(255, 255, 255, 0.5)',
                                    marginBottom: '8px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px',
                                }}>
                                    📄 Proof of Commission
                                </p>
                                <img 
                                    src="/images/blog/order_details.png" 
                                    alt="Fiverr order details showing commission of character sprite sheets from human artist"
                                    style={{
                                        width: '100%',
                                        maxWidth: '500px',
                                        borderRadius: '4px',
                                        border: '1px solid rgba(255, 255, 255, 0.2)',
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Summary Stats */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '16px',
                        marginBottom: '32px',
                    }}>
                        <div style={{
                            backgroundColor: 'rgba(0, 150, 0, 0.15)',
                            border: '2px solid rgba(0, 200, 0, 0.4)',
                            borderRadius: '8px',
                            padding: '16px',
                            textAlign: 'center',
                        }}>
                            <p style={{ fontSize: '24px', color: '#4ade80', margin: 0, fontWeight: 'bold' }}>
                                ${totals.totalPaid.toFixed(2)}
                            </p>
                            <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', margin: '4px 0 0 0' }}>
                                Already Invested
                            </p>
                        </div>
                        <div style={{
                            backgroundColor: 'rgba(255, 140, 0, 0.15)',
                            border: '2px solid rgba(255, 140, 0, 0.4)',
                            borderRadius: '8px',
                            padding: '16px',
                            textAlign: 'center',
                        }}>
                            <p style={{ fontSize: '24px', color: '#fcd34d', margin: 0, fontWeight: 'bold' }}>
                                ${totals.totalEstimateRemaining.toLocaleString()}
                            </p>
                            <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', margin: '4px 0 0 0' }}>
                                Est. Remaining Cost
                            </p>
                        </div>
                        <div style={{
                            backgroundColor: 'rgba(255, 100, 100, 0.15)',
                            border: '2px solid rgba(255, 100, 100, 0.4)',
                            borderRadius: '8px',
                            padding: '16px',
                            textAlign: 'center',
                        }}>
                            <p style={{ fontSize: '24px', color: '#f87171', margin: 0, fontWeight: 'bold' }}>
                                ${totals.kickstarterGoal.toLocaleString()}
                            </p>
                            <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', margin: '4px 0 0 0' }}>
                                Kickstarter Goal
                            </p>
                        </div>
                        <div style={{
                            backgroundColor: 'rgba(100, 200, 255, 0.1)',
                            border: '2px solid rgba(100, 200, 255, 0.3)',
                            borderRadius: '8px',
                            padding: '16px',
                            textAlign: 'center',
                        }}>
                            <p style={{ fontSize: '24px', color: '#60a5fa', margin: 0, fontWeight: 'bold' }}>
                                {totals.replacedCount} / {totals.replacedCount + totals.remainingCount}
                            </p>
                            <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', margin: '4px 0 0 0' }}>
                                Assets Replaced
                            </p>
                        </div>
                    </div>

                    {/* Asset Replacement Tracker Table */}
                    <h3 style={{
                        fontSize: '20px',
                        color: '#ff8c00',
                        marginBottom: '16px',
                        fontWeight: 'bold',
                    }}>
                        📊 Asset Replacement Tracker
                    </h3>
                    
                    <p style={{
                        fontSize: '14px',
                        color: 'rgba(255, 255, 255, 0.7)',
                        marginBottom: '16px',
                        lineHeight: '1.7',
                    }}>
                        Click column headers to sort • Use filters to narrow results • Scroll horizontally on mobile
                    </p>

                    {/* Filter Controls */}
                    <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '12px',
                        marginBottom: '16px',
                        alignItems: 'center',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>Status:</label>
                            <select 
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as AssetStatus | 'all')}
                                style={{
                                    backgroundColor: 'rgba(255,255,255,0.1)',
                                    border: '1px solid rgba(255, 140, 0, 0.4)',
                                    borderRadius: '4px',
                                    padding: '6px 10px',
                                    color: '#fff',
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                }}
                            >
                                <option value="all" style={{ backgroundColor: '#1a1a1a' }}>All Statuses</option>
                                <option value="replaced" style={{ backgroundColor: '#1a1a1a' }}>✓ Replaced</option>
                                <option value="placeholder" style={{ backgroundColor: '#1a1a1a' }}>Placeholder</option>
                                <option value="pending" style={{ backgroundColor: '#1a1a1a' }}>Pending</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>Type:</label>
                            <select 
                                value={typeFilter}
                                onChange={(e) => setTypeFilter(e.target.value)}
                                style={{
                                    backgroundColor: 'rgba(255,255,255,0.1)',
                                    border: '1px solid rgba(255, 140, 0, 0.4)',
                                    borderRadius: '4px',
                                    padding: '6px 10px',
                                    color: '#fff',
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                }}
                            >
                                {assetTypes.map(type => (
                                    <option key={type} value={type} style={{ backgroundColor: '#1a1a1a' }}>
                                        {type === 'all' ? 'All Types' : type}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginLeft: 'auto' }}>
                            Showing {processedData.length} of {ASSET_DATA.length} assets
                        </div>
                    </div>

                    {/* Styled scrollbar CSS */}
                    <style>{`
                        .asset-table-scroll::-webkit-scrollbar {
                            height: 10px;
                        }
                        .asset-table-scroll::-webkit-scrollbar-track {
                            background: rgba(255, 140, 0, 0.1);
                            border-radius: 5px;
                        }
                        .asset-table-scroll::-webkit-scrollbar-thumb {
                            background: rgba(255, 140, 0, 0.5);
                            border-radius: 5px;
                            border: 2px solid rgba(10, 10, 10, 0.8);
                        }
                        .asset-table-scroll::-webkit-scrollbar-thumb:hover {
                            background: rgba(255, 140, 0, 0.7);
                        }
                        /* Firefox */
                        .asset-table-scroll {
                            scrollbar-width: thin;
                            scrollbar-color: rgba(255, 140, 0, 0.5) rgba(255, 140, 0, 0.1);
                        }
                    `}</style>
                    <div 
                        className="asset-table-scroll"
                        style={{
                            overflowX: 'auto',
                            marginBottom: '16px',
                            border: '1px solid rgba(255, 140, 0, 0.2)',
                            borderRadius: '8px',
                            paddingBottom: '4px',
                        }}
                    >
                        <table style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: '13px',
                            minWidth: '950px',
                        }}>
                            <thead>
                                <tr style={{
                                    backgroundColor: 'rgba(255, 140, 0, 0.2)',
                                    borderBottom: '2px solid rgba(255, 140, 0, 0.4)',
                                }}>
                                    <SortableHeader field="type" label="Asset Type" />
                                    <SortableHeader field="name" label="Asset Name" />
                                    <SortableHeader field="payout" label="Paid" align="right" />
                                    <SortableHeader field="estimate" label="Est. Cost" align="right" />
                                    <SortableHeader field="status" label="Status" align="center" />
                                    <th style={{ padding: '12px 8px', textAlign: 'left', color: '#ff8c00', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Replacement</th>
                                </tr>
                            </thead>
                            <tbody>
                                {processedData.map((asset) => (
                                    <tr 
                                        key={asset.id} 
                                        style={{ 
                                            backgroundColor: getRowBackground(asset.status), 
                                            borderBottom: '1px solid rgba(255,255,255,0.1)',
                                            transition: 'background-color 0.2s',
                                        }}
                                    >
                                        <td style={{ padding: '10px 8px', color: 'rgba(255,255,255,0.9)', whiteSpace: 'nowrap' }}>{asset.type}</td>
                                        <td style={{ padding: '10px 8px', color: 'rgba(255,255,255,0.9)' }}>{asset.name}</td>
                                        <td style={{ 
                                            padding: '10px 8px', 
                                            textAlign: 'right', 
                                            color: asset.payout ? '#4ade80' : 'rgba(255,255,255,0.4)',
                                            fontWeight: asset.payout ? 'bold' : 'normal',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {asset.payout ? `$${asset.payout.toFixed(2)}` : '—'}
                                        </td>
                                        <td style={{ 
                                            padding: '10px 8px', 
                                            textAlign: 'right', 
                                            color: '#fcd34d',
                                            fontWeight: 'bold',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            ${asset.estimate.toLocaleString()}
                                        </td>
                                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                            <span style={{ 
                                                ...getStatusStyle(asset.status), 
                                                padding: '4px 10px', 
                                                borderRadius: '12px', 
                                                fontSize: '11px', 
                                                fontWeight: 'bold',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {getStatusLabel(asset.status)}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 8px', color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>{asset.replacementType}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Legend */}
                    <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '16px',
                        fontSize: '12px',
                        color: 'rgba(255,255,255,0.6)',
                        marginTop: '12px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ backgroundColor: '#166534', color: '#4ade80', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>✓ Replaced</span>
                            <span>Human-created asset in game</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ backgroundColor: '#78350f', color: '#fcd34d', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>Placeholder</span>
                            <span>Currently using AI-generated</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ backgroundColor: '#1e3a5f', color: '#60a5fa', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>Pending</span>
                            <span>Commission in progress</span>
                        </div>
                    </div>
                </section>

                {/* ============================================ */}
                {/* SECTION 3: THE COMMITMENT - Our binding promise */}
                {/* ============================================ */}
                <section style={{ marginBottom: '50px' }}>
                    <h2 style={{
                        fontSize: '24px',
                        color: '#ff8c00',
                        marginBottom: '20px',
                        fontWeight: 'bold',
                    }}>
                        🎯 OUR BINDING COMMITMENT
                    </h2>

                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.85)',
                        marginBottom: '20px',
                        lineHeight: '1.8',
                    }}>
                        Think of this project like <strong>Theseus' Ship</strong>: we've launched with some AI-assisted components because that's what was possible with zero funding. But plank by plank, pixel by pixel, note by note, our goal is to replace these with authentic human creations. The ship sails continuously, but its nature transforms as more human hands shape its destiny.
                    </p>
                    
                    <div style={{
                        backgroundColor: 'rgba(255, 140, 0, 0.1)',
                        border: '1px solid rgba(255, 140, 0, 0.3)',
                        borderRadius: '8px',
                        padding: '24px',
                        marginBottom: '20px',
                    }}>
                        <p style={{
                            fontSize: '16px',
                            color: 'rgba(255, 255, 255, 0.9)',
                            margin: 0,
                            lineHeight: '1.8',
                        }}>
                            <strong style={{ color: '#ff8c00' }}>The Promise:</strong> As Broth & Bullets generates revenue, we commit to <strong>reinvesting in human artists</strong>. Not just a portion. We're talking about systematically replacing AI-generated assets until the game is predominantly human-crafted. This ain't marketing speak. It's the whole point.
                        </p>
                    </div>
                    
                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        marginBottom: '16px',
                    }}>
                        <strong>Replacement Priority (in order):</strong>
                    </p>
                    
                    <ol style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        paddingLeft: '20px',
                        marginBottom: '20px',
                    }}>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>NPC Characters</strong> — Animals and wildlife deserve expressive, hand-animated sprites
                        </li>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>Item Icons</strong> — Every inventory item will get unique, hand-drawn icons
                        </li>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>Building Sprites</strong> — Detailed, cohesive architectural elements
                        </li>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>Music & Sound Effects</strong> — Original compositions and foley from human musicians and sound designers
                        </li>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>Environment Tiles</strong> — Rich, varied terrain artwork
                        </li>
                    </ol>

                    <p style={{
                        fontSize: '14px',
                        color: 'rgba(255, 255, 255, 0.6)',
                        marginBottom: '20px',
                        fontStyle: 'italic',
                    }}>
                        Note: Sova, our in-game AI assistant, will remain AI-voiced by design — she's an AI character, and having her voiced by AI is the authentic choice.
                    </p>

                    <div style={{
                        backgroundColor: 'rgba(100, 200, 255, 0.1)',
                        border: '1px solid rgba(100, 200, 255, 0.3)',
                        borderRadius: '8px',
                        padding: '24px',
                    }}>
                        <p style={{
                            fontSize: '16px',
                            color: 'rgba(255, 255, 255, 0.9)',
                            marginBottom: '12px',
                            lineHeight: '1.8',
                        }}>
                            <strong style={{ color: '#60a5fa' }}>🚀 Coming Soon: Crowdfunding Campaign</strong>
                        </p>
                        <p style={{
                            fontSize: '15px',
                            color: 'rgba(255, 255, 255, 0.8)',
                            margin: 0,
                            lineHeight: '1.7',
                        }}>
                            We're actively working on a <strong>Kickstarter campaign</strong> and exploring other crowdsourcing options to accelerate the replacement of AI assets with human-created artwork, music, and sound design. If you believe in elevating human creativity, check back soon — or join our Discord to be notified when we launch.
                        </p>
                    </div>
                </section>

                {/* ============================================ */}
                {/* SECTION 4: ACKNOWLEDGMENT - Validate their concerns */}
                {/* ============================================ */}
                <section style={{ marginBottom: '50px' }}>
                    <h2 style={{
                        fontSize: '24px',
                        color: '#ff8c00',
                        marginBottom: '20px',
                        fontWeight: 'bold',
                    }}>
                        🤝 WE HEAR YOU
                    </h2>

                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.85)',
                        marginBottom: '20px',
                        lineHeight: '1.8',
                    }}>
                        Before we detail exactly what AI was used for, we want to acknowledge something important:
                    </p>

                    <div style={{
                        backgroundColor: 'rgba(255, 200, 100, 0.1)',
                        border: '1px solid rgba(255, 200, 100, 0.3)',
                        borderRadius: '8px',
                        padding: '24px',
                        marginBottom: '20px',
                    }}>
                        <p style={{
                            fontSize: '16px',
                            color: 'rgba(255, 255, 255, 0.9)',
                            marginBottom: '16px',
                            lineHeight: '1.8',
                        }}>
                            <strong style={{ color: '#fcd34d' }}>The concerns about AI art are valid.</strong> Artists have spent years — often decades — honing their craft. Many are watching their livelihoods threatened by technology trained on their work, often without consent or compensation. That's not fair, and we don't pretend otherwise.
                        </p>
                        <p style={{
                            fontSize: '16px',
                            color: 'rgba(255, 255, 255, 0.85)',
                            margin: 0,
                            lineHeight: '1.8',
                        }}>
                            We're not here to argue that AI art is equivalent to human art. <strong>It isn't.</strong> We're here to be honest about what we used, why we used it, and how we plan to move past it.
                        </p>
                    </div>

                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        lineHeight: '1.8',
                    }}>
                        This game was built by a solo developer with no funding and a vision that would otherwise be impossible to realize. The choice wasn't "AI or human artists" — it was "AI or nothing exists at all." We chose to build something imperfect that could grow, rather than wait forever for perfect conditions that might never come.
                    </p>
                </section>

                {/* ============================================ */}
                {/* SECTION 5: THE HONEST DISCLOSURE - Now they're ready */}
                {/* ============================================ */}
                <section style={{ marginBottom: '50px' }}>
                    <h2 style={{
                        fontSize: '24px',
                        color: '#ff8c00',
                        marginBottom: '20px',
                        fontWeight: 'bold',
                    }}>
                        📋 COMPLETE AI DISCLOSURE
                    </h2>

                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        marginBottom: '24px',
                        lineHeight: '1.8',
                    }}>
                        In the spirit of full transparency, here's exactly what AI tools were used in development. Nothing hidden, nothing glossed over.
                    </p>

                    {/* AI Art */}
                    <div style={{
                        backgroundColor: 'rgba(255, 100, 100, 0.08)',
                        border: '1px solid rgba(255, 100, 100, 0.25)',
                        borderRadius: '8px',
                        padding: '24px',
                        marginBottom: '20px',
                    }}>
                        <h3 style={{
                            fontSize: '18px',
                            color: '#fca5a5',
                            marginBottom: '16px',
                            fontWeight: 'bold',
                        }}>
                            🖼️ AI-Generated Artwork
                        </h3>
                        <p style={{
                            fontSize: '14px',
                            color: 'rgba(255, 255, 255, 0.7)',
                            marginBottom: '16px',
                        }}>
                            Tool: <a href="https://retrodiffusion.com" target="_blank" rel="noopener noreferrer" style={{ color: '#ff8c00', textDecoration: 'none' }}>RetroDiffusion.com</a> (specialized pixel art AI)
                        </p>
                        <ul style={{
                            fontSize: '15px',
                            color: 'rgba(255, 255, 255, 0.75)',
                            paddingLeft: '20px',
                            margin: 0,
                        }}>
                            <li style={{ marginBottom: '8px' }}>Environment Tiles — Ground textures, terrain, water tiles</li>
                            <li style={{ marginBottom: '8px' }}>Item Icons — Inventory icons for tools, weapons, food</li>
                            <li style={{ marginBottom: '8px' }}>Building Sprites — Structures, walls, furniture</li>
                            <li style={{ marginBottom: '8px' }}>NPC Sprites — Animals and wildlife</li>
                            <li style={{ marginBottom: '8px' }}>Effect Animations — Particles, visual feedback</li>
                            <li style={{ marginBottom: '0' }}>Marketing Materials — Website backgrounds, promo images</li>
                        </ul>
                    </div>

                    {/* AI Audio - To Be Replaced */}
                    <div style={{
                        backgroundColor: 'rgba(255, 100, 100, 0.08)',
                        border: '1px solid rgba(255, 100, 100, 0.25)',
                        borderRadius: '8px',
                        padding: '24px',
                        marginBottom: '20px',
                    }}>
                        <h3 style={{
                            fontSize: '18px',
                            color: '#fca5a5',
                            marginBottom: '16px',
                            fontWeight: 'bold',
                        }}>
                            🎵 AI Audio (Targeted for Replacement)
                        </h3>
                        <p style={{
                            fontSize: '14px',
                            color: 'rgba(255, 255, 255, 0.7)',
                            marginBottom: '16px',
                        }}>
                            These audio elements we plan to replace with human-created content:
                        </p>
                        <ul style={{
                            fontSize: '15px',
                            color: 'rgba(255, 255, 255, 0.75)',
                            paddingLeft: '20px',
                            margin: 0,
                        }}>
                            <li style={{ marginBottom: '8px' }}>
                                <a href="https://elevenlabs.io" target="_blank" rel="noopener noreferrer" style={{ color: '#ff8c00', textDecoration: 'none' }}>ElevenLabs</a> — Sound effects, UI sounds, ambient voice elements
                            </li>
                            <li style={{ marginBottom: '0' }}>
                                <a href="https://suno.ai" target="_blank" rel="noopener noreferrer" style={{ color: '#ff8c00', textDecoration: 'none' }}>Suno.ai</a> — Background music and ambient soundtracks
                            </li>
                        </ul>
                    </div>

                    {/* Sova AI - Intentionally AI */}
                    <div style={{
                        backgroundColor: 'rgba(100, 200, 255, 0.08)',
                        border: '1px solid rgba(100, 200, 255, 0.25)',
                        borderRadius: '8px',
                        padding: '24px',
                        marginBottom: '20px',
                    }}>
                        <h3 style={{
                            fontSize: '18px',
                            color: '#60a5fa',
                            marginBottom: '16px',
                            fontWeight: 'bold',
                        }}>
                            🤖 Sova AI Assistant (Intentionally AI-Voiced)
                        </h3>
                        <div style={{
                            backgroundColor: 'rgba(100, 200, 255, 0.1)',
                            borderRadius: '6px',
                            padding: '16px',
                            marginBottom: '16px',
                        }}>
                            <p style={{
                                fontSize: '14px',
                                color: 'rgba(255, 255, 255, 0.85)',
                                margin: 0,
                                lineHeight: '1.7',
                                fontStyle: 'italic',
                            }}>
                                <strong style={{ color: '#60a5fa' }}>Design Decision:</strong> Sova is an AI character within the game world. Having her voiced by AI technology is a <em>diegetic choice</em> — it would feel inauthentic to have a human pretend to be an AI. The synthetic quality of her voice is intentional and thematically appropriate.
                            </p>
                        </div>
                        <ul style={{
                            fontSize: '15px',
                            color: 'rgba(255, 255, 255, 0.75)',
                            paddingLeft: '20px',
                            margin: 0,
                        }}>
                            <li style={{ marginBottom: '8px' }}>
                                <strong>Kokoro TTS</strong> (Open Source) — Powers Sova's real-time voice responses
                            </li>
                            <li style={{ marginBottom: '0' }}>
                                AI Language Models — Sova's conversational understanding and responses
                            </li>
                        </ul>
                        <p style={{
                            fontSize: '13px',
                            color: 'rgba(255, 255, 255, 0.5)',
                            marginTop: '16px',
                            marginBottom: 0,
                            fontStyle: 'italic',
                        }}>
                            This is not a compromise — it's the authentic representation of an AI character.
                        </p>
                    </div>

                    {/* AI Code - But Also Open Source */}
                    <div style={{
                        backgroundColor: 'rgba(100, 200, 100, 0.08)',
                        border: '1px solid rgba(100, 200, 100, 0.25)',
                        borderRadius: '8px',
                        padding: '24px',
                    }}>
                        <h3 style={{
                            fontSize: '18px',
                            color: '#4ade80',
                            marginBottom: '16px',
                            fontWeight: 'bold',
                        }}>
                            💻 AI in Code Development — And It's All Open Source
                        </h3>
                        
                        <div style={{
                            backgroundColor: 'rgba(100, 200, 100, 0.15)',
                            borderRadius: '6px',
                            padding: '16px',
                            marginBottom: '20px',
                        }}>
                            <p style={{
                                fontSize: '15px',
                                color: 'rgba(255, 255, 255, 0.9)',
                                margin: 0,
                                lineHeight: '1.7',
                            }}>
                                <strong style={{ color: '#4ade80' }}>Over a year of development.</strong> Yes, AI coding assistants helped but directing AI, debugging its mistakes, architecting systems, and iterating through hundreds of revisions still required <strong>thousands of hours</strong> of human time and decision-making.
                            </p>
                        </div>

                        <p style={{
                            fontSize: '14px',
                            color: 'rgba(255, 255, 255, 0.7)',
                            marginBottom: '16px',
                        }}>
                            AI assisted with:
                        </p>
                        <ul style={{
                            fontSize: '15px',
                            color: 'rgba(255, 255, 255, 0.75)',
                            paddingLeft: '20px',
                            marginBottom: '20px',
                        }}>
                            <li style={{ marginBottom: '8px' }}>Code Generation — Initial implementation of game systems</li>
                            <li style={{ marginBottom: '8px' }}>Bug Fixing — Identifying and resolving issues</li>
                            <li style={{ marginBottom: '8px' }}>Refactoring — Performance optimization</li>
                            <li style={{ marginBottom: '0' }}>Documentation — Technical docs and code comments</li>
                        </ul>

                        <div style={{
                            backgroundColor: 'rgba(100, 200, 100, 0.2)',
                            border: '2px solid rgba(100, 200, 100, 0.4)',
                            borderRadius: '8px',
                            padding: '20px',
                        }}>
                            <p style={{
                                fontSize: '16px',
                                color: 'rgba(255, 255, 255, 0.95)',
                                marginBottom: '12px',
                                lineHeight: '1.7',
                            }}>
                                <strong style={{ color: '#4ade80' }}>🎁 Giving Back: 100% Open Source</strong>
                            </p>
                            <p style={{
                                fontSize: '15px',
                                color: 'rgba(255, 255, 255, 0.85)',
                                marginBottom: '16px',
                                lineHeight: '1.7',
                            }}>
                                The <strong>entire codebase</strong> — client, server, networking, all game systems — has been released under the <strong>MIT License</strong>. Over a year of work, given freely to the community.
                            </p>
                            <p style={{
                                fontSize: '15px',
                                color: 'rgba(255, 255, 255, 0.85)',
                                marginBottom: '16px',
                                lineHeight: '1.7',
                            }}>
                                We'd love for you to:
                            </p>
                            <ul style={{
                                fontSize: '15px',
                                color: 'rgba(255, 255, 255, 0.8)',
                                paddingLeft: '20px',
                                marginBottom: '16px',
                            }}>
                                <li style={{ marginBottom: '8px' }}>⭐ <strong>Contribute</strong> — Submit pull requests, fix bugs, add features</li>
                                <li style={{ marginBottom: '8px' }}>🔀 <strong>Fork it</strong> — Build your own survival game with our engine</li>
                                <li style={{ marginBottom: '8px' }}>🎮 <strong>Clone it</strong> — Learn from the architecture, use it in your projects</li>
                                <li style={{ marginBottom: '0' }}>🖥️ <strong>Host your own server</strong> — Run your own Broth & Bullets community</li>
                            </ul>
                            <a 
                                href="https://github.com/SeloSlav/2d-multiplayer-survival-mmorpg" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                style={{
                                    display: 'inline-block',
                                    backgroundColor: '#4ade80',
                                    color: '#000',
                                    padding: '12px 24px',
                                    borderRadius: '6px',
                                    textDecoration: 'none',
                                    fontWeight: 'bold',
                                    fontSize: '15px',
                                }}
                            >
                                View on GitHub →
                            </a>
                        </div>
                    </div>
                </section>

                {/* ============================================ */}
                {/* SECTION 6: CALL TO ACTION - How to help */}
                {/* ============================================ */}
                <section style={{ marginBottom: '50px' }}>
                    <h2 style={{
                        fontSize: '24px',
                        color: '#ff8c00',
                        marginBottom: '20px',
                        fontWeight: 'bold',
                    }}>
                        💖 HOW YOU CAN HELP
                    </h2>
                    
                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.85)',
                        marginBottom: '24px',
                        lineHeight: '1.8',
                    }}>
                        If you share our vision of replacing AI-generated content with human creativity, here's how you can contribute to that mission:
                    </p>

                    <div style={{
                        display: 'grid',
                        gap: '16px',
                    }}>
                        <div style={{
                            backgroundColor: 'rgba(100, 200, 100, 0.1)',
                            border: '1px solid rgba(100, 200, 100, 0.3)',
                            borderRadius: '8px',
                            padding: '20px',
                        }}>
                            <p style={{
                                fontSize: '16px',
                                color: 'rgba(255, 255, 255, 0.9)',
                                marginBottom: '8px',
                            }}>
                                <strong style={{ color: '#4ade80' }}>🎮 Play the Game</strong>
                            </p>
                            <p style={{
                                fontSize: '14px',
                                color: 'rgba(255, 255, 255, 0.7)',
                                margin: 0,
                            }}>
                                Revenue from the game directly funds human artist commissions. Every player contributes to the transformation.
                            </p>
                        </div>

                        <div style={{
                            backgroundColor: 'rgba(100, 200, 100, 0.1)',
                            border: '1px solid rgba(100, 200, 100, 0.3)',
                            borderRadius: '8px',
                            padding: '20px',
                        }}>
                            <p style={{
                                fontSize: '16px',
                                color: 'rgba(255, 255, 255, 0.9)',
                                marginBottom: '8px',
                            }}>
                                <strong style={{ color: '#4ade80' }}>🎨 Are You an Artist?</strong>
                            </p>
                            <p style={{
                                fontSize: '14px',
                                color: 'rgba(255, 255, 255, 0.7)',
                                margin: 0,
                            }}>
                                We're actively seeking talented pixel artists, musicians, and sound designers to commission. Contact us at{' '}
                                <a href="mailto:martin.erlic@gmail.com" style={{ color: '#ff8c00', textDecoration: 'none' }}>martin.erlic@gmail.com</a>
                            </p>
                        </div>

                        <div style={{
                            backgroundColor: 'rgba(100, 200, 100, 0.1)',
                            border: '1px solid rgba(100, 200, 100, 0.3)',
                            borderRadius: '8px',
                            padding: '20px',
                        }}>
                            <p style={{
                                fontSize: '16px',
                                color: 'rgba(255, 255, 255, 0.9)',
                                marginBottom: '8px',
                            }}>
                                <strong style={{ color: '#4ade80' }}>📢 Spread the Word</strong>
                            </p>
                            <p style={{
                                fontSize: '14px',
                                color: 'rgba(255, 255, 255, 0.7)',
                                margin: 0,
                            }}>
                                Share this page. Let people know there are developers trying to do this differently — building with AI as scaffolding, not as the final product.
                            </p>
                        </div>

                        <div style={{
                            backgroundColor: 'rgba(100, 200, 100, 0.1)',
                            border: '1px solid rgba(100, 200, 100, 0.3)',
                            borderRadius: '8px',
                            padding: '20px',
                        }}>
                            <p style={{
                                fontSize: '16px',
                                color: 'rgba(255, 255, 255, 0.9)',
                                marginBottom: '8px',
                            }}>
                                <strong style={{ color: '#4ade80' }}>⏳ Watch for Our Kickstarter</strong>
                            </p>
                            <p style={{
                                fontSize: '14px',
                                color: 'rgba(255, 255, 255, 0.7)',
                                margin: 0,
                            }}>
                                Our crowdfunding campaign will specifically fund human artist commissions. Join our community to be first to know when it launches.
                            </p>
                        </div>
                    </div>
                </section>

                {/* ============================================ */}
                {/* SECTION 7: QUESTIONS - Maintain openness */}
                {/* ============================================ */}
                <section style={{ marginBottom: '40px' }}>
                    <h2 style={{
                        fontSize: '24px',
                        color: '#ff8c00',
                        marginBottom: '20px',
                        fontWeight: 'bold',
                    }}>
                        ❓ QUESTIONS OR CONCERNS?
                    </h2>
                    
                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        marginBottom: '16px',
                        lineHeight: '1.8',
                    }}>
                        If you have questions about our AI usage, want to know more about specific assets, or have concerns you'd like to discuss — we're here. We're committed to transparency and genuinely want to hear from you.
                    </p>

                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        lineHeight: '1.8',
                    }}>
                        Reach out anytime:{' '}
                        <a href="mailto:martin.erlic@gmail.com" style={{
                            color: '#ff8c00',
                            textDecoration: 'none',
                        }}>
                            martin.erlic@gmail.com
                        </a>
                    </p>
                </section>
            </div>

            <BlogFooter />
        </div>
    );
};

export default AIDisclosurePage;
