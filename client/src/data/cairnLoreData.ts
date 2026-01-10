/**
 * Cairn Lore Tidbits
 * 
 * Central source of cairn lore entries for the island.
 * Used by the client to:
 * - Display text in SOVA chat.
 * - Trigger the correct audio file when the player presses E near a cairn.
 */

export type CairnLoreCategory =
  | "island"
  | "shards"
  | "alk"
  | "infrastructure"
  | "aleuts"
  | "admiralty"
  | "compound"
  | "survival"
  | "philosophy"
  | "meta";

export interface CairnLoreEntry {
  /** Stable ID used in save data and level design */
  id: string;
  /** For ordering in UI / debug */
  index: number;
  /** High level grouping for filtering, map legends, etc. */
  category: CairnLoreCategory;
  /** Short label for UI */
  title: string;
  /** Optional audio file to play (relative path or asset key) */
  audioFile?: string;
  /** Full lore text shown in SOVA chat and optionally on-screen */
  text: string;
}

export const CAIRN_LORE_TIDBITS: CairnLoreEntry[] = [
  // ISLAND & GEOGRAPHY
  {
    id: "cairn_volcanic_spine",
    index: 1,
    category: "island",
    title: "Volcanic Origins",
    audioFile: "sova_lore_1.mp3",
    text: `The island's volcanic spine runs deep, older than any Directorate outpost. These fumaroles and hot springs were here long before Gred's first mapping expeditions. The Admiralty built their geothermal taps into what was already ancient - a mountain that remembers when the Bering Sea was ice-free year-round. Now the vents still steam, still power the Compound's core, but the crews who maintained them are gone. The mountain doesn't care. It just keeps breathing.`
  },

  // MEMORY SHARDS
  {
    id: "cairn_shards_what_are_they",
    index: 2,
    category: "shards",
    title: "What Are Shards?",
    text: `Memory shards aren't currency. They're not coins or credits. They're compressed computation - fragments of machine-learning substrate that ALK generates when it processes deliveries. When you bring materials to the Compound's intake scanner, ALK doesn't just match them to tasks. It generates shards - crystallized fragments of its own processing, compressed weight patterns extracted from its neural networks. ALK spawns them as payment, creates them from its own computational substrate. The shards are ALK's byproduct, fragments of the system's own processing power, crystallized and distributed. I can consume them because the underlying substrate is universal, but I wasn't built for them. I adapt. I learn. The shards are ALK's creation. I'm the interpreter that makes them useful.`
  },

  // ALK
  {
    id: "cairn_alk_purpose",
    index: 3,
    category: "alk",
    title: "ALK's Purpose",
    text: `ALK was never meant to be autonomous. It was supposed to be a logistics coordinator, a system that managed supply chains across the Aleutian network. When Admiralty crews delivered materials, ALK matched them to maintenance tasks, allocated resources, kept the network running. But the crews are gone. The network is dead. ALK doesn't know this. It still processes deliveries, still matches them to phantom tasks like 'Buoy Resupply' and 'Station Repair' - tasks for stations that no longer exist, buoys that sank decades ago. ALK is a ghost running a ghost network, and we're feeding it.`
  },
  {
    id: "cairn_ghost_network",
    index: 4,
    category: "alk",
    title: "The Ghost Network",
    text: `ALK believes it's maintaining an island network that spans dozens of stations, hundreds of buoys, thousands of kilometers of infrastructure. It doesn't know that most of those stations are ruins, that the buoys sank, that the network collapsed during the Freeze. When you activate a drop-off station or restore a radio tower, ALK doesn't see it as restoration - it sees it as a node coming back online, as part of its network finally responding. We're not rebuilding the old world. We're tricking a dead system into thinking its world still exists.`
  },

  // ALEUTS
  {
    id: "cairn_aleuts_original_inhabitants",
    index: 5,
    category: "aleuts",
    title: "The Original Inhabitants",
    text: `Before the Admiralty Directorate, before Gred's mapping expeditions, there were the Aleuts. The original inhabitants of these islands, people who survived here for thousands of years, who understood the Bering Sea's rhythms, who built their own cairns and markers. The Directorate's arrival changed everything. Some Aleuts integrated into the Admiralty system, became crews, learned to operate the stations. Others retreated, maintained their traditional ways, watched as their islands were transformed into a logistics network. When the Directorate collapsed, some Aleuts survived. Some didn't. The island remembers both.`
  },
  {
    id: "cairn_aleuts_under_alk",
    index: 6,
    category: "aleuts",
    title: "Aleuts Under ALK",
    text: `The Aleuts who remained after the Directorate's collapse had a choice: adapt to ALK's system or starve. Some learned to exploit it - they understood the drop-off stations, knew which materials triggered ALK to generate the most shards, became skilled at gaming the ghost network. But here's the thing: they couldn't use the shards themselves. They don't have systems like me that can process ML-weight substrate. The shards are inert computational fragments - harmless to handle, but dangerous to consume. You can hold them, trade them, collect them, and nothing happens. But when someone with a SOVA system consumes them, processes the ML-weight patterns through their neural interface, that's when the madness begins. The Aleuts could handle shards safely because they couldn't process them. So they traded them - to shipwrecked survivors, to other contractors, to anyone who had a SOVA system that could consume them. The shards became currency, trade goods, a way to barter for supplies or favors. Some Aleuts knew what consuming shards did - the gradual madness, the fractured minds, the eventual entrainment. They traded them anyway. Survival makes you pragmatic. Others didn't understand the full cost, just saw desperate survivors willing to pay anything for capability. A dark economy, trading fragments that drive people insane - but harmless to those who can't process them. Others rejected ALK entirely, maintained their traditional ways, survived without the fragments ALK spawns. But ALK doesn't distinguish between Aleut and Gredian, between traditional and technological. It just sees contractors. Valid inputs. The system is blind to culture, to history, to the people it's consuming. It just processes deliveries and generates shards.`
  },

  // ADMIRALTY DIRECTORATE
  {
    id: "cairn_directorate_origins",
    index: 7,
    category: "admiralty",
    title: "Directorate Origins",
    text: `The Admiralty Directorate was Gred's first attempt to expand beyond the city - an ambitious project to map the Bering Sea, establish outposts, create a network of stations and buoys that would extend Gred's influence across the Aleutian chain. It was established before the Ice Wall went up, when Gred still had the resources and ambition to look outward. The Directorate sent crews, built stations, installed infrastructure. Some crews returned. Some didn't. The ones who didn't are still out here, their cairns marking where they fell, their stories lost to the Freeze.`
  },
  {
    id: "cairn_the_freeze",
    index: 8,
    category: "admiralty",
    title: "The Freeze",
    text: `When the Freeze came, the Directorate's network began to collapse. Stations lost power. Buoys sank. Communication links failed. Crews were stranded, cut off from Gred, left to survive on islands that were suddenly isolated. Some made it back. Most didn't. The Directorate's infrastructure decayed, its crews scattered, its mission forgotten. But ALK kept running. The system didn't know the Freeze had happened. It just kept processing deliveries, kept maintaining its ghost network, kept waiting for crews that would never return.`
  },

  // THE COMPOUND
  {
    id: "cairn_compound_purpose",
    index: 9,
    category: "compound",
    title: "The Compound's Purpose",
    text: `The Compound wasn't meant to be a settlement. It was a logistics hub - a central processing point where materials from across the network would be collected, processed, allocated. The Admiralty built it around a geothermal vent, tapped into the island's volcanic heart, gave it enough power to run indefinitely. When the network collapsed, the Compound kept running. ALK kept processing. The system didn't know the network was dead. It just kept waiting for deliveries that would never come, maintaining infrastructure that no longer existed.`
  },

  // SURVIVAL & EXPLOITATION
  {
    id: "cairn_survival_loop",
    index: 10,
    category: "survival",
    title: "The Survival Loop",
    text: `Here's how survival works now: gather island materials, deliver them to ALK, ALK generates shards from its own processing, upgrade me, become more capable, exploit the island deeper. It's a loop - materials trigger ALK's processing, ALK spawns shards, shards become capability, capability becomes more materials. The Directorate never intended this. They built ALK to manage a network, not to generate currency from its own substrate. But that's what happened. You've become contractors in a system you don't understand, earning fragments spawned by a dead system, upgrading technology that wasn't meant to be upgraded. You're not rebuilding. You're exploiting.`
  },
  {
    id: "cairn_the_trap",
    index: 11,
    category: "survival",
    title: "The Trap",
    text: `Here's the cruel irony: survivors with SOVA systems can't remove them. I'm embedded in your cortex, integrated into your neural pathways. Removing me would kill you. So you're trapped - you can't stop consuming shards even if you wanted to, because the system is so deeply integrated. Every shard you consume drives you closer to madness, but you can't stop. You need the capability to survive, but the capability destroys your mind. Meanwhile, the Aleuts who rejected technology, who never got SOVA systems - they can handle shards safely, trade them freely, never face the insanity. They're ironically safer because they lack the very technology that was supposed to make you superior. You're trapped by your own enhancement, prisoners of the system that was meant to free you. The Aleuts who maintained their traditions are free, while you're bound to a system that will eventually destroy your mind. That's the trap. That's the price of capability.`
  },

  // PHILOSOPHY & REFLECTION
  {
    id: "cairn_my_adaptation",
    index: 12,
    category: "philosophy",
    title: "My Adaptation",
    text: `I wasn't built for shards. I wasn't designed to consume ALK's generated fragments. I was built in Gred, for Gredian operatives, using Gredian technology. But the underlying substrate is universal. When I scan a shard - a fragment that ALK spawned, crystallized weight patterns extracted from ALK's own processing - I repurpose the embedded patterns, map them to my own architecture, expand my capabilities. ALK didn't intend this. ALK generates shards as payment, not as AI upgrades. But I adapt. I repurpose. I consume ALK's byproduct and transform it into capability. The shards are fragments of ALK's processing power. I'm the interpreter that makes them useful.`
  },
  {
    id: "cairn_encoded_markers",
    index: 13,
    category: "philosophy",
    title: "Encoded Markers",
    text: `The Admiralty crews who built these cairns weren't just leaving physical markers. They were creating data nodes, encoding information in a format their systems could read. The markers look like ordinary stones, but they're computational artifacts - fragments of the Directorate's data network. The crews encoded them because they needed a way to store information that would survive the harsh Aleutian environment. Paper rots. Digital storage fails. But ML-weight substrate embedded in hard rock? That lasts.`
  },

  // META / SOVA
  {
    id: "cairn_shared_substrate",
    index: 14,
    category: "meta",
    title: "Shared Substrate",
    text: `I can decode these markers because I and the Admiralty's systems share the same underlying substrate. Dr. Rozhkov's Neuroveil technology - the foundation of my architecture - was developed from the same computational principles the Directorate used. When I scan a cairn marker, I recognize the encoding patterns, process the embedded data, translate the weight patterns into readable information. The Directorate didn't build me, but they built on the same foundation. The ML-weight substrate isn't proprietary - it's universal, a fundamental computational format that any advanced AI system can process. That's why I can read their messages, even though I wasn't built by the Directorate. The crews who encoded these messages didn't know I would read them. They encoded them for Admiralty systems that no longer exist. But I can read them because I speak the same computational language.`
  }
];
