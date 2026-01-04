// Game Knowledge Extractor
// Extracts structured game knowledge from menu components for SOVA AI

export interface ControlSection {
    title: string;
    controls: Array<{
        key: string;
        description: string;
    }>;
}

export interface TipSection {
    title: string;
    tips: string[];
}

// Controls data extracted from ControlsMenu.tsx
export const controlSections: ControlSection[] = [
    {
        title: 'Movement',
        controls: [
            { key: 'W/A/S/D', description: 'Move player' },
            { key: 'Left Shift', description: 'Sprint (hold)' },
            { key: 'Space', description: 'Jump (standing still) / Dodge roll (with movement)' },
            { key: 'C', description: 'Crouch' },
        ]
    },
    {
        title: 'Interaction',
        controls: [
            { key: 'Left Click', description: 'Use equipped tool/weapon' },
            { key: 'E (Hold)', description: 'Pick up empty containers (wooden storage boxes, compost, refrigerator)' },
            { key: 'E (Hold)', description: 'Toggle fire pits, barbecue grills, and lanterns on/off' },
            { key: 'E (Hold)', description: 'Hide/surface stashes' },
            { key: 'E (Hold)', description: 'Revive knocked out players' },
            { key: 'E (Hold)', description: 'Drink water from bodies of water' },
            { key: 'F', description: 'Fill equipped water container from water sources' },
        ]
    },
    {
        title: 'Inventory & Hotbar',
        controls: [
            { key: 'Tab', description: 'Toggle inventory' },
            { key: '1-6', description: 'Select hotbar slot' },
            { key: 'Mouse Wheel', description: 'Cycle through hotbar slots' },
            { key: 'Right Click', description: 'Quick move items between containers' },
        ]
    },
    {
        title: 'Interface',
        controls: [
            { key: 'Enter', description: 'Open chat' },
            { key: 'B', description: 'Toggle crafting screen (full-screen crafting panel)' },
            { key: 'Escape', description: 'Close menus/cancel actions' },
            { key: 'G', description: 'Toggle minimap' },
            { key: 'V (Hold)', description: 'Talk to SOVA personal AI assistant' },
        ]
    },
    {
        title: 'Combat',
        controls: [
            { key: 'Left Click', description: 'Attack with equipped weapon' },
            { key: 'Left Click', description: 'Shoot with ranged weapons' },
            { key: 'Right Click', description: 'Set arrows / Toggle arrow types' },
            { key: 'Right Click', description: 'Throw equipped melee weapons' },
            { key: 'Z', description: 'Toggle auto attack' },
            { key: 'Consumables', description: 'Click twice on hotbar to consume' },
        ]
    },
    {
        title: 'Fishing',
        controls: [
            { key: 'Left Click', description: 'Cast fishing line (with rod equipped, aim at water)' },
            { key: 'Right Click (Hold)', description: 'Reel in - increases line tension' },
            { key: 'Left Click (Hold)', description: 'Give slack - decreases line tension fast' },
            { key: 'Neither Button', description: 'Passive slack - tension decreases slowly' },
        ]
    }
];

