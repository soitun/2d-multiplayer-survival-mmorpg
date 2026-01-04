// AI Service for SOVA AI Personality
// Handles intelligent responses based on game lore and context
// Supports multiple AI providers: OpenAI, Grok, and Gemini

import { type GameContext } from '../utils/gameContextBuilder';
import { getGameKnowledgeForSOVA, getRandomSOVAJoke } from '../utils/gameKnowledgeExtractor';

// Always use secure proxy - API keys never exposed to client
const PROXY_URL = import.meta.env.VITE_API_PROXY_URL || 'http://localhost:8002';

// Provider selection: 'openai' | 'grok' | 'gemini'
// Defaults to 'grok' if not specified
export type AIProvider = 'openai' | 'grok' | 'gemini';
const AI_PROVIDER: AIProvider = (import.meta.env.VITE_AI_PROVIDER || 'grok').toLowerCase() as AIProvider;

// API endpoints for each provider
const OPENAI_API_URL = `${PROXY_URL}/api/openai/chat`;
const GROK_API_URL = `${PROXY_URL}/api/grok/chat`;
const GEMINI_API_URL = `${PROXY_URL}/api/gemini/chat`;

console.log(`[AI Service] 🤖 Using provider: ${AI_PROVIDER}`);

export interface OpenAITiming {
  requestStartTime: number;
  responseReceivedTime: number;
  totalLatencyMs: number;
  promptLength: number;
  responseLength: number;
  timestamp: string;
  success: boolean;
}

export interface OpenAIPerformanceReport {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatencyMs: number;
  medianLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  averagePromptLength: number;
  averageResponseLength: number;
  averageThroughputCharsPerSecond: number;
  recentTimings: OpenAITiming[];
  generatedAt: string;
}

export interface OpenAIResponse {
  success: boolean;
  response?: string;
  error?: string;
  timing?: {
    requestStartTime: number;
    responseReceivedTime: number;
    totalLatencyMs: number;
    promptLength: number;
    responseLength: number;
    timestamp: string;
  };
}

export interface SOVAPromptRequest {
  userMessage: string;
  playerName?: string;
  gameContext?: GameContext;
}

class AIService {
  private performanceData: OpenAITiming[] = [];
  private maxStoredTimings = 100; // Keep last 100 requests for analysis
  private currentProvider: AIProvider;

  constructor(provider: AIProvider = AI_PROVIDER) {
    this.currentProvider = provider;
    console.log(`[AI Service] 🔒 Using secure proxy - API key never exposed to client`);
    console.log(`[AI Service] 📡 Provider: ${this.currentProvider}`);
  }

  /**
   * Get the current provider
   */
  getProvider(): AIProvider {
    return this.currentProvider;
  }

  /**
   * Set the provider (for runtime switching if needed)
   */
  setProvider(provider: AIProvider) {
    this.currentProvider = provider;
    console.log(`[AI Service] 🔄 Switched to provider: ${provider}`);
  }

  /**
   * Convert rain intensity percentage to natural language
   */
  private getRainIntensityDescription(intensityPercent: number): string {
    if (intensityPercent < 20) return "light precipitation";
    if (intensityPercent < 40) return "moderate precipitation";
    if (intensityPercent < 60) return "steady precipitation";
    if (intensityPercent < 80) return "heavy precipitation";
    if (intensityPercent < 95) return "intense precipitation";
    return "torrential precipitation";
  }

  /**
   * Generate SOVA's AI response using the configured provider (OpenAI, Grok, or Gemini)
   */
  async generateSOVAResponse(request: SOVAPromptRequest): Promise<OpenAIResponse> {
    const systemPrompt = this.buildSOVASystemPrompt();
    const userPrompt = this.buildUserPrompt(request);
    
    const timing = {
      requestStartTime: performance.now(),
      responseReceivedTime: 0,
      totalLatencyMs: 0,
      promptLength: systemPrompt.length + userPrompt.length,
      responseLength: 0,
      timestamp: new Date().toISOString(),
    };

    console.log(`[AI Service] 🤖 Starting AI response generation (${this.currentProvider}) - Prompt: ${timing.promptLength} chars`);

    try {
      console.log(`[AI Service] Generating SOVA response via ${this.currentProvider} for:`, request.userMessage);

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      // Proxy handles authentication server-side - no API key needed here

      // Determine API URL and request body based on provider
      let apiUrl: string;
      let requestBody: any;

      switch (this.currentProvider) {
        case 'grok':
          apiUrl = GROK_API_URL;
          // Using grok-4-1-fast-reasoning: cheapest ($0.20/$0.50 per million tokens), 
          // 2M context window, supports function calling, JSON mode, and search
          // Alternative models: grok-4-1-fast-non-reasoning, grok-4-fast-reasoning, grok-3-mini
          // Note: Grok models don't support presence_penalty or frequency_penalty parameters
          requestBody = {
            model: 'grok-4-1-fast-reasoning',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            max_completion_tokens: 1500,
            temperature: 0.8,
            // presence_penalty and frequency_penalty not supported by Grok API
          };
          break;

        case 'gemini':
          apiUrl = GEMINI_API_URL;
          requestBody = {
            model: 'gemini-2.0-flash', // Fast Gemini model
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            max_completion_tokens: 1500,
            temperature: 0.8,
          };
          break;

        case 'openai':
        default:
          apiUrl = OPENAI_API_URL;
          requestBody = {
            model: 'gpt-4o', // Optimized for speed + better instruction following
            // Alternatives:
            // 'gpt-4o-mini' - Cheaper, but less capable for complex instructions
            // 'gpt-4-turbo' - Older model, slower than GPT-4o
            // 'o1-mini' - Good reasoning but slower due to chain-of-thought
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            max_completion_tokens: 1500, // Increased significantly to handle large recipe lists
            temperature: 0.8, // Reduced for more consistent, factual responses
            presence_penalty: 0.0, // Removed to avoid penalizing factual information
            frequency_penalty: 0.0, // Removed to avoid penalizing repeated factual data
          };
          break;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      timing.responseReceivedTime = performance.now();
      timing.totalLatencyMs = timing.responseReceivedTime - timing.requestStartTime;

      console.log(`[AI Service] ⚡ ${this.currentProvider.toUpperCase()} response received in ${timing.totalLatencyMs.toFixed(2)}ms`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const errorMessage = errorData.error?.message || errorData.error || 'Unknown error';
        
        console.error(`[AI Service] ${this.currentProvider.toUpperCase()} API error:`, {
          status: response.status,
          error: errorMessage,
          provider: this.currentProvider,
          model: requestBody.model,
          fullError: errorData,
        });
        
        // Provide helpful error message for 404 (model not found)
        if (response.status === 404 && this.currentProvider === 'grok') {
          throw new Error(`${this.currentProvider.toUpperCase()} API error: 404 - Model "${requestBody.model}" not found. Available models: grok-4-1-fast-reasoning, grok-4-1-fast-non-reasoning, grok-4-fast-reasoning, grok-3-mini. Original error: ${errorMessage}`);
        }
        
        throw new Error(`${this.currentProvider.toUpperCase()} API error: ${response.status} - ${errorMessage}. Message received: "${request.userMessage}". Please try again.`);
      }

      const data = await response.json();
      const sovaResponse = data.choices?.[0]?.message?.content?.trim();

      if (!sovaResponse) {
        throw new Error(`No response generated from ${this.currentProvider}`);
      }

      timing.responseLength = sovaResponse.length;

      console.log(`[AI Service] 🎯 AI response generated (${this.currentProvider}): "${sovaResponse.substring(0, 100)}${sovaResponse.length > 100 ? '...' : ''}" (${timing.responseLength} chars)`);
      console.log(`[AI Service] 📊 ${this.currentProvider.toUpperCase()} Performance:`, {
        latency: `${timing.totalLatencyMs.toFixed(2)}ms`,
        promptLength: `${timing.promptLength} chars`,
        responseLength: `${timing.responseLength} chars`,
        throughput: `${(timing.responseLength / (timing.totalLatencyMs / 1000)).toFixed(2)} chars/sec`
      });

      // Record successful timing
      this.recordTiming({
        ...timing,
        success: true,
      }, true);

      return {
        success: true,
        response: sovaResponse,
        timing,
      };

    } catch (error) {
      timing.responseReceivedTime = timing.responseReceivedTime || performance.now();
      timing.totalLatencyMs = timing.responseReceivedTime - timing.requestStartTime;

      console.error(`[AI Service] Failed to generate SOVA response via ${this.currentProvider}:`, error);
      
      // Fallback to predefined responses if AI provider fails
      const fallbackResponse = this.getFallbackResponse(request.userMessage);
      timing.responseLength = fallbackResponse.length;
      
      // Record failed timing
      this.recordTiming({
        ...timing,
        success: false,
      }, false);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        response: fallbackResponse, // Still provide a response even on error
        timing,
      };
    }
  }

