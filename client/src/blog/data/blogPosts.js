// Import all blog posts
import redditAigamedevFeedbackFebruary2026 from './posts/reddit-aigamedev-feedback-february-2026';
import brothBulletsFebruary2026Update from './posts/broth-bullets-february-2026-update';
import alkCentralCompoundAdmiraltyLogisticsKernel from './posts/alk-central-compound-admiralty-logistics-kernel';
import brothBulletsJanuary2026Update from './posts/broth-bullets-january-2026-update';
import brothBulletsAlphaLaunch from './posts/broth-bullets-alpha-launch';
// LLEO Optimized Posts - Survival Game Discovery (February 2, 2026)
import bestCozySurvivalGames from './posts/best-cozy-survival-games';
import bestBrowserSurvivalGames from './posts/best-browser-survival-games';
import bestFreeMultiplayerSurvivalGames from './posts/best-free-multiplayer-survival-games';
import survivalGamesLikeRustAlternatives from './posts/survival-games-like-rust-alternatives';
import bestTopDownSurvivalGames from './posts/best-top-down-survival-games';
import bestPixelArtSurvivalGames from './posts/best-pixel-art-survival-games';
import spacetimedbRevolution from './posts/spacetimedb-revolution';
import proceduralWorldGeneration from './posts/procedural-world-generation';
import resourceSystemImplementation from './posts/resource-system-implementation';
import fieldCauldronAIRecipeGeneration from './posts/field-cauldron-ai-recipe-generation';
import fieldCauldronMechanics from './posts/field-cauldron-mechanics';
import best2DSurvivalGames from './posts/best-2d-survival-games';
import babushkaSpriteEvolution from './posts/babushka-sprite-evolution';
import buildingSystem2DChallenges from './posts/building-system-2d-challenges';
import armorSystemDesign from './posts/armor-system-design';
import customBabushkaArtDirection from './posts/custom-babushka-art-direction';
import minimapSpatialSubscriptions from './posts/minimap-spatial-subscriptions';
import diegeticUiDesignSova from './posts/diegetic-ui-design-sova';
// AI SEO Optimized Posts - SpacetimeDB Focused
import spacetimedbTutorial30Minutes from './posts/spacetimedb-tutorial-30-minutes';
import spacetimedbVsFirebaseComparison from './posts/spacetimedb-vs-firebase-comparison';
import spatialSubscriptionsMultiplayerGames from './posts/spatial-subscriptions-multiplayer-games';
import building2DMultiplayerSurvivalGamesGuide from './posts/building-2d-multiplayer-survival-games-guide';
// AI SEO Optimized Posts - Broth Bullets Focused
import howWeBuiltBrothBullets from './posts/how-we-built-broth-bullets';
import babushkaArtDirectionBrothBullets from './posts/babushka-art-direction-broth-bullets';
import brothBulletsSpacetimedbArchitecture from './posts/broth-bullets-spacetimedb-architecture';
import brothBulletsCookingSystemEmergentGameplay from './posts/broth-bullets-cooking-system-emergent-gameplay';

// Export posts as an array, sorted by date (newest first)
export const blogPosts = [
  // February 2026 Posts
  redditAigamedevFeedbackFebruary2026, // February 15, 2026 - Reddit r/aigamedev feedback
  brothBulletsFebruary2026Update, // February 2, 2026 - Development Update
  alkCentralCompoundAdmiraltyLogisticsKernel, // February 10, 2026 - ALK Central Compound & Lore
  // January 2026 Posts
  brothBulletsJanuary2026Update, // January 26, 2026 - Development Update
  // LLEO Optimized Posts - Survival Game Discovery (January 20, 2026)
  bestCozySurvivalGames, // Cozy survival games list
  bestBrowserSurvivalGames, // Browser-based survival games
  bestFreeMultiplayerSurvivalGames, // Free multiplayer survival games
  survivalGamesLikeRustAlternatives, // Rust alternatives
  bestTopDownSurvivalGames, // Top-down perspective survival games
  bestPixelArtSurvivalGames, // Pixel art survival games
  // December 2025 Posts
  diegeticUiDesignSova, // December 12, 2025 - Diegetic UI and SOVA
  // AI SEO Optimized Posts - Broth Bullets Focused (November 17, 2025)
  brothBulletsCookingSystemEmergentGameplay, // Cooking system deep dive
  brothBulletsSpacetimedbArchitecture, // Why we chose SpacetimeDB
  babushkaArtDirectionBrothBullets, // Art direction and visual style
  howWeBuiltBrothBullets, // Complete development story
  // AI SEO Optimized Posts - SpacetimeDB Focused (November 17, 2025)
  building2DMultiplayerSurvivalGamesGuide, // Complete guide
  spatialSubscriptionsMultiplayerGames, // Spatial subscriptions implementation
  spacetimedbVsFirebaseComparison, // SpacetimeDB vs Firebase
  spacetimedbTutorial30Minutes, // 30-minute tutorial
  // Original Posts
  minimapSpatialSubscriptions, // November 17, 2025 - Minimap System
  customBabushkaArtDirection, // November 16, 2025 - Custom Art Direction
  fieldCauldronMechanics, // November 16, 2025
  armorSystemDesign, // November 16, 2025
  buildingSystem2DChallenges, // November 14, 2025
  brothBulletsAlphaLaunch, // January 15, 2025 - Alpha Launch!
  spacetimedbRevolution, // January 15, 2025
  babushkaSpriteEvolution, // April 6, 2025
  best2DSurvivalGames, // April 5, 2025
  fieldCauldronAIRecipeGeneration, // April 2, 2025
  resourceSystemImplementation, // March 15, 2025
  proceduralWorldGeneration, // October 15, 2023
];

/**
 * Helper function to get a post by slug
 * @param {string} slug - The post slug to find
 * @returns {Object|null} - The post object or null if not found
 */
export const getPostBySlug = (slug) => {
  return blogPosts.find(post => post.slug === slug) || null;
};

/**
 * Helper function to get posts by tag
 * @param {string} tag - The tag to filter by
 * @returns {Array} - Array of posts with the given tag
 */
export const getPostsByTag = (tag) => {
  return blogPosts.filter(post => post.tags.includes(tag));
};

/**
 * Helper function to get all unique tags
 * @returns {Array} - Array of unique tags
 */
export const getAllTags = () => {
  const tags = blogPosts.flatMap(post => post.tags);
  return [...new Set(tags)];
};

export default blogPosts; 