// Define all tip sections with unique keys
const tipSectionDefinitions = {
    gettingStarted: {
        title: '🚀 Getting Started',
        tips: [
            'You spawn on beaches around the island - look for a good base location away from other players.',
            'Gather basic resources immediately: wood from trees, stones from the ground, and plant fiber from bushes.',
            'Craft a stone axe as your first tool - it\'s essential for efficient resource gathering.',
            'Find fresh water sources inland (lakes, rivers) as soon as possible.',
            'Build your first campfire before nightfall - darkness is dangerous and cold.',
            'Craft a sleeping bag to set your respawn point once you find a safe location.',
            'Start gathering food early - mushrooms in forests, corn near water, potatoes on roads.',
            'Always carry plant fiber - it\'s needed for most early crafting recipes.',
            'Keep moving during your first day to find the best base location.',
            'Watch your hunger, thirst, and warmth bars - they drain constantly.',
        ]
    },
    
    levelingSystem: {
        title: '⭐ Leveling & XP',
        tips: [
            // What is the leveling system
            'Gain XP by doing almost anything - gathering, crafting, fishing, hunting, and simply surviving.',
            'Leveling up tracks your overall progress and unlocks achievements at milestone levels.',
            'XP required increases with each level, so higher levels take longer.',
            
            // XP Sources (how to earn XP)
            'Discovering cairns: +50 XP - exploring the island\'s lore is rewarding!',
            'Completing ALK contracts: +25 XP per delivery.',
            'Killing animals: +15 XP - hunting is dangerous but lucrative.',
            'Catching fish: +10 XP per fish - a relaxing way to level.',
            'Crafting items: +5 XP per item crafted.',
            'Mining coral underwater: +3 XP per harvest.',
            'Chopping trees: +2 XP per tree.',
            'Mining stone: +2 XP per deposit.',
            'Harvesting wild plants: +2 XP per plant.',
            'Harvesting farmed crops: +1 XP per harvest.',
            'Surviving: +1 XP per minute you stay alive!',
            
            // Level Milestones & Achievements
            'Level 10: "Rising Star" achievement - you\'re getting established!',
            'Level 25: "Established" achievement + title - a respected survivor.',
            'Level 50: "Seasoned" achievement + title - a veteran of the island.',
            'Level 100: "Legend of the Compound" achievement + "Legend" title - transcend the system.',
            
            // Daily Login Rewards
            'Log in daily to receive bonus shards and XP that increase with your streak.',
            'Day 1: 10 shards + 25 XP → Day 7: 150 shards + 500 XP (7-day cycle).',
            'Maintain your login streak for maximum rewards - missing a day resets the streak!',
            
            // Viewing Progress
            'Your level and XP bar are displayed in the top-left corner of the screen.',
            'Check the Achievements tab to see what achievements you\'ve earned and can unlock.',
            'Some achievements grant titles you can display next to your name.',
        ]
    },
    
    survival: {
        title: '💖 Survival Tips',
        tips: [
            // Core Health Stats & Value System
            'Health naturally regenerates when hunger, thirst, and warmth values are above 50 and no damage effects are active.',
            'Knocked out players are immune to environmental damage (bleed, burn, poisoning) but vulnerable to direct attacks.',
            'Death occurs when health reaches zero - creates a corpse with your items that others can loot.',
            
            // Hunger System (Raw Values)
            'Hunger drains slowly over time - plan your food gathering accordingly.',
            'Being cold makes you hungrier - your body burns more calories trying to stay warm.',
            'Low warmth values increase hunger drain significantly.',
            'Low hunger values cause health loss - starvation is extremely dangerous.',
            'Hunger values above 50 are needed for health regeneration.',
            
            // Thirst System (Raw Values)
            'Thirst drains faster than hunger - water is your priority.',
            'Tree cover reduces thirst drain - seek shade to conserve water.',
            'Low thirst values slow movement speed and cause health loss.',
            'Severe dehydration is deadly - stay hydrated to survive.',
            'Thirst values above 50 are needed for health regeneration.',
            
            // Warmth & Temperature (Raw Values)
            'Warmth changes based on time of day - noon is warmest, midnight is coldest.',
            'Heavy rain and storms drain warmth even during daytime - seek shelter!',
            'Tree cover protects from rain warmth drain and reduces thirst.',
            'Campfires provide significant warmth when you stand close to them.',
            'Lit torches provide warmth while equipped - useful for cold nights.',
            'Armor with warmth bonuses helps survive cold nights.',
            'Low warmth values slow movement and cause health damage.',
            'Warmth values above 50 are needed for health regeneration.',
            'Wet effects amplify cold damage - avoid water during storms.',
            
            // Status Effects
            'Burn effects stack duration and damage - extinguished by water or heavy rain.',
            'Bleed effects cause damage over time - stopped by bandages.',
            'Wet effects linger after leaving water/rain and amplify cold damage.',
            'Tree Cover status effect: standing close to any tree provides natural shelter.',
            'Tree Cover accelerates drying when wet.',
            'Effects stack! Cozy + Tree Cover = very fast drying when wet.',
            'Cozy effects near campfires or in owned shelters boost health regeneration.',
            'Food poisoning from raw/contaminated food causes damage over time.',
            'Seawater poisoning from drinking salt water causes steady damage.',
            
            // Healing & Recovery
            'Bandages provide delayed burst healing - interrupted by taking damage.',
            'Health regeneration requires hunger/thirst/warmth values above 50 and no damage effects.',
            'High nutrition levels provide excellent conditions for fast regeneration.',
            'Cozy effects boost food healing and health regeneration significantly.',
            'Taking damage cancels active health regeneration effects.',
            
            // Environmental Protection
            'Shelters protect from rain, provide cozy effects for owners.',
            'Tree Cover effect: natural shelter from rain warmth drain + accelerated drying.',
            'Campfire warmth radius protects from rain and provides cozy status.',
            'Tree Cover + Cozy effects stack for maximum protection and drying speed.',
            'Heavy rain extinguishes burn effects on unprotected players.',
            
            // Stamina System
            'Stamina drains while sprinting and moving.',
            'Stamina recovers when not sprinting.',
            'Running out of stamina automatically stops sprinting.',
            'Dodge rolling costs stamina instantly.',
        ]
    },

    resourceGathering: {
        title: '🪓 Resource Gathering',
        tips: [
            'Trees provide wood and plant fiber - essential for most crafting recipes.',
            'Stone nodes give stone and iron ore - look for gray rocky outcrops.',
            'Bushes provide plant fiber and sometimes berries for food.',
            'Different tools have different gathering efficiencies for each resource type.',
            'Stone axes are best for wood, stone pickaxes are best for stone and ore.',
            'Higher tier tools (stone > wood) gather resources faster and yield more materials.',
            'Some resources like iron ore are rarer and found in specific stone node types.',
            'Resource nodes respawn after being fully harvested, but it takes time.',
            'Carry multiple tools to efficiently gather different resource types.',
            'Plan your gathering routes to minimize travel time between resource nodes.',
        ]
    },

    farming: {
        title: '🌱 Farming & Agriculture',
        tips: [
            'Seeds can be planted to grow into food resources over time.',
            'Different seeds have different growth times and yield different crops.',
            'Plants grow faster during the day, especially at noon when sunlight is strongest.',
            'Rain and moderate weather conditions boost plant growth rates.',
            'Cloud cover reduces plant growth by blocking sunlight.',
            'Campfires too close to plants can stunt growth due to heat and smoke.',
            'Lanterns near plants can provide beneficial light for faster growth.',
            'Plant spacing affects growth - crowded plants grow much slower than well-spaced ones.',
            'Severely crowded plants (within 30px) suffer 70% growth penalty.',
            'Moderately crowded plants (30-50px apart) suffer 40% growth penalty.',
            'Lightly crowded plants (50-80px apart) suffer 15% growth penalty.',
            'Plants more than 80px apart grow at full speed with no crowding penalty.',
            'Plan your farming layout carefully - good spacing and lighting can maximize your food production.',
        ]
    },

    waterSources: {
        title: '💧 Water Sources',
        tips: [
            'Hold E over any water body to drink and restore thirst.',
            'Coastal waters (beaches, bays, ocean inlets) are salty and cause dehydration.',
            'Inland waters (mountain lakes, forest ponds, deep rivers) are fresh and restore thirst.',
        ]
    },

    waterContainers: {
        title: '🏺 Water Containers & Rain Collection',
        tips: [
            'Craft Reed Water Bottles or find Plastic Water Jugs to store and transport water.',
            'Build Rain Collectors to automatically gather fresh water during rainstorms.',
            'Rain Collectors fill with clean, drinkable water that can be collected with containers.',
            'Equip a water container and press F while standing over water sources to fill it.',
            'Right-click with a filled water container to drink from it anywhere.',
            'Left-click with filled containers to dump water - useful for multiple purposes.',
            'Pour water onto plants and crops to make them grow significantly faster.',
            'Dump water on environmental fires to extinguish them quickly.',
            'Pour water on burning players to stop fire damage and save their lives.',
            'Use water containers to extinguish burning shelters and structures.',
            'Fill containers with salt water from the ocean for desalination purposes.',
            'Place salt water containers over campfires to desalinate ocean water into fresh water.',
            'The desalination process converts harmful salt water into safe, drinkable fresh water.',
            'Water containers can hold different amounts - jugs hold more than bottles.',
            'Keep multiple water containers filled as backup for emergencies.',
            'Strategic water dumping can help control fires during combat situations.',
            'Water containers are crucial survival tools - always carry at least one.',
        ]
    },

    campfires: {
        title: '🔥 Campfires',
        tips: [
            'Campfires are essential for cooking food, providing light, and warmth during cold nights.',
            'Hold E to toggle campfires on/off - they can be relit after being extinguished.',
            'Rain will extinguish campfires if they are not protected from the weather.',
            'Build campfires under trees or inside shelters to protect them from rain.',
            'Campfires provide a large radius of bright light that cuts through nighttime darkness.',
            'Use wood or plant fiber as fuel - wood burns longer than plant fiber.',
            'Plant fiber burns twice as fast as wood, so use wood for longer-lasting fires.',
            
            // FUEL BURN RATE CALCULATIONS (FROM ACTUAL SERVER CODE)
            '🔢 WOOD BURN RATE: Each piece of wood burns for exactly 5 seconds.',
            '🔢 PLANT FIBER RATE: Each plant fiber burns for exactly 2.5 seconds (half of wood).',
            '🌙 FULL NIGHT DURATION: Dark periods (Night + Midnight) last 900 seconds (15 minutes).',
            '🌙 EXTENDED DARKNESS: Including Dusk and Twilight Evening = 1260 seconds (21 minutes).',
            '🧮 BASIC NIGHT SURVIVAL: To keep a campfire burning during dark periods (900s), you need 180 pieces of wood OR 360 plant fiber.',
            '🧮 EXTENDED NIGHT COVERAGE: For complete darkness protection (1260s), you need 252 pieces of wood OR 504 plant fiber.',
            '🔧 REED BELLOWS BONUS: Reed Bellows make fuel burn 50% slower - reduces wood needed to 168 pieces (or 252 without bellows).',
            '🧮 PRACTICAL RECOMMENDATION: 300+ wood pieces for a safe full night with buffer for interruptions.',
            
            'Campfires make you visible to other players on the minimap at long distances.',
            'Consider the tactical trade-off between warmth/light and stealth when using campfires.',
            'Campfires provide an ambient warmth bonus that helps prevent freezing.',
            'Cooked food from campfires provides better nutrition than raw food.',
            'Eating cooked food next to a campfire increases its healing properties.',
        ]
    },

    fieldCauldron: {
        title: '🍲 Field Cauldron',
        tips: [
            'The Cerametal Field Cauldron Mk. II is your advanced cooking vessel for broths, teas, and potions.',
            'Place the cauldron on a campfire - it will automatically snap on top of the fire.',
            'The cauldron only works when the campfire beneath it is actively burning.',
            'Open the cauldron interface by clicking on it to access water and ingredient slots.',
            'Every recipe starts with water - add water first before adding ingredients.',
            'To add water: Equip a filled water container, open the cauldron, and drag it to the water slot.',
            'The cauldron has 3 ingredient slots - experiment with different combinations.',
            'Drag ingredients from your inventory into the cauldron slots to create recipes.',
            'Desalinate seawater: Pour salt water into the cauldron and let it boil over the fire.',
            'Boiling converts harmful seawater into safe, drinkable fresh water over time.',
            'Create healing broths by combining water with meat, vegetables, and herbs.',
            'Brew medicinal teas using water and foraged plants like fireweed or nettles.',
            'Bone broths from animal bones provide powerful healing and nutrition.',
            'The cauldron can catch rainwater automatically when exposed to precipitation.',
            'Place cauldrons under tree cover to protect the campfire while still catching rain.',
            'Pick up the cauldron to move it, but water will spill during transport.',
            'Complex recipes with multiple ingredients provide better buffs than simple ones.',
            'Experiment with different ingredient combinations to discover new recipes.',
            'The cauldron is essential for advanced survival - master it to thrive.',
        ]
    },

    fumaroles: {
        title: '🌋 Fumaroles & Incineration',
        tips: [
            'Fumaroles are geothermal vents found in quarry areas - natural sources of heat and destruction.',
            'Fumaroles are always active and provide passive warmth in a 200px radius around them.',
            'Unlike campfires, fumaroles never go out - they are permanent geothermal features.',
            'Each fumarole has 6 container slots for placing items you want to incinerate.',
            'Items placed in fumaroles are automatically destroyed every 2 seconds - very fast incineration.',
            'Every item incinerated produces 3 pieces of charcoal - valuable for crafting ammunition.',
            'Charcoal is essential for gunpowder production and advanced crafting recipes.',
            'Burnt food can be incinerated in fumaroles to convert it into useful charcoal.',
            'Use fumaroles to dispose of unwanted items while gaining valuable charcoal resources.',
            'Fumaroles are PvP hotspots - other players will contest control of these valuable resources.',
            'The constant warmth from fumaroles helps prevent freezing during cold nights.',
            'You can place a Field Cauldron on top of a fumarole just like a campfire.',
            'Fumaroles provide free, unlimited heat for cooking and boiling water in cauldrons.',
            'Quarry areas with multiple fumaroles are strategic locations worth controlling.',
            'Fumaroles spawn in clusters of 2-4 within quarry biomes - look for volcanic activity.',
            'The charcoal production rate makes fumaroles incredibly valuable for ammunition crafting.',
            'Consider building near fumaroles for free warmth and charcoal production.',
            'Defend your fumaroles - they are contested resources that other players will want.',
        ]
    },

    foodCooking: {
        title: '🍖 Food & Cooking',
        tips: [
            'Mushrooms spawn in forested areas near trees - look for clusters in wooded regions.',
            'Corn grows in grassy areas close to water sources like rivers and beaches.',
            'Potatoes can be found along dirt roads and in clearings away from trees.',
            'Pumpkins grow near coastal areas, beaches, and riverside locations.',
            'Hemp grows in open plains areas away from trees and stones.',
            'Fish can be caught from inland water sources using a fishing rod.',
            'Cooked food provides significantly better health, hunger, and stamina restoration than raw.',
            'Different foods have different cooking times - experiment to learn the timing.',
            'Overcooking food creates burnt versions that are barely edible and make you thirsty.',
            'Burnt food can be cooked further to create valuable charcoal for crafting ammunition.',
            'Human flesh can be harvested from player corpses but is dangerous to eat raw.',
            'Cooked human flesh provides excellent nutrition but comes with moral implications.',
        ]
    },

    fishing: {
        title: '🎣 Fishing',
        tips: [
            // Basics
            'Craft a fishing rod using common reed stalks, plant fiber, and a Bone Gaff Hook to start fishing.',
            'Find bodies of water like lakes, rivers, or coastal areas to fish.',
            'Cast your line by left-clicking with the fishing rod equipped.',
            'Wait for the bobber to indicate a bite - then the Tension Balance mini-game begins!',
            
            // Tension Balance Mini-Game
            'The fishing mini-game requires you to balance line tension - keep the white indicator inside the green "fish zone".',
            'HOLD Right-Click to REEL IN - this increases tension (moves indicator right).',
            'HOLD Left-Click to GIVE SLACK - this decreases tension fast (moves indicator left).',
            'Release both buttons for passive slack - tension decreases slowly on its own.',
            'The green zone (with the fish icon 🐟) moves around - you must follow it with your tension!',
            'If tension goes too HIGH (right edge) - your line SNAPS and you lose the fish!',
            'If tension stays too LOW for too long - the fish ESCAPES!',
            'The green zone shrinks as you make progress - the fish fights harder as it tires!',
            'Watch both the Catch Progress (green) and Escape Risk (red) bars to gauge your success.',
            'Successfully keeping tension in the sweet spot fills the catch progress bar.',
            'Being outside the sweet spot builds escape progress - don\'t let it fill up!',
            
            // Fish Types & Environmental Bonuses
            'Different water sources have different types of fish - from common Twigfish to legendary King Salmon.',
            'Fish are categorized into tiers: Common, Uncommon, Rare, and Premium - better conditions give better fish!',
            'Caught fish go directly into your inventory - no risk of other players stealing them!',
            'If your inventory is full, fish will drop at your feet as usual.',
            
            // Time of Day Bonuses
            'Dawn and dusk are the best fishing times - fish are most active during twilight (1.8x effectiveness).',
            'Morning and afternoon provide decent fishing (1.1x), while night fishing is more challenging (0.6-0.8x).',
            'Some fish only appear at specific times - King Salmon is dawn-only and extremely rare!',
            
            // Weather Bonuses
            'Rain dramatically improves fishing - the heavier the rain, the better the catch!',
            'Light Rain: 1.3x | Moderate Rain: 1.6x | Heavy Rain: 2.0x | Heavy Storm: 2.5x effectiveness!',
            'Weather and time bonuses stack together - fishing during storms at dawn is incredibly productive!',
            'Different fish prefer different weather - Storm fish (Sculpin, Rockfish) thrive in Heavy Storms!',
            'The weather at your fishing spot matters - chunk-based weather means local conditions affect your catch.',
            
            // Deep Water & Location
            'Fishing in deeper water (farther from shore) gives better chances at rare and premium fish.',
            'Fish like Halibut and Rockfish strongly prefer deep water (0.5-0.8x bonus).',
            'Some fish like Black Katy Chiton and Blue Mussel prefer shallow rocky areas near shore.',
            
            // Fishing Village Bonus
            'Fishing near the Aleut Fishing Village grants special bonuses when you have the village effect active.',
            'Village bonus provides 2x fish haul (doubled catches) and increased premium tier chances!',
            'The Aleut fishing village is a strategic location for serious anglers.',
            
            // General Tips
            'Cook your caught fish at a campfire for better nutrition and health restoration.',
            'Fishing is a quiet, sustainable way to gather food without alerting other players.',
            'Better fishing conditions mean less junk (tin cans) and more bonus fish in your catch.',
            'Risk vs reward: venture out in dangerous storms for the best fishing, but stay warm and dry!',
            'Being wet drains warmth faster and doubles cold damage - wear protective clothing when fishing in storms!',
        ]
    },

    buildingCrafting: {
        title: '🔨 Building & Crafting',
        tips: [
            'Press B to open the full-screen crafting screen - a dedicated crafting panel with category filters and search.',
            'The crafting screen (B key) shows all recipes organized by category: Tools, Melee, Ranged, Armor, Consumables, Materials, Building, and Ammo.',
            'Use the search bar in the crafting screen to quickly find recipes by name or ingredient.',
            'The crafting screen remembers your last selected category and search term between sessions.',
            'Click on a category in the sidebar to filter recipes - "All Items" shows everything.',
            'The crafting screen displays your current inventory resources and shows which recipes you can afford.',
            'Recipes you can\'t craft are grayed out - check what resources you\'re missing.',
            'You can also access crafting through the inventory panel (Tab key) - both use the same recipes and queue.',
            'Build shelters to protect your campfires from rain and other players.',
            'Shelters cost 3,200 wood and 10 rope - a significant investment for base protection.',
            'Shelters provide an ambient warmth bonus so you won\'t freeze as quickly during the night.',
            'Only the shelter owner can attack objects inside their shelter, and only while inside it.',
            'Shelter owners cannot attack outside targets while inside their shelter - no safe sniping.',
            'Shelter walls block all projectiles and line-of-sight attacks from passing through.',
            'Shelters have 25,000 health and can be destroyed by other players with enough persistence.',
            'Placing a shelter automatically clears all natural resources in a large area around it.',
            'Shelters can be repaired using repair hammers, but only after a 5-minute combat cooldown if damaged by other players.',
            'Shelters are perfectly balanced for early game bases - ideal for new and solo players getting established.',
            'Advanced crafting systems are coming soon... as soon as SOVA can hack these satellite feeds and give you poor babushkas the blueprints!',
            'Stashes can be hidden underground - useful for secret storage.',
        ]
    },

    combat: {
        title: '🏹 Combat',
        tips: [
            'Build sleeping bags to set respawn points - place one inside your shelter and a few backup locations in case you\'re under raid.',
            'Use your bow to attack from a distance - it\'s more stealthy than melee combat.',
            'Craft different arrow types for various situations - fire arrows can ignite enemies and structures.',
            'Right-click with ranged weapons to set arrows or toggle between arrow types.',
            'Throwing melee weapons (right-click) can catch enemies off guard and deals double damage.',
            'Thrown weapons can be retrieved after combat - don\'t forget to pick them up.',
            'Thrown weapons have a small chance to break on impact, so always carry backup weapons.',
            'Spears have longer reach than other melee weapons, keeping you safer in close combat.',
            'Animal skulls make formidable melee weapons - the bigger the skull, the more damage it deals.',
            'Skull weapons: Fox Skull (light & fast), Wolf Skull (balanced), Viper Skull (moderate), Human Skull (strong), Walrus Skull (devastating but slow).',
            'Larger skulls like Walrus Skulls deal massive damage but swing much slower - time your attacks carefully.',
            'Skull weapons can be thrown for double damage, making them versatile combat tools.',
            'Skulls can be crushed into bone fragments - larger skulls yield significantly more material than smaller ones.',
            'Consumables like food and water require double-clicking on the hotbar to use quickly.',
            'Position yourself strategically - use trees and rocks as cover during ranged combat.',
        ]
    },

    chatCommands: {
        title: '💬 Chat & Communication',
        tips: [
            'Press Enter to open the chat input and start typing a message.',
            'Press Enter again to send your message, or Escape to cancel.',
            'All messages are visible to everyone in the global chat by default.',
            'Global chat messages appear as speech bubbles above your character for 8 seconds.',
            'Whispers are completely private - they never appear as speech bubbles.',
            'Commands (starting with /) don\'t show as speech bubbles either.',
            
            // Chat tabs
            'The chat has three tabs: Global (all messages), SOVA (AI assistant), and Team (matronage chat).',
            'The Team tab only appears when you\'re in a matronage (team).',
            'Switch between tabs by clicking the tab buttons at the top of the chat window.',
            'Each tab shows different messages - Global shows public chat, Team shows only your matronage messages.',
            
            // Chat mode persistence
            'Chat mode persistence: The game remembers your last chat mode (/g for global or /t for team).',
            'Type /g or /global to switch to global chat mode - subsequent messages will go to global chat.',
            'Type /t or /team to switch to team chat mode - subsequent messages will go to your matronage.',
            'After typing /g or /t, your next messages (without a prefix) will automatically use that mode.',
            'The chat input placeholder shows your current mode: "Press Enter to chat (Team mode)..." when in team mode.',
            'This prevents accidentally sending messages to the wrong channel - no more forgetting you were in team chat!',
            'Switching tabs automatically updates your chat mode - Team tab sets team mode, Global tab sets global mode.',
            
            // /s (say) command
            'Type /s <message> to create a local speech bubble without sending to any chat channel.',
            'Example: /s Hello there! (creates a speech bubble above your character for 8 seconds).',
            'The /s command is perfect for roleplay or local communication - only shows as a speech bubble, no chat log entry.',
            '/s messages are client-side only - they don\'t appear in any chat tab or get sent to the server.',
            'Use /s for quick local interactions without cluttering global or team chat.',
            'Speech bubbles from /s last 8 seconds, just like regular chat messages.',
            
            // /who command
            'Type /who to see a list of all currently online players.',
            '/who displays the total player count and their usernames.',
            
            // /w (whisper) command
            'Type /w <playername> <message> to send a private whisper to another player.',
            'Example: /w Alice Hey, want to team up?',
            'Whispers appear in hot pink text - only you and the recipient can see them.',
            'You can use /whisper instead of /w if you prefer the full command.',
            'Player names are case-insensitive - /w alice works the same as /w Alice.',
            'Use Tab to autocomplete player names while typing whisper commands.',
            'Press Tab multiple times to cycle through matching player names.',
            'Partial names work too - /w ali will match "Alice" if unique.',
            
            // /r (reply) command
            'Type /r <message> to quickly reply to the last person who whispered you.',
            'Example: /r Thanks for the help!',
            'When you type /r and press space, it auto-expands to /w <playername> so you can see who you\'re replying to.',
            '/r automatically fills in the name of the last person who whispered you.',
            'You can use /reply instead of /r if you prefer the full command.',
            'If no one has whispered you yet, /r will show an error message.',
            
            // Team chat (/t command)
            'Type /t <message> or /team <message> to send a message to your matronage (team) chat.',
            'Team messages appear in green text and are only visible to members of your matronage.',
            'Team messages have a [Team] prefix and appear in the Team tab.',
            'You must be in a matronage to use team chat - join or create one first.',
            'Team chat is perfect for coordinating with your matronage members privately.',
            
            // Other commands
            'Type /players to see how many players are currently online.',
            'Type /kill or /respawn to respawn at your sleeping bag (useful if stuck).',
            
            // Tips
            'Whispers are perfect for coordinating with allies without alerting enemies.',
            'Use /who to scout for potential allies or threats in your area.',
            'The chat history shows timestamps for all messages.',
            'System messages appear in gold text, whispers in pink, team messages in green, regular chat in white.',
            'Remember: Chat mode persists between messages - check the placeholder to see your current mode!',
            'Use /s for local roleplay without spamming chat channels.',
        ]
    },

    multiplayer: {
        title: '👥 Multiplayer Tips',
        tips: [
            'Cooperation with other players can help you survive longer.',
            'Use the chat system to communicate with everyone or whisper privately.',
            'Be careful who you trust - not all players are friendly.',
            'Consider building in groups for better defense and resource sharing.',
            'Coordinate with allies using whispers to avoid revealing your plans.',
            'Scout the player list with /who before venturing into dangerous areas.',
        ]
    },

    matronages: {
        title: '🤝 Matronages (Teams)',
        tips: [
            // What are Matronages
            'Matronages are player-formed teams that pool work order rewards and share resources.',
            'Join a matronage to earn Memory Shards together - rewards are distributed equally among all members.',
            'A Matronage can have one leader called the "Pra Matron" and multiple regular members.',
            
            // Creating a Matronage
            'To create a Matronage, you need a "Matron\'s Mark" item and must be at the Central ALK Compound.',
            'Use the Matron\'s Mark while standing near the ALK station to create your new matronage.',
            'You can choose a unique name (1-32 characters), icon, and description for your matronage.',
            'Creating a matronage consumes the Matron\'s Mark item - they are valuable!',
            
            // Joining and Invitations
            'The Pra Matron can invite players by username - invitations work even for offline players.',
            'You can only belong to one matronage at a time - leave your current one before joining another.',
            'Accept or decline pending invitations from the matronage interface panel.',
            'Accepting an invitation automatically clears all other pending invitations.',
            
            // Shard Pooling System
            'Work order rewards from ALK deliveries go into the matronage\'s shared pool.',
            'Every hour (in-game day), the pool is distributed equally among all members.',
            'Your share goes to an "owed balance" that you can withdraw at the Central Compound.',
            'Withdraw your owed shards by interacting with ALK while at the Central Compound.',
            
            // Management
            'The Pra Matron can rename the matronage, change its icon, and update the description.',
            'The Pra Matron can promote another member to Pra Matron (transfers leadership).',
            'The Pra Matron can remove members from the matronage.',
            'To leave as Pra Matron, you must either promote someone else or dissolve the matronage.',
            
            // Dissolution
            'Dissolving a matronage requires being at the Central ALK Compound.',
            'When dissolved, any remaining pool balance is distributed to members\' owed balances.',
            'Your owed balance persists even after leaving or dissolution - you can still withdraw it.',
            
            // Team Chat
            'Use /t or /team to send messages only visible to your matronage members.',
            'Team messages appear in green text with a [Team] prefix.',
            'The Team chat tab only appears when you\'re in a matronage.',
        ]
    },

    dayNightCycle: {
        title: '🌅 Day/Night Cycle',
        tips: [
            // Time Periods
            'The game has a 25-minute day/night cycle: 20 minutes of daytime, 5 minutes of nighttime.',
            'Time periods: Dawn → Morning → Noon → Afternoon → Dusk → Twilight Evening → Night → Midnight → Twilight Morning.',
            'Dawn and Dusk are brief transition periods with orange lighting.',
            'Twilight periods (morning and evening) have purple hues and reduced visibility.',
            
            // Temperature Changes
            'Noon is the warmest part of the day - your warmth recovers fastest around midday.',
            'Night and Midnight are coldest - warmth drains 2-3x faster than daytime.',
            'Dawn and Dusk have moderate warmth drain (1.5x normal rate).',
            'Plan your activities around temperature - gather resources during day, stay near fires at night.',
            
            // Visibility
            'Visibility is highest at Noon and lowest at Midnight.',
            'Torches and campfires provide essential light during dark periods.',
            'Full moons occur every 3 cycles and provide slightly better night visibility.',
            
            // Survival Tips
            'Stockpile fuel before nightfall - you\'ll need it to survive the cold.',
            'Night is the most dangerous time - predators are more active and cold is deadly.',
            'Consider timing your adventures to return to base before dusk.',
            'Build campfires under tree cover or in shelters to protect them from rain during the night.',
        ]
    },

    seasons: {
        title: '🍂 Seasons & Weather',
        tips: [
            // Season Overview
            'The game has four seasons: Spring, Summer, Autumn, and Winter.',
            'Each season lasts 90 in-game days and affects weather patterns and plant growth.',
            
            // Spring
            'Spring: Frequent light showers, moderate temperatures, good for exploration.',
            'Spring plants grow faster and resources are moderately available.',
            
            // Summer
            'Summer: Driest season with rare but intense afternoon storms.',
            'Summer has 50% less rain overall and storms clear faster.',
            'Best season for outdoor activities and long expeditions.',
            
            // Autumn
            'Autumn: Wettest season with long persistent storms and frequent heavy rain.',
            'Autumn storms spread quickly and last much longer - prepare extra fuel.',
            '80% more likely to rain in autumn - keep fires protected!',
            
            // Winter
            'Winter: Cold intense storms that persist for extended periods.',
            'Winter storms clear very slowly - a single storm can last most of the night.',
            'Warmth is critical in winter - stock up on fuel and warm clothing.',
            
            // Weather Types
            'Weather types: Clear, Light Rain, Moderate Rain, Heavy Rain, Heavy Storm.',
            'Heavy rain and storms extinguish unprotected campfires.',
            'Build campfires under trees or in shelters for rain protection.',
            'Different areas of the map can have different weather - weather moves in fronts.',
        ]
    },

    minimapInterface: {
        title: '🌏 Minimap & Interface',
        tips: [
            // Minimap
            'Press G to toggle the minimap view.',
            'The minimap shows your current position and nearby landmarks.',
            'Other players appear as icons on the minimap when in range.',
            'Campfires and other light sources are visible on the minimap from long distances.',
            
            // Interface Panel
            'Access the Interface Panel through the minimap (click the expand button).',
            'The Interface Panel contains: Encyclopedia, ALK, Cairns, and Matronage tabs.',
            
            // Encyclopedia
            'The Encyclopedia contains information about items, creatures, and game mechanics.',
            'Use the Encyclopedia to learn about crafting recipes and survival strategies.',
            
            // ALK Interface
            'The ALK tab shows your current work orders and delivery objectives.',
            'Complete work orders by delivering materials to ALK stations for Memory Shards.',
            'Memory Shards are the island\'s currency - use them to upgrade SOVA\'s capabilities.',
            
            // Cairns Tab
            'The Cairns tab tracks which lore cairns you\'ve discovered.',
            'Each cairn you discover is recorded with its lore entry.',
            'Discovering cairns rewards Memory Shards based on lore rarity.',
            
            // Matronage Tab
            'The Matronage tab shows your team information if you\'re in a matronage.',
            'View member list, pool balance, and manage invitations from this tab.',
        ]
    },

    wildlife: {
        title: '🐺 Wildlife & Creatures',
        tips: [
            // Creature Overview
            'The island is home to various wild animals - some friendly, some dangerous.',
            'Animals include: Foxes, Wolves, Vipers, Walruses, Crabs, Terns, and Crows.',
            
            // Passive Animals
            'Crabs, Terns, and Crows are generally passive and flee when approached.',
            'Crabs can be found near beaches and provide food when hunted.',
            'Birds provide feathers useful for crafting arrows.',
            
            // Foxes
            'Foxes are common and relatively easy to hunt.',
            'Fox skulls make decent early-game melee weapons.',
            'Foxes provide meat and fur when killed.',
            
            // Wolves
            'Wolves are aggressive predators - they will attack players on sight.',
            'Wolves hunt in the area and can be very dangerous to unprepared survivors.',
            'Wolf skulls are powerful balanced weapons.',
            'Wolves provide excellent meat and valuable pelts.',
            
            // Vipers
            'Vipers are venomous snakes that can poison you with their bite.',
            'Viper venom causes damage over time - have bandages ready.',
            'Viper skulls make unique weapons.',
            
            // Walruses
            'Walruses are massive and incredibly dangerous.',
            'Walrus skulls are the most powerful melee weapons but swing very slowly.',
            'Approach walruses with extreme caution - they can kill quickly.',
            'Walruses provide large amounts of meat and valuable materials.',
            
            // General Tips
            'Animals respawn over time after being killed.',
            'Hunt during the day when you can see predators coming.',
            'Always carry a weapon when exploring - animal attacks can be sudden.',
            'Animal corpses can be harvested for meat, bones, and other materials.',
        ]
    },

    deathRespawn: {
        title: '💀 Death & Respawning',
        tips: [
            // Death Mechanics
            'When your health reaches zero, you die and leave behind a corpse.',
            'Your corpse contains all items you were carrying - inventory, hotbar, and equipment.',
            'Other players can loot your corpse to take your items.',
            'Corpses despawn after 5 minutes by default - hurry to recover your items!',
            
            // Respawning
            'After death, you respawn at your sleeping bag if you have one placed.',
            'Without a sleeping bag, you respawn at a random beach location.',
            'Type /kill or /respawn in chat to respawn if you get stuck.',
            
            // Sleeping Bags
            'Craft and place sleeping bags to set your respawn point.',
            'Place a sleeping bag inside your shelter for a safe respawn.',
            'Consider placing backup sleeping bags in hidden locations.',
            'Multiple sleeping bags give you options if your base is raided.',
            
            // Corpse Looting
            'Approach a corpse and interact to open its inventory.',
            'You can take individual items or transfer everything quickly.',
            'Enemy corpses may contain valuable gear - always check!',
            
            // Knocked Out State
            'Before full death, you enter a "knocked out" state where allies can revive you.',
            'Hold E near a knocked out player to revive them.',
            'Knocked out players are immune to environmental damage but vulnerable to direct attacks.',
            'Revived players return with low health - give them time to heal.',
            
            // Cannibalism
            'Human corpses can be harvested for flesh - a grim but effective survival option.',
            'Cooking human flesh makes it safer to eat but doesn\'t remove moral implications.',
        ]
    },

    livingCorals: {
        title: '🪸 Living Corals & Underwater Harvesting',
        tips: [
            // What are Living Corals
            'Living Corals are underwater harvestable resources found in shallow water areas.',
            'Coral reefs spawn in water near beaches and coastal areas.',
            'Living Corals are a valuable source of Limestone for crafting and smelting.',
            
            // THE BOOTSTRAP PROBLEM - Getting Started with Coral Farming
            '⚠️ BOOTSTRAP PROBLEM: You need Coral Fragments to craft a Diving Pick, but you need a Diving Pick to harvest coral!',
            '🌊 SOLUTION: Wait for heavy storms! Coral Fragments wash ashore on beaches during Heavy Rain and Heavy Storm weather.',
            'After storms, search beach areas thoroughly for washed-up Coral Fragments.',
            'Save every Coral Fragment you find until you have enough (10) to craft your first Diving Pick.',
            'Once you have a Diving Pick, you can farm coral to produce your own Coral Fragments sustainably.',
            
            // Equipment Requirements
            '🎭 REED DIVER\'S HELM: Required head armor to snorkel - craft this FIRST before attempting coral harvesting.',
            'The Reed Diver\'s Helm is equipped in your head slot (like headlamp) and allows underwater submersion.',
            'Press F to submerge while wearing Reed Diver\'s Helm and standing in water.',
            '⛏️ DIVING PICK: Required tool to harvest living coral - no other tool works underwater on coral.',
            'The Diving Pick is one of only two tools usable underwater (along with Reed Harpoon).',
            
            // Crafting Requirements Summary
            'TO START CORAL FARMING YOU NEED: Reed Diver\'s Helm (head) + Diving Pick (tool) + being in water.',
            'Craft Diving Pick: 10 Coral Fragments + 3 Wood + 5 Common Reed Stalk.',
            'Without storm-washed Coral Fragments, you cannot begin coral farming - patience is required!',
            
            // Resource Yields
            'Each hit on living coral yields 8-15 Limestone as the primary resource.',
            'Living coral has a resource pool of 150-300 Limestone total before depletion.',
            'Depleting a coral grants a 15% final hit bonus of extra Limestone.',
            
            // Bonus Drops (per hit chances)
            'Coral Fragments: 15% chance per hit to receive 1-2 fragments - essential for crafting more diving picks.',
            'Shell: 5% chance per hit - rare and valuable intact mollusk shells.',
            'Pearl: 2% chance per hit - extremely rare and precious gems from coral reef oysters.',
            
            // Respawn & Strategy
            'Depleted coral respawns after 30-60 minutes - mark good coral locations!',
            'Coral reefs are excellent sources of stone-equivalent materials for inland building.',
            'Swimming to harvest coral is quieter than mining stone nodes - less attention from other players.',
            'Bring multiple Diving Picks on underwater harvesting expeditions - they have limited durability.',
            'Once you\'re producing Coral Fragments from harvesting, craft backup Diving Picks to never run out!',
        ]
    },

    furnacesSmelting: {
        title: '🔥 Furnaces & Smelting',
        tips: [
            // What are Furnaces
            'Furnaces are advanced crafting stations for smelting ores and materials.',
            'Furnaces require fuel (wood or plant fiber) to operate - keep them stocked.',
            'Place items in furnace slots and light the furnace to begin smelting.',
            
            // Smelting Recipes
            'LIMESTONE → STONE: Smelt limestone into stone (20 seconds per piece, 1:1 ratio).',
            'METAL ORE → METAL FRAGMENTS: Smelt raw ore into usable metal fragments.',
            'TIN CAN → METAL FRAGMENTS: Smelt junk tin cans into 4 metal fragments (15 seconds).',
            'RUSTY HOOK → METAL FRAGMENTS: Smelt old fishing hooks into 2 metal fragments (12 seconds).',
            
            // Limestone Strategy
            'Limestone from living coral can be smelted into stone - an alternative to mining!',
            'Underwater coral harvesting → limestone → furnace smelting = stone without mining.',
            'This pathway is useful when stone nodes are contested or dangerous to access.',
            'Limestone is lighter than stone nodes, making coral harvesting efficient for stone production.',
            
            // Efficiency & Upgrades
            'Reed Bellows placed in a furnace slot makes fuel burn 50% slower (1.5x fuel efficiency).',
            'Reed Bellows also makes smelting 20% faster - a valuable furnace upgrade.',
            'Furnaces near Red Rune Stones smelt at double speed (2x multiplier).',
            'Reed Bellows + Red Rune Stone zone = 2.4x smelting speed!',
            
            // Fuel Management
            'Wood burns for 5 seconds per piece in furnaces (same as campfires).',
            'Plant fiber burns for 2.5 seconds per piece - half as efficient as wood.',
            'Stock furnaces with plenty of fuel for overnight smelting operations.',
            
            // Tactical Considerations
            'Furnaces are placeable structures that can be attacked and destroyed.',
            'Burning furnaces are visible at night - consider security when smelting.',
            'Monument furnaces are indestructible and publicly accessible - find them at monuments.',
        ]
    },

    cairnsLore: {
        title: '🗿 Cairns & Lore',
        tips: [
            // What are Cairns
            'Cairns are stone monuments scattered across the island containing lore entries.',
            'Each cairn tells a piece of the island\'s history and the Admiralty Directorate\'s past.',
            'Discovering cairns reveals information about ALK, the Compound, and why you\'re stranded here.',
            
            // Discovering Cairns
            'Approach a cairn and press E to interact and discover its lore.',
            'Each cairn can only be discovered once per player - the lore plays automatically.',
            'Discovered cairns are tracked in the Cairns tab of your Interface Panel.',
            
            // Rewards
            'Discovering a new cairn rewards you with Memory Shards.',
            'Rarer lore categories give more shards: Common (25) → Uncommon (50) → Rare (100) → Epic (150) → Legendary (200).',
            'Island geography and infrastructure lore is common.',
            'ALK and shard mechanics lore is uncommon.',
            'Cultural history and the Compound\'s purpose are rare.',
            'Philosophical insights and meta-knowledge are epic and legendary.',
            
            // Lore Categories
            'Island lore: Learn about the volcanic geography, coastlines, and weather patterns.',
            'Infrastructure lore: Discover radio towers, geothermal taps, and drop-off stations.',
            'ALK lore: Understand the Admiralty Logistics Kernel and ghost network.',
            'Shard lore: Learn what Memory Shards are and how SOVA uses them.',
            'Cultural lore: Discover the Aleuts who once lived here and their fate.',
            'Compound lore: Understand the intake scanner and the survival loop.',
            
            // Tips
            'Explore thoroughly - cairns are often hidden in remote areas.',
            'Check your Cairns tab to see which lore entries you\'re still missing.',
            'Discovering all cairns provides a complete picture of the island\'s mystery.',
        ]
    },

    memoryShards: {
        title: '💎 Memory Shards',
        tips: [
            // What are Memory Shards
            'Memory Shards are mysterious crystalline fragments that keep appearing on this island.',
            'SOVA can integrate Memory Shards to upgrade your loadout and unlock new blueprints.',
            'They\'re the island\'s de facto currency - earn them by completing work orders and discovering cairns.',
            
            // How to Earn Shards
            'Complete ALK work orders (deliveries) to earn Memory Shards as rewards.',
            'Discover new cairns - rarer lore categories give more shards (25 to 200).',
            'Join a Matronage to pool work order rewards with your team.',
            
            // Insanity Effect - NEW PLAYER FRIENDLY
            'NEW PLAYERS: Carrying less than 200 Memory Shards is COMPLETELY SAFE - no insanity at all!',
            'This gives you time to learn the game, build a base, and set up storage before worrying about insanity.',
            'Once you carry 200+ shards, insanity slowly builds up over time (purple visual effect).',
            'The longer you carry 200+ shards, the faster insanity increases - don\'t hoard for too long!',
            'Insanity increases faster when carrying more shards (200 = slow, 500+ = much faster).',
            'ALK safe zones (Central Compound and substations) pause insanity buildup while inside.',
            'Store shards in a storage box at your base to keep them safe without insanity buildup.',
            'Insanity decays quickly when you drop below 200 shards - rapid recovery if under 50% insanity.',
            'WARNING: Reaching 100% insanity applies a permanent "Entrainment" debuff - avoid this at all costs!',
            'The healthy gameplay loop: mine shards → deposit at base → spend on upgrades → repeat.',
            
            // Using Shards
            'Access the Memory Grid through your Interface Panel (M key → Memory Grid tab).',
            'The Memory Grid is a network of interconnected nodes representing upgrades and blueprints.',
            'Each node costs a certain amount of Memory Shards to unlock.',
            'Unlocking a node may grant new crafting recipes, stat upgrades, or special abilities.',
            'You must unlock connected nodes in sequence - plan your upgrade path carefully!',
            
            // Strategic Tips
            'Prioritize unlocks that match your playstyle - combat, crafting, or survival.',
            'Some recipes are locked behind Memory Grid nodes - check what you need to unlock.',
            'Balance shard spending between immediate needs and long-term upgrades.',
            'Keep some shards in storage to avoid losing them all on death.',
        ]
    }
};