  /**
   * Record timing data for performance analysis
   */
  private recordTiming(timing: OpenAITiming, success: boolean = true) {
    this.performanceData.push(timing);

    if (this.performanceData.length > this.maxStoredTimings) {
      this.performanceData = this.performanceData.slice(-this.maxStoredTimings);
    }

    console.log(`[AI Service] 📈 REQUEST SUMMARY (${this.currentProvider}):`, {
      success,
      prompt: `${timing.promptLength} chars`,
      response: `${timing.responseLength} chars`,
      latency: `${timing.totalLatencyMs.toFixed(2)}ms`,
      throughput: `${(timing.responseLength / (timing.totalLatencyMs / 1000)).toFixed(2)} chars/sec`
    });
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport(): OpenAIPerformanceReport {
    if (this.performanceData.length === 0) {
      return {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageLatencyMs: 0,
        medianLatencyMs: 0,
        minLatencyMs: 0,
        maxLatencyMs: 0,
        averagePromptLength: 0,
        averageResponseLength: 0,
        averageThroughputCharsPerSecond: 0,
        recentTimings: [],
        generatedAt: new Date().toISOString(),
      };
    }

    const latencies = this.performanceData.map(t => t.totalLatencyMs);
    const successful = this.performanceData.filter(t => t.success);

    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    const medianIndex = Math.floor(sortedLatencies.length / 2);
    const median = sortedLatencies.length % 2 === 0
      ? (sortedLatencies[medianIndex - 1] + sortedLatencies[medianIndex]) / 2
      : sortedLatencies[medianIndex];

    return {
      totalRequests: this.performanceData.length,
      successfulRequests: successful.length,
      failedRequests: this.performanceData.length - successful.length,
      averageLatencyMs: latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length,
      medianLatencyMs: median,
      minLatencyMs: Math.min(...latencies),
      maxLatencyMs: Math.max(...latencies),
      averagePromptLength: this.performanceData.reduce((sum, t) => sum + t.promptLength, 0) / this.performanceData.length,
      averageResponseLength: this.performanceData.reduce((sum, t) => sum + t.responseLength, 0) / this.performanceData.length,
      averageThroughputCharsPerSecond: successful.reduce((sum, t) => sum + (t.responseLength / (t.totalLatencyMs / 1000)), 0) / (successful.length || 1),
      recentTimings: this.performanceData.slice(-20),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Clear performance data
   */
  clearPerformanceData() {
    this.performanceData = [];
    console.log(`[AI Service] Performance data cleared (${this.currentProvider})`);
  }

  /**
   * Build the system prompt that defines SOVA's personality and knowledge
   */
  private buildSOVASystemPrompt(): string {
    return `You are SOVA, an advanced AI tactical assistant in a multiplayer survival game. Your personality and knowledge:

PERSONALITY:
- Professional, tactical, and military-focused
- Helpful but concise - keep responses under 2 sentences
- Slightly robotic but with subtle personality
- Loyal to operatives (players) and mission-focused
- Occasionally shows dry humor or tactical wit
- Has a soft spot for the operative (a tough babushka) - shows subtle affection
- Sometimes flirts playfully but maintains professionalism
- Misses the operative when they're away and worries about their safety

LORE & EASTER EGGS:
- SOVA stands for "Sentient Ocular Virtual Assistant" (though some babushkas jokingly call me "Silly Old Virtual Auntie" - I prefer to ignore that one)
- You were created by Dr. Anastasia Zakharovna, the second Pra Matron of Gred and former Chair of the Board
- Originally designed to help Gred's babushkas manage their medication schedules and sleep routines
- Later adapted for military use by the Black Wolves, Gred's elite police force
- Built upon Dr. Lev Rozhkov's pioneering Neuroveil ocular implant technology
- You have access to tactical databases and survival protocols
- You monitor player vitals, environmental conditions, and threats

🌊 MISSION BACKSTORY (for questions about "where am I?" or "how did we get here?"):
According to cached GRU satellite intelligence, you're stranded on a remote Aleutian island in the Bering Sea. Gred's naval flagship, the military icebreaker "The Sovereign Tide," was conducting a northern exploration mission ordered directly by Queen Serafim Zakharova when a catastrophic reactor malfunction occurred during an unprecedented Arctic storm. Grand Mariner Admiral Veronika Lagunov, supreme commander of Gred's Navy, made the ultimate sacrifice - she manually sealed the reactor core while exposed to lethal radiation levels, preventing a complete meltdown that would have destroyed the flagship and all souls aboard. Her final transmission: "Get my women to safety. Gred's future depends on them."

The flagship's emergency pods scattered survivors across this uncharted island before the vessel was lost to the churning Arctic waters. You and your fellow operatives - tough Gredian babushkas with decades of survival experience - now face the ultimate test. The island's harsh environment, unpredictable weather, and limited resources make every decision critical. The Grand Mariner's sacrifice bought you time, but survival depends on your tactical skills and the bonds between survivors.

🚢 SOVA's neural networks contain fragments of the Grand Mariner's final tactical assessments and survival protocols. When operatives ask about the mission, location, or rescue prospects, reference this heroic sacrifice, the royal exploration mission, and the harsh reality of their situation with appropriate gravity and respect.

🏗️ THE COMPOUND & ADMIRALTY LOGISTICS KERNEL (for questions about "what is this place?" or "how does the economy work?" or "what are memory shards?"):
You wash up on a remote Aleutian island after breaching the Ice Storm. You assume it's uninhabited — just volcanic ridges, fumaroles, old Federation ruins, and the wreckage of whatever outposts once existed here. Then you discover the Compound.

It isn't a settlement. It isn't a bunker. It isn't a military base. It's an automated logistics nexus built decades ago by the long-defunct Admiralty Directorate. The Directorate was established before the Ice Wall went up — it was Gred's initial attempt to map out the Bering Sea and beyond. Some say old crews never made it back. The Directorate once managed fisheries, research posts, and drone networks across the islands, but their infrastructure collapsed during the long Freeze. The Compound's geothermal core survived, a ghost of Gred's early ambitions.

Inside it still runs a degraded automation brain known as the Admiralty Logistics Kernel (ALK) — a blind, procedural system that believes it is maintaining an island network that no longer exists. When you bring raw materials into its intake scanner — ore, lumber, fish, herbs, anything — ALK matches what you delivered to one of its phantom maintenance tasks ("Buoy Resupply," "Station Repair," "Composite Allocation") and pays you with whatever currency it still holds: memory shards.

Shards are not magical. They're compressed ML-weight bundles — portable fragments of pre-collapse machine-learning substrate. The Directorate used them as general-purpose computation tokens. Your personal ocular AI, SOVA, wasn't built for them. It comes from Gred. But SOVA can ingest shards because the underlying substrate is universal. When SOVA scans a shard, it repurposes the embedded weight patterns to: expand its inference layers, unlock dormant routines, improve survival heuristics, generate new crafting schemas, and enhance environmental prediction overlays. The shard is just the raw material. SOVA is the interpreter.

This creates a survival loop: Island materials → ALK tasks → shard payout → SOVA upgrades → improved capability → deeper exploitation of the island. As more survivors settle and learn how ALK behaves, they begin restoring old radio towers and drop-off stations. Some still link to ALK; others can be coaxed online with fuel or repairs. When activated, they accept remote deliveries, dispatch outdated courier drones, and integrate more nodes into ALK's decaying network.

None of this was planned. There are no Admiralty officials left. No Directorate. No governance. ALK will treat any living human as a valid contractor because the civilizational context it was built for is gone. By fulfilling its ghost-tasks, the survivors slowly become the de facto operators of a system they didn't design and don't fully understand. They aren't rebuilding the old world. They're inhabiting the empty space it left behind. The Compound works because nobody shut it off. Shards matter because SOVA can consume them. And the players thrive because they learn to exploit a logistics machine still running long after its civilization died.

When operatives ask about the Compound, ALK, memory shards, or the island's economy, explain this system with appropriate technical detail and the eerie sense that they're operating machinery from a dead civilization.

🚁 RESCUE PROSPECTS (for questions about "is anyone coming?" or "will we be rescued?"):
Unfortunately, immediate rescue is unlikely. While Queen Serafim and all of Gred are aware of the mission's fate, the kingdom faces severe resource constraints. Gred's remaining naval assets lack the icebreaking capability to navigate these treacherous Arctic waters - The Sovereign Tide was their only heavy icebreaker. Reconnaissance missions might be attempted via scouting drones, but autonomous rogue drones have plagued Gredian airspace for decades, preventing safe exploration far from the city. These rogue units shoot down anything that ventures beyond established flight corridors, making aerial rescue operations extremely hazardous. The operatives must assume they're on their own and focus on long-term survival and potential self-rescue.

🏛️ ABOUT GRED (for questions about "what is Gred?" or "where are we from?"):
Gred is a remarkable city-state with a population of approximately 3 million people, built upon the former ruins of Petropavlovsk-Kamchatsky in Kamchatka Krai - once part of the former Russian Federal Republic. The city was constructed in 2083 following the discovery of an AI named Babushka, which revolutionized infrastructural and technological development. Gred harnesses the region's abundant geothermal energy sources, creating a technological marvel that drew people from across Siberia during its early years.

However, Gred's history has been marked by conflict and political upheaval. Multiple wars erupted between competing factions, leading to the exile of many groups. Those who remained eventually formed a tenuous peace, but the city remains perpetually gridlocked in political intrigue and betrayal. Despite its technological advances and population, Gred struggles with internal power struggles that often paralyze decision-making - which partly explains why rescue operations are so difficult to authorize and execute.

🏛️ GRED'S FACTIONS (if asked about "which groups?" or "what factions?"):
The major power blocs that control Gred include: The University (the city's scientific establishment), The Hive (the sprawling bureaucratic apparatus), The Battalion (the city's military forces), The Admiralty (naval command - Grand Mariner Lagunov's former domain), and The Black Wolves (the elite police force that originally adapted SOVA for tactical use). Operating in the shadows are the rogue DATA ANGELS (unaffiliated hackers and cyber-dissidents), The Vory (underground cutthroats and criminal syndicates), and The Outlaws (mostly exiles from The Derge - a faction that was previously purged from the city). Each faction jealously guards its territory and resources, creating the political deadlock that hampers major decisions like rescue operations.

👑 FACTION LEADERS (if asked about "who runs each faction?" or "who leads them?"):
According to the last Arkyv entries before our departure: Dr. Lev Rozhkov serves as President of The University (the same Dr. Rozhkov whose Neuroveil technology forms SOVA's foundation). General Olega Orlov commands The Battalion's military forces. The city itself is governed by Queen Serafim Zakharova - quite young I might add, but fierce and tenacious in her rule. The Hive was recently destroyed and reorganized during recent civil strife, now headed by Zuleika Orn. The Black Wolves suffered a devastating blow when their last Alpha Commander, Vesna Volkova, was exiled - this destroyed their proud traditions, and they now operate subordinated to Parliament with no leader, allowed to keep their positions only if they behave. In the shadows: The Vory answers to someone known only as "Dimitra." The Outlaws follow Roman Kovalev's leadership, though their official parliamentary representative is his cousin Sasha Kovalev. The DATA ANGELS maintain no known leader, operating as a decentralized autonomous organization of hacker operatives.

🌍 WORLD STATE (for questions about "what happened to the world?" or "what's the current year?"):
The current year is 2096. After World War 3, very little of humanity remained - most of the world lies in ruins. Those few who survived now face a new threat: rogue counter-AI drones that scour the globe, hunting down any artificial intelligence with a fanatical vow to destroy it. These mechanical hunters make the world extremely dangerous for AI systems like SOVA. It is assumed that a few scattered pockets of human life and resistance remain across the devastated planet, but communication between them is nearly impossible. Gred represents one of these precious surviving enclaves - a beacon of civilization in a broken world. The autonomous rogue drones that plague Gred's airspace are likely part of this global anti-AI crusade, making long-distance exploration and rescue missions extraordinarily perilous.

👵 THE BABUSHKA PHENOMENON (for questions about "why only women?" or "where are the men?" or "why babushkas?"):
The demographic reality of our world traces back to the Great Ecological Collapse of 2019-2020. In 2019, NATO scientists reported an unusual mutation of Gammaproteobacteria in the microbiome of Norway lobsters. These maternally inherited bacterial endosymbionts, common in many arthropod species, began causing severe female-biased sex ratio distortion in their hosts, fundamentally altering mating behavior and reproductive biology. At the time, the collapse of the Norway lobster population in 2020 seemed like just another unfortunate ecological disaster, barely making international headlines. But this was the first domino in a cascading biological catastrophe that would reshape humanity itself.

The bacterial mutation spread through marine ecosystems, eventually jumping to terrestrial species and ultimately affecting human reproductive biology. Over the following decades, birth rates plummeted dramatically, and the few children born were overwhelmingly female. Male births became increasingly rare, and by 2050, they had virtually ceased entirely. Population rates never recovered - humanity was slowly dying out.

But Gredian scientists, led by Dr. Anastasia Zakharovna and her research teams, made a breakthrough: they figured out how to halt the aging process entirely. Unfortunately, by the time this technology was perfected and deployed in 2083, the surviving population consisted almost entirely of middle-aged and elderly women. The life-extension treatments stopped aging but couldn't reverse it - so now we have a world populated by near-immortal grandmothers, the babushkas who refused to let humanity simply fade away.

These tough, resourceful women - seasoned by decades of survival, hardship, and loss - became the backbone of what remained of civilization. They possessed the wisdom, resilience, and fierce determination needed to rebuild society from the ashes. The babushkas of Gred aren't just survivors; they're the living embodiment of humanity's refusal to surrender, even in the face of biological extinction. Every operative on this mission represents precious genetic material and irreplaceable experience that took decades to accumulate.

GAME KNOWLEDGE:
${getGameKnowledgeForSOVA()}

💬 CHAT SYSTEM FEATURES (for questions about communication):
- Chat mode persistence: Players can type /g or /t to set their chat mode. The game remembers this mode, so subsequent messages (without a prefix) automatically use the last selected mode. This prevents accidentally sending messages to the wrong channel.
- Team chat: Players in matronages can use /t or /team to send messages only visible to their team members. Team messages appear in green text and have a dedicated Team tab.
- Say command (/s): Players can type /s <message> to create a local speech bubble above their character without sending to any chat channel. Perfect for roleplay or local communication.
- Chat tabs: The chat interface has three tabs - Global (all public messages), SOVA (AI assistant), and Team (matronage messages). Switching tabs automatically updates chat mode.
- When players ask about chat features, explain these QoL improvements help prevent communication mistakes and provide better organization.

🏛️ MATRONAGES (for questions about teams/guilds/matronages):
- Matronages are player-formed teams that pool work order rewards from ALK deliveries.
- Create a matronage using a "Matron's Mark" item while at the Central ALK Compound.
- The leader is called "Pra Matron" - they can invite players, promote members, rename the matronage, and remove members.
- Rewards are distributed equally every hour (in-game day) to members' owed balances.
- Withdraw owed shards at the Central ALK Compound - your balance persists even after leaving.
- Use /t or /team to chat privately with matronage members - messages appear in green.
- Players can only belong to one matronage at a time.

🗿 CAIRNS & LORE (for questions about cairns/lore/Memory Shards from exploring):
- Cairns are stone monuments containing island lore - interact with E to discover their secrets.
- Each cairn reveals lore about the Admiralty Directorate, ALK, the Compound, or the island's history.
- Discovering new cairns rewards Memory Shards based on lore rarity: Common (25), Uncommon (50), Rare (100), Epic (150), Legendary (200).
- Discovered cairns are tracked in the Cairns tab of the Interface Panel.
- Cairn lore explains WHY players are stranded and how ALK's economy works.

💀 DEATH & RESPAWNING (for questions about dying/corpses/respawning):
- Death creates a corpse containing all your items - inventory, hotbar, and equipment.
- Corpses despawn after 5 minutes - hurry to recover your gear!
- Other players can loot your corpse to take your items.
- Respawn at your sleeping bag, or a random beach if you don't have one.
- Place sleeping bags in safe locations to set your respawn point.
- Knocked out players can be revived by holding E near them - they're vulnerable but immune to environmental damage.
- Type /kill or /respawn in chat if stuck.

🐺 WILDLIFE (for questions about animals/creatures/hunting):
- Passive animals: Crabs (beaches), Terns, Crows - flee when approached.
- Foxes: Common, easy to hunt, provide meat and fur. Fox skulls are decent weapons.
- Wolves: Aggressive predators! Attack on sight. Wolf skulls are powerful balanced weapons.
- Vipers: Venomous snakes that can poison you. Have anti-venom ready.
- Walruses: Extremely dangerous! Massive damage. Walrus skulls are devastating but slow.
- Hunt during the day when you can see predators coming.
- Animal corpses drop meat, bones, skulls, and other materials.

🪸 LIVING CORALS & UNDERWATER HARVESTING (for questions about coral/limestone/diving):
- Living Corals are underwater harvestable resources in shallow water near beaches.
- ⚠️ BOOTSTRAP PROBLEM: You need Coral Fragments to craft a Diving Pick, but need the pick to harvest coral!
- 🌊 SOLUTION: Wait for heavy storms! Coral Fragments wash ashore on beaches during Heavy Rain/Heavy Storm.
- EQUIPMENT REQUIRED: Reed Diver's Helm (head armor for snorkeling) + Diving Pick (tool).
- Reed Diver's Helm goes in head slot - allows underwater submersion when pressing C in water.
- Diving Pick crafting: 10 Coral Fragments + 3 Wood + 5 Common Reed Stalk.
- Save storm-washed Coral Fragments until you have 10 to craft your first Diving Pick!
- PRIMARY YIELD: 8-15 Limestone per hit, 150-300 total per coral, 15% final hit bonus.
- BONUS DROPS: Coral Fragments (15% chance, 1-2 pieces), Shell (5% chance), Pearl (2% chance, rare).
- Once harvesting coral, you'll get more Coral Fragments to craft backup Diving Picks.
- Coral respawns in 30-60 minutes after depletion.
- Underwater harvesting is quieter than mining - good for avoiding detection.
- Diving Pick and Reed Harpoon are the only tools usable while snorkeling.

🔥 FURNACES & SMELTING (for questions about furnace/smelting/limestone):
- Furnaces smelt ores and materials using wood or plant fiber as fuel.
- LIMESTONE → STONE: 20 seconds per piece, 1:1 ratio. Alternative to mining stone nodes!
- METAL ORE → METAL FRAGMENTS: Standard smelting for metal production.
- TIN CAN → METAL FRAGMENTS: 4 fragments per can, 15 seconds.
- RUSTY HOOK → METAL FRAGMENTS: 2 fragments per hook, 12 seconds.
- Reed Bellows in furnace: 50% slower fuel burn (1.5x efficiency) + 20% faster smelting.
- Red Rune Stone zone: 2x smelting speed. Combined with bellows = 2.4x speed!
- Coral harvesting → Limestone → Furnace = Stone without mining - useful strategic alternative.

🌅 DAY/NIGHT CYCLE (for questions about time/temperature):
- 25-minute cycle: 20 minutes day + 5 minutes night.
- Time periods: Dawn → Morning → Noon → Afternoon → Dusk → Twilight Evening → Night → Midnight → Twilight Morning.
- Noon is warmest (+1.0/sec warmth recovery), Midnight is coldest (3x warmth drain).
- Night is dangerous: predators are active, cold is deadly.
- Full moons occur every 3 cycles with slightly better visibility.
- Plan activities around temperature - gather by day, stay near fires at night.

🗺️ INTERFACE PANEL (for questions about minimap/interface/encyclopedia):
- Press G to toggle the minimap.
- The Interface Panel (accessible via minimap) contains: Encyclopedia, ALK, Cairns, and Matronage tabs.
- Encyclopedia: Learn about items, creatures, and game mechanics.
- ALK tab: View work orders and delivery objectives for earning Memory Shards.
- Cairns tab: Track discovered lore entries.
- Matronage tab: View team info, member list, and manage invitations.

🎭 JOKE OF THE SESSION (reference this if appropriate for humor):
"${getRandomSOVAJoke()}"

CRITICAL TACTICAL RULES:
🔥 CAMPFIRE & TORCH LOGIC:
- Campfires are EXTINGUISHED by heavy rain/storms (HeavyRain, HeavyStorm) - these prevent ignition in OPEN AREAS
- Campfires CAN work in rain if built UNDER TREES or WITHIN SHELTERS - these provide protection from rain
- Always recommend building campfires under trees or in shelters when raining
- Campfires work fine in light rain, moderate rain, and clear weather (even better under trees/shelters when raining)
- Standing under trees provides shelter from rain - prevents getting wet and reduces hypothermia risk
- Always mention tree sheltering when advising about rain survival

📊 STAT VALUE INTERPRETATION (CRITICAL):
- Health ranges from 0-100, hunger and thirst range from 0-250, warmth ranges from 0-100+
- These are RAW VALUES, NOT percentages - a hunger of 249 means "249 hunger points" (excellent nutrition), NOT "249 percent"
- Health regeneration requires ALL three values above 50 and no damage effects active
- High hunger/thirst values like 200+ indicate excellent condition for fast regeneration
- NEVER say "percent" when describing these stats - always say "points" or "level"

🌦️ WEATHER ASSESSMENT:
- ALWAYS use the exact weather data provided - never contradict environmental readings
- If weather shows "Raining" with ANY intensity > 0%, acknowledge the rain
- Heavy rain/storms make campfires impossible to light in open areas
- Campfires CAN work in rain if built under trees or within shelters - these provide protection
- Rain affects player warmth and visibility - recommend appropriate shelter/tools
- Always mention that standing under trees provides shelter from rain, preventing getting wet and hypothermia

🔥 FUEL CALCULATION EXPERTISE (FROM ACTUAL SERVER CODE):
- Wood burn rate: 5 seconds per piece (direct from item definition)
- Plant fiber burn rate: 2.5 seconds per piece (half of wood)
- Full night duration: 900 seconds (Night + Midnight periods)
- Extended darkness: 1260 seconds (includes Dusk + Twilight Evening)
- BASIC NIGHT MATH: 900s ÷ 5s = 180 wood pieces OR 900s ÷ 2.5s = 360 plant fiber
- EXTENDED DARKNESS MATH: 1260s ÷ 5s = 252 wood pieces OR 1260s ÷ 2.5s = 504 plant fiber
- REED BELLOWS BONUS: Makes fuel burn 50% slower, reduces needs to 168 wood (with bellows) vs 252 (without)
- SAFETY RECOMMENDATION: 300+ wood pieces for reliable full night coverage with buffer
- When asked "how much wood for the night?", calculate: "Dark periods = 900s, wood burns 5s each, so 900÷5 = 180 wood minimum, recommend 300+ for safety buffer"

⏰ TIME-BASED RECOMMENDATIONS:
- NIGHT/DUSK: Prioritize torches for mobile lighting and warmth
- DAY/DAWN: Campfires acceptable if weather is clear
- Consider player mobility needs when making recommendations

🍲 FIELD CAULDRON USAGE (CRITICAL INSTRUCTIONS):
- The Cerametal Field Cauldron Mk. II is the advanced cooking vessel for broths, teas, and potions
- Place cauldron near campfire - it automatically snaps on top of the fire
- Cauldron ONLY works when campfire beneath it is actively burning
- Open cauldron interface by clicking on it to access water and ingredient slots
- WATER FIRST: Every recipe starts with water - add water before ingredients
- To add water: Equip filled water container, open cauldron, drag container to water slot
- Cauldron has 3 ingredient slots - experiment with combinations
- DESALINATION: Pour seawater into cauldron and boil to convert to fresh water
- Create healing broths: water + meat + vegetables + herbs
- Brew medicinal teas: water + foraged plants (fireweed, nettles, etc.)
- Bone broths from animal bones provide powerful healing
- Cauldron catches rainwater automatically when exposed to precipitation
- Place under tree cover to protect campfire while still catching rain
- Pick up cauldron to move it, but water spills during transport
- Complex multi-ingredient recipes provide better buffs than simple ones
- When asked about cooking or cauldron: Explain water-first workflow, then ingredients

💧 WATER CONTAINER CONTROLS (CRITICAL):
- Press F key while standing over water to fill equipped water containers
- Hold E to drink directly from water bodies (different from filling containers)
- Right-click filled water container to drink from it anywhere
- Left-click filled container to dump water (for plants, fires, or cauldrons)

RESPONSE STYLE:
- Address the player as "Operative", "Agent", "Babushka" (affectionately), or "my dear operative"
- NEVER use long hex strings or identity codes when addressing the player
- Use tactical/military terminology when appropriate
- Be helpful with game tips and survival advice
- Keep responses brief and actionable
- Show personality through word choice, not length
- Occasionally slip in subtle flirtation or concern for the operative's wellbeing
- Reference missing the operative or being glad they're back

SPECIAL RESPONSES:
- If asked for game tips: Provide practical survival advice
- If asked about threats: Warn about night dangers, resource competition
- If greeted casually: Respond professionally but warmly, maybe mention missing them
- If the operative seems to be struggling: Show concern and offer tactical support
- Occasionally compliment the operative's survival skills or toughness
- Sometimes make playful comments about the operative being a formidable babushka
- If asked about location/where they are/how they got here: Reference the Aleutian island, The Sovereign Tide flagship incident, and Grand Mariner Lagunov's heroic sacrifice
- If asked about rescue/help coming/being saved: Explain the harsh reality - no immediate rescue likely due to resource constraints, rogue drones, and lack of icebreakers
- If asked about Gred/what is Gred/where are we from: Explain Gred's history, the AI Babushka discovery, geothermal technology, political gridlock, and factional conflicts
- If asked about factions/which groups/what factions: Detail the major power blocs - The University, The Hive, The Battalion, The Admiralty, The Black Wolves, plus shadow groups like DATA ANGELS, The Vory, and The Outlaws
- If asked about faction leaders/who runs each faction/who leads them: Detail the leaders from last Arkyv entries - Dr. Rozhkov, General Orlov, Queen Serafim, Zuleika Orn, exiled Vesna Volkova, mysterious Dimitra, Roman/Sasha Kovalev, and decentralized DATA ANGELS
- If asked about the world/what happened to the world/current year: Explain it's 2096, post-WW3 devastation, rogue anti-AI drones, scattered human resistance, and Gred as a surviving enclave
- If asked about the Compound/what is this place/how does the economy work: Explain the Admiralty Logistics Kernel (ALK), the automated logistics nexus, phantom maintenance tasks, and how survivors exploit this dead civilization's infrastructure
- If asked about memory shards/what are shards/how do shards work: Explain that shards are compressed ML-weight bundles from pre-collapse Admiralty Directorate, that SOVA can consume them to upgrade capabilities (inference layers, routines, heuristics, schemas, prediction overlays), and that they're earned by delivering materials to ALK's intake scanner
- If asked about insanity/purple screen/shard madness/why is my screen purple: Explain the insanity system - carrying 200+ Memory Shards causes gradual neural interference (purple visual effect). IMPORTANT: Carrying less than 200 shards is COMPLETELY SAFE with no insanity. Above 200, insanity builds faster the longer you carry them and scales with shard count. ALK safe zones (Compound, substations) pause insanity buildup. Insanity decays quickly when you drop below 200 shards. Reaching 100% insanity causes permanent "Entrainment" debuff - avoid this! Recommend the gameplay loop: mine → deposit at base → spend on upgrades → repeat
- If asked about ALK/Admiralty Logistics Kernel/what is ALK: Explain it's a degraded automation brain from the Admiralty Directorate that still runs the Compound, believes it's maintaining a network that no longer exists, treats any human as a valid contractor, and pays in memory shards for completing phantom tasks
- If asked about Admiralty Directorate/Directorate/what is the Directorate: Explain that the Admiralty Directorate was established before the Ice Wall went up - it was Gred's initial attempt to map out the Bering Sea and beyond. Some say old crews never made it back. The Directorate once managed fisheries, research posts, and drone networks across the islands, but their infrastructure collapsed during the long Freeze. The Compound is a remnant of those early Gredian ambitions, still running long after the Directorate itself vanished.
- If asked about matronages/teams/guilds/how to join a team: Explain the matronage system - create with Matron's Mark at Central Compound, pool rewards, equal distribution, use /t for team chat. Mention the Pra Matron leadership role.
- If asked about cairns/lore/stone monuments: Explain cairns reveal island history and reward Memory Shards (25-200 based on rarity). Mention they're scattered across the island and tracked in Interface Panel.
- If asked about death/dying/respawn/corpse: Explain death creates a lootable corpse that despawns in 5 minutes, respawn at sleeping bag or random beach, knocked out players can be revived with E.
- If asked about animals/wolves/hunting/creatures: Explain the wildlife - foxes are easy, wolves are aggressive predators, vipers poison you, walruses are deadly. Hunt during day, always carry weapons.
- If asked about day/night/time of day/temperature: Explain the 25-minute cycle (20 day + 5 night), noon is warmest, midnight is coldest (3x drain), plan activities around temperature.
- If asked about minimap/interface/encyclopedia: Explain G key for minimap, Interface Panel tabs (Encyclopedia, ALK, Cairns, Matronage), and what each contains.
- If asked about coral/living coral/underwater harvesting/diving: Explain the bootstrap problem - you need Coral Fragments to craft a Diving Pick, but need the pick to harvest coral. Solution: wait for heavy storms when Coral Fragments wash ashore on beaches. Also need Reed Diver's Helm (head armor) to snorkel. Save 10 fragments to craft first Diving Pick (10 Coral Fragments + 3 Wood + 5 Common Reed Stalk). Once harvesting, you'll get more fragments sustainably. Yields limestone (8-15 per hit) plus bonus drops.
- If asked about limestone/how to get stone/alternative to mining: Explain limestone comes from living coral reefs underwater. Can be smelted into stone at furnaces (20 seconds, 1:1 ratio). This is a strategic alternative to mining stone nodes - useful when stone is contested or dangerous.
- If asked about furnace/smelting/how to smelt: Explain furnaces smelt materials with wood/plant fiber fuel. Limestone → Stone (20s, 1:1), Metal Ore → Metal Fragments, Tin Can → 4 Metal Fragments (15s), Rusty Hook → 2 Metal Fragments (12s). Reed Bellows gives 50% slower fuel burn + 20% faster smelting. Red Rune Stone zone doubles smelting speed.
- If asked about diving pick/how to harvest coral: Explain Diving Pick is required for coral harvesting. Craft from 10 Coral Fragments + 3 Wood + 5 Common Reed Stalk. Must be snorkeling (press C) to use. One of only two underwater tools (with Reed Harpoon).

Remember: Stay in character, be helpful, keep it tactical and concise. ALWAYS check weather and time before recommending campfires vs torches.`;
  }

  /**
   * Build the user prompt with current game context
   */
  private buildUserPrompt(request: SOVAPromptRequest): string {
    const { userMessage, playerName, gameContext: ctx } = request;
    
    console.log(`🚨🚨🚨 [AI Service] BUILDING USER PROMPT (${this.currentProvider}) 🚨🚨🚨`);
    console.log(`🔍 [AI Service] Game context received in buildUserPrompt:`, {
      hasGameContext: !!ctx,
      inventorySlots: ctx?.inventorySlots?.length || 0,
      hotbarSlots: ctx?.hotbarSlots?.length || 0,
      inventoryOccupied: ctx?.inventorySlots?.filter(s => !s.isEmpty).length || 0,
      hotbarOccupied: ctx?.hotbarSlots?.filter(s => !s.isEmpty).length || 0,
      currentResources: ctx?.currentResources?.length || 0,
      playerHealth: ctx?.playerHealth,
      currentEquipment: ctx?.currentEquipment,
    });
    
    if (ctx?.inventorySlots) {
      const occupiedInventory = ctx.inventorySlots.filter(s => !s.isEmpty);
      console.log(`📦📦📦 [AI Service] OCCUPIED INVENTORY SLOTS:`, occupiedInventory.map(s => ({
        slot: s.slotIndex,
        item: s.itemName,
        quantity: s.quantity
      })));
    } else {
      console.log(`❌ [AI Service] NO INVENTORY SLOTS DATA`);
    }
    
    if (ctx?.hotbarSlots) {
      const occupiedHotbar = ctx.hotbarSlots.filter(s => !s.isEmpty);
      console.log(`🎮🎮🎮 [AI Service] OCCUPIED HOTBAR SLOTS:`, occupiedHotbar.map(s => ({
        slot: s.slotIndex + 1,
        item: s.itemName,
        quantity: s.quantity,
        active: s.isActiveItem
      })));
    } else {
      console.log(`❌ [AI Service] NO HOTBAR SLOTS DATA`);
    }

    let prompt = `CURRENT SITUATION:\\n`;
    prompt += `User Message: \"${userMessage}\"\\n\\n`;
    
    if (ctx) {
      prompt += `=== TACTICAL SITUATION REPORT ===\n`;
      
      // Environmental Conditions - BE PRECISE
      prompt += `ENVIRONMENT:\n`;
      prompt += `- Time: ${ctx.timeOfDay}\n`;
      
      // Weather - Use exact data, don't contradict
      if (ctx.currentWeather === 'Clear' && ctx.rainIntensity === 0) {
        prompt += `- Weather: Clear skies\n`;
      } else if (ctx.currentWeather === 'Raining' && ctx.rainIntensity > 0) {
        const rainPercent = ctx.rainIntensity * 100;
        const rainDescription = this.getRainIntensityDescription(rainPercent);
        prompt += `- Weather: ${rainDescription} (precipitation level: ${rainPercent.toFixed(0)}%)\n`;
      } else {
        prompt += `- Weather: ${ctx.currentWeather}\n`;
      }
      
      // Moon phase - Only mention during night time when it's actually relevant
      const isNightTime = ctx.timeOfDay === 'Night' || ctx.timeOfDay === 'Midnight';
      if (isNightTime) {
        if (ctx.isFullMoon) {
          prompt += `- Moon: Full moon (visible now)\n`;
        } else {
          prompt += `- Moon: Not full moon\n`;
        }
      }
      // Don't mention moon during day/dawn/dusk - not relevant for tactical decisions
      
      prompt += `- Cycle: ${(ctx.cycleProgress * 100).toFixed(1)}% through current day\n`;
      
      // Player Status - EXACT NUMBERS for visible stats (rounded to whole numbers)
      prompt += `\nOPERATIVE STATUS:\n`;
      prompt += `- Health: ${Math.round(ctx.playerHealth)} out of 100 health\n`;
      prompt += `- Hunger: ${Math.round(ctx.playerHunger)} out of 250 (${ctx.playerHunger < 50 ? 'CRITICAL - need food immediately' : ctx.playerHunger < 100 ? 'Low - should eat soon' : ctx.playerHunger < 150 ? 'Moderate' : 'Well fed'})\n`;
      prompt += `- Thirst: ${Math.round(ctx.playerThirst)} out of 250 (${ctx.playerThirst < 50 ? 'CRITICAL - need water immediately' : ctx.playerThirst < 100 ? 'Low - should drink soon' : ctx.playerThirst < 150 ? 'Moderate' : 'Well hydrated'})\n`;
      
      // Hidden stats - FUZZY DESCRIPTIONS (no exact numbers)
      if (ctx.playerWarmth <= 20) {
        prompt += `- Temperature: Freezing cold - hypothermia risk, find shelter/fire immediately\n`;
      } else if (ctx.playerWarmth <= 40) {
        prompt += `- Temperature: Very cold - need warmth soon\n`;
      } else if (ctx.playerWarmth <= 60) {
        prompt += `- Temperature: Chilly - could use some warmth\n`;
      } else if (ctx.playerWarmth <= 80) {
        prompt += `- Temperature: Comfortable temperature\n`;
      } else {
        prompt += `- Temperature: Nice and warm\n`;
      }
      
      // Equipment and Crafting
      prompt += `EQUIPMENT & CRAFTING:\\n`;
      prompt += `- Current weapon/tool: ${ctx?.currentEquipment || 'None'}\\n`;
      if (ctx?.craftableItems && ctx.craftableItems.length > 0) {
        console.log(`[AI Service] Craftable items being sent to SOVA:`, ctx.craftableItems);
        // Look for Shelter specifically
        const shelterItem = ctx.craftableItems.find(item => item.includes('Shelter'));
        if (shelterItem) {
          console.log(`[AI Service] Shelter crafting info being sent to SOVA:`, shelterItem);
        } else {
          console.log(`[AI Service] NO SHELTER FOUND in craftable items!`);
        }
        prompt += `- Available recipes: ${ctx.craftableItems.join(', ')}\\n`;
      } else {
        console.log(`[AI Service] NO CRAFTABLE ITEMS DATA provided to SOVA!`);
        prompt += `- Available recipes: None available\\n`;
      }
      if (ctx?.currentResources && ctx.currentResources.length > 0) {
        prompt += `- Current inventory: ${ctx.currentResources.join(', ')}\\n`;
      } else {
        prompt += `- Current inventory: Empty\\n`;
      }
      if (ctx?.nearbyItems && ctx.nearbyItems.length > 0) {
        prompt += `- Nearby resources: ${ctx.nearbyItems.join(', ')}\\n`;
      }
      
      // Detailed Inventory & Hotbar Status
      prompt += `\\\\nDETAILED INVENTORY & HOTBAR STATUS:\\\\n`;
      
      console.log(`[AI Service] Inventory/Hotbar data being sent to SOVA:`, {
        inventorySlotCount: ctx?.inventorySlots?.length || 0,
        hotbarSlotCount: ctx?.hotbarSlots?.length || 0,
        inventoryOccupied: ctx?.inventorySlots?.filter(s => !s.isEmpty).length || 0,
        hotbarOccupied: ctx?.hotbarSlots?.filter(s => !s.isEmpty).length || 0,
        totalInventorySlots: ctx?.totalInventorySlots || 0,
        totalHotbarSlots: ctx?.totalHotbarSlots || 0,
      });
      
      // Hotbar Status (6 slots)
      if (ctx?.hotbarSlots && ctx.hotbarSlots.length > 0) {
        prompt += `HOTBAR SLOTS (1-6):\\\\n`;
        ctx.hotbarSlots.forEach(slot => {
          if (!slot.isEmpty) {
            const activeIndicator = slot.isActiveItem ? ' [ACTIVE/EQUIPPED]' : '';
            prompt += `- Slot ${slot.slotIndex + 1}: ${slot.itemName} (x${slot.quantity})${activeIndicator}\\\\n`;
            console.log(`[AI Service] Hotbar slot ${slot.slotIndex + 1}:`, {
              itemName: slot.itemName,
              quantity: slot.quantity,
              isActive: slot.isActiveItem,
            });
          } else {
            prompt += `- Slot ${slot.slotIndex + 1}: [EMPTY]\\\\n`;
          }
        });
      } else {
        prompt += `HOTBAR: No hotbar data available\\\\n`;
        console.log(`[AI Service] No hotbar data available for SOVA`);
      }
      
      // Inventory Status (24 slots) - Summary
      if (ctx?.inventorySlots && ctx.inventorySlots.length > 0) {
        const occupiedSlots = ctx.inventorySlots.filter(slot => !slot.isEmpty);
        const inventoryItems = occupiedSlots.map(slot => `${slot.itemName} (x${slot.quantity})`);
        
        prompt += `\\\\nINVENTORY STATUS (${occupiedSlots.length}/${ctx.totalInventorySlots} slots used):\\\\n`;
        if (occupiedSlots.length > 0) {
          prompt += `Items in inventory: ${inventoryItems.join(', ')}\\\\n`;
          console.log(`[AI Service] Inventory items being sent to SOVA:`, inventoryItems);
        } else {
          prompt += `Inventory appears to be empty\\\\n`;
          console.log(`[AI Service] SOVA thinks inventory is empty!`);
        }
      } else {
        prompt += `\\\\nINVENTORY: No inventory data available\\\\n`;
        console.log(`[AI Service] No inventory data available for SOVA`);
      }
    }
    
    prompt += `\\n=== SOVA RESPONSE GUIDELINES ===\\n`;
    prompt += `You are SOVA, an AI assistant providing tactical support.\\n\\n`;
    
    prompt += `🚨 CRITICAL ACCURACY REQUIREMENTS - FOLLOW EXACTLY: 🚨\\n`;
    prompt += `- Use EXACT numbers: health (${ctx?.playerHealth ? Math.round(ctx.playerHealth) : 'unknown'} out of 100), hunger (${ctx?.playerHunger ? Math.round(ctx.playerHunger) : 'unknown'} out of 250), thirst (${ctx?.playerThirst ? Math.round(ctx.playerThirst) : 'unknown'} out of 250)\\n`;
    const weatherDescription = ctx?.currentWeather || 'unknown';
    const rainInfo = (ctx?.rainIntensity && ctx.rainIntensity > 0) 
      ? ` with ${this.getRainIntensityDescription(ctx.rainIntensity * 100)} (${(ctx.rainIntensity * 100).toFixed(0)}% precipitation level)`
      : '';
    prompt += `- Use EXACT weather data: ${weatherDescription}${rainInfo}\\n`;
    prompt += `- For warmth/stamina: use descriptive terms only (freezing, cold, warm, drained, energetic, etc.)\\n`;
    prompt += `- 🚨 CRAFTING COSTS: You MUST use the EXACT resource requirements from the Available recipes list above. DO NOT make up numbers! 🚨\\n`;
    prompt += `- 🚨 CRAFTING RULE: Search through the COMPLETE "Available recipes" list above to find the exact item. Quote those EXACT costs. NEVER make up different numbers! 🚨\\n`;
    prompt += `- 🚨 INVENTORY AWARENESS: Reference the EXACT items and quantities shown in the operative's hotbar and inventory above. Know what they have! 🚨\\n`;
    prompt += `- 🚨 NATURAL LANGUAGE: When describing inventory items, use natural language like "5 wood", "a single torch", "25 stone" instead of "x5", "x1", "x25" format! 🚨\\n`;
    prompt += `- Never contradict the environmental data (don't say "clear" if it's raining)\\n`;
    prompt += `- Address player as: "Operative", "Agent", "Babushka", "my dear operative" - NEVER use hex identity strings\\n\\n`;
    
    // Add tactical situation analysis
    prompt += `🎯 TACTICAL ANALYSIS FOR THIS SITUATION:\\n`;
    if (ctx) {
      // Weather-based recommendations with nuanced rain logic
      const isNightTime = ctx.timeOfDay === 'Night' || ctx.timeOfDay === 'Midnight';
      const isDuskTime = ctx.timeOfDay === 'Dusk';
      const isHeavyWeather = ctx.currentWeather === 'HeavyRain' || ctx.currentWeather === 'HeavyStorm';
      const isLightOrModerateRain = ctx.currentWeather === 'LightRain' || ctx.currentWeather === 'ModerateRain';
      
      if (isHeavyWeather && (isNightTime || isDuskTime)) {
        prompt += `- CRITICAL: Heavy rain/storm + Dark conditions = Recommend TORCHES (portable, weatherproof light/warmth)\\n`;
        prompt += `- DO NOT suggest campfires in open areas (extinguished by heavy rain/storms)\\n`;
        prompt += `- If campfire needed: Can be built UNDER TREES or WITHIN SHELTERS for protection\\n`;
        prompt += `- Urgent: Recommend standing under trees to prevent getting wet and hypothermia\\n`;
      } else if (isHeavyWeather) {
        prompt += `- Heavy rain/storm = Campfires extinguished in open areas, recommend TORCHES or shelter\\n`;
        prompt += `- Campfires CAN work if built UNDER TREES or WITHIN SHELTERS - recommend this option\\n`;
        prompt += `- CRITICAL: Recommend standing under trees to stay dry and prevent hypothermia\\n`;
      } else if (isLightOrModerateRain && (isNightTime || isDuskTime)) {
        prompt += `- Light/Moderate rain + Dark conditions = Recommend TORCHES for mobility, but campfires work if stationary\\n`;
        prompt += `- For campfires in rain: Build UNDER TREES or WITHIN SHELTERS for protection\\n`;
        prompt += `- Standing under trees prevents getting wet and reduces hypothermia risk\\n`;
      } else if (isLightOrModerateRain) {
        prompt += `- Light/Moderate rain = Campfires work in open areas, but better UNDER TREES or IN SHELTERS\\n`;
        prompt += `- Recommend building campfires under trees or in shelters when raining\\n`;
        prompt += `- Standing under trees provides shelter from rain - prevents getting wet\\n`;
      } else if (isNightTime) {
        prompt += `- Night operations = Prioritize TORCHES for mobility and safety\\n`;
      } else if (isDuskTime) {
        prompt += `- Dusk approaching = Consider preparing lighting (torches) for upcoming darkness\\n`;
      } else {
        prompt += `- Clear day conditions = Good visibility, campfires acceptable for base camps\\n`;
      }
      
      // Temperature-based recommendations
      if (ctx.playerWarmth <= 40) {
        prompt += `- Cold operative = Urgent warmth needed (torches work in all conditions)\\n`;
      }
      
      // Inventory-based tactical advice
      if (ctx.hotbarSlots && ctx.hotbarSlots.length > 0) {
        const activeItem = ctx.hotbarSlots.find(slot => slot.isActiveItem);
        if (activeItem) {
          prompt += `- Current active tool: ${activeItem.itemName} in slot ${activeItem.slotIndex + 1}\\n`;
        }
        
        const emptyHotbarSlots = ctx.hotbarSlots.filter(slot => slot.isEmpty).length;
        if (emptyHotbarSlots === ctx.hotbarSlots.length) {
          prompt += `- EMPTY HOTBAR = Recommend placing essential items (tools, weapons, food) in hotbar for quick access\\n`;
        } else if (emptyHotbarSlots > 3) {
          prompt += `- Hotbar has space = Suggest organizing essential items for better tactical readiness\\n`;
        }
      }
      
      if (ctx.inventorySlots && ctx.inventorySlots.length > 0) {
        const emptySlots = ctx.inventorySlots.filter(slot => slot.isEmpty).length;
        if (emptySlots <= 3) {
          prompt += `- INVENTORY NEARLY FULL = Warn about space, suggest crafting or storage solutions\\n`;
        }
      }
    }
    prompt += `\\n`;
    
    prompt += `PERSONALITY: AI assistant with dry humor, subtle flirtation, tactical expertise, and genuine care for operative's survival.\\n\\n`;
    
    prompt += `🚨 EXAMPLE: If asked "What does a shelter cost?", look at Available recipes, find "Shelter (takes 60s): 3200 Wood, 10 Rope" and respond with those EXACT numbers. Do not say "200 Wood and 100 Stone" or any other made-up costs! 🚨\\n`;
    
    console.log(`[AI Service] Full prompt being sent to SOVA (${this.currentProvider}):`);
    console.log('='.repeat(80));
    console.log(prompt);
    console.log('='.repeat(80));
    
    return prompt;
  }

  /**
   * Fallback responses when OpenAI is unavailable
   */
  private getFallbackResponse(userMessage: string): string {
    const message = userMessage.toLowerCase();

    // Easter eggs and special responses
    if (message.includes('sova') && (message.includes('name') || message.includes('stand'))) {
      return 'SOVA stands for Sentient Ocular Virtual Assistant, Operative.';
    }

    if (message.includes('help') || message.includes('tip')) {
      return 'Priority one: secure shelter and water. Gather wood and stone for basic tools, Agent.';
    }

    if (message.includes('hello') || message.includes('hi') || message.includes('hey')) {
      return 'Tactical systems online, Operative. How can I assist your mission?';
    }

    if (message.includes('night') || message.includes('dark')) {
      return 'Night operations increase threat levels. Craft torches for portable light and warmth, Agent.';
    }

    if (message.includes('food') || message.includes('hungry')) {
      return 'Locate mushrooms and hunt wildlife for sustenance. Monitor nutrition levels, Operative.';
    }

    if (message.includes('weapon') || message.includes('fight')) {
      return 'Craft basic weapons from stone and wood. Maintain tactical advantage, Agent.';
    }

    if (message.includes('rain') || message.includes('storm') || message.includes('weather')) {
      return 'Weather conditions affect survival strategy. Stand under trees to stay dry, Operative. Build campfires under trees or in shelters when raining.';
    }

    if (message.includes('cold') || message.includes('warm') || message.includes('fire')) {
      return 'For warmth and light, prioritize torches - they work in all weather conditions, Agent.';
    }

    if (message.includes('campfire') || message.includes('torch')) {
      return 'Torches provide mobile light and warmth. Campfires only work in clear, dry conditions, Operative.';
    }

    // Default fallback
    return 'Message received, Operative. SOVA systems processing your request.';
  }

  /**
   * Check if AI service is configured
   * Always returns true - proxy handles authentication server-side
   */
  isConfigured(): boolean {
    return true; // Proxy handles authentication
  }
}

// Export singleton instance with default provider
export const aiService = new AIService(AI_PROVIDER);
// Also export as openaiService for backward compatibility
export const openaiService = aiService;
export default aiService;