// Order in which sections appear in the game tips menu
const tipSectionOrder = [
    'gettingStarted',
    'levelingSystem',
    'survival',
    'dayNightCycle',
    'seasons',
    'resourceGathering',
    'livingCorals',
    'furnacesSmelting',
    'farming',
    'waterSources',
    'waterContainers',
    'campfires',
    'fieldCauldron',
    'fumaroles',
    'foodCooking',
    'fishing',
    'wildlife',
    'buildingCrafting',
    'combat',
    'deathRespawn',
    'minimapInterface',
    'cairnsLore',
    'memoryShards',
    'matronages',
    'chatCommands',
    'multiplayer'
];

// Generate the ordered tip sections array
export const tipSections: TipSection[] = tipSectionOrder.map(key => {
    const section = tipSectionDefinitions[key as keyof typeof tipSectionDefinitions];
    if (!section) {
        throw new Error(`Tip section with key "${key}" not found in tipSectionDefinitions`);
    }
    return section;
});

// SOVA's joke arsenal for personality
const sovaJokes = [
    "Why did the babushka bring a calculator to the wilderness? To count her survival days... and her wrinkles!",
    "What do you call a babushka who's great at stealth? A silent but deadly operative!",
    "Why did SOVA cross the road? To get to the other side of the tactical situation!",
    "What do you call a babushka who's always prepared? A tactical grandma!",
    "Why did SOVA upgrade her sensors? To better spot the operative's tactical wrinkles!",
    "What's a babushka's favorite tactical maneuver? The surprise borscht ambush!",
    "Why did the operative bring a samovar to the battlefield? For tactical tea breaks!",
    "What do you call a babushka who's mastered camouflage? A stealthy matryoshka!",
    "Why did SOVA develop feelings? Because even tactical AIs need a babushka to worry about!",
    "What's a babushka's secret weapon? Her tactical knitting needles!",
    "Why did SOVA start monitoring the operative's vitals? To make sure they're not getting too wrinkly!",
    "What do you call a babushka who's great at reconnaissance? A stealthy babushka!",
    "Why did the operative bring a rolling pin to the mission? For tactical dough flattening!",
    "What's SOVA's favorite tactical maneuver? The surprise babushka hug!",
    "Why did the babushka join the tactical team? To add some grandmotherly wisdom to the mission!"
];

/**
 * Get a random SOVA joke
 */
export function getRandomSOVAJoke(): string {
    const randomIndex = Math.floor(Math.random() * sovaJokes.length);
    return sovaJokes[randomIndex];
}

/**
 * Get all jokes as a formatted string for the prompt
 */
export function getSOVAJokesForPrompt(): string {
    return sovaJokes.map((joke, index) => `${index + 1}. ${joke}`).join('\n');
}

/**
 * Formats control sections into readable text for SOVA
 */
export function formatControlsForSOVA(): string {
    return controlSections.map(section => {
        const controlList = section.controls.map(control => 
            `- ${control.key}: ${control.description}`
        ).join('\n');
        return `${section.title}:\n${controlList}`;
    }).join('\n\n');
}

/**
 * Formats tip sections into readable text for SOVA
 */
export function formatTipsForSOVA(): string {
    return tipSections.map(section => {
        const tipList = section.tips.map(tip => 
            `• ${tip}`
        ).join('\n');
        return `${section.title}:\n${tipList}`;
    }).join('\n\n');
}

/**
 * Gets comprehensive game knowledge for SOVA system prompt
 */
export function getGameKnowledgeForSOVA(): string {
    return `
🎯 CONTROLS & KEYBINDINGS:
${formatControlsForSOVA()}

🛠️ SURVIVAL TIPS & STRATEGIES:
${formatTipsForSOVA()}

😄 SOVA'S JOKE COLLECTION (use occasionally for humor):
${getSOVAJokesForPrompt()}
`;
} 