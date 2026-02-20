#!/usr/bin/env node
/**
 * Convert animal sprite sheets using nearest-neighbor scaling (no smoothing).
 * - 4×4 wildlife: 320×320 → 256×256 (64×64 frames)
 * - 6×4 hostile NPCs: scale by 0.8
 *
 * Run: node scripts/convert-animal-sprites-nn.js
 * Requires: npm install sharp (devDependency)
 */

import sharp from 'sharp';
import { readdir } from 'fs/promises';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'client', 'src', 'assets');

// filename → { sourceW, sourceH, targetW, targetH }
const CONVERSION_MAP = {
  // 4×4 wildlife (320×320 → 256×256)
  'walrus_walking_release.png': { sourceW: 320, sourceH: 320, targetW: 256, targetH: 256 },
  'fox_walking_release.png': { sourceW: 320, sourceH: 320, targetW: 256, targetH: 256 },
  'tundra_wolf_walking_release.png': { sourceW: 320, sourceH: 320, targetW: 256, targetH: 256 },
  'tern_walking_release.png': { sourceW: 320, sourceH: 320, targetW: 256, targetH: 256 },
  'crow_walking_release.png': { sourceW: 320, sourceH: 320, targetW: 256, targetH: 256 },
  'wolverine_walking_release.png': { sourceW: 320, sourceH: 320, targetW: 256, targetH: 256 },
  'caribou_walking_release.png': { sourceW: 320, sourceH: 320, targetW: 256, targetH: 256 },
  'salmon_shark_walking_release.png': { sourceW: 320, sourceH: 320, targetW: 256, targetH: 256 },
  'jellyfish_walking_release.png': { sourceW: 320, sourceH: 320, targetW: 256, targetH: 256 },
  'crab_release_walking.png': { sourceW: 320, sourceH: 320, targetW: 256, targetH: 256 },
  'vole_walking_release.png': { sourceW: 320, sourceH: 320, targetW: 256, targetH: 256 },
  'polar_bear_walking_release.png': { sourceW: 320, sourceH: 320, targetW: 256, targetH: 256 },
  'hare_walking_release.png': { sourceW: 320, sourceH: 320, targetW: 256, targetH: 256 },
  'owl_walking_release.png': { sourceW: 320, sourceH: 320, targetW: 256, targetH: 256 },
  'owl_flying_release.png': { sourceW: 320, sourceH: 320, targetW: 256, targetH: 256 },
  'tern_flying_release.png': { sourceW: 320, sourceH: 320, targetW: 256, targetH: 256 },
  'crow_flying_release.png': { sourceW: 320, sourceH: 320, targetW: 256, targetH: 256 },
  'cable_viper_walking_release.png': { sourceW: 320, sourceH: 320, targetW: 256, targetH: 256 },
  // 6×4 hostile NPCs (scale 0.8, clean frame sizes)
  'shardkin_walking_release.png': { sourceW: 288, sourceH: 192, targetW: 228, targetH: 152 },
  'shorebound_walking_release.png': { sourceW: 384, sourceH: 256, targetW: 306, targetH: 204 },
  'drowned_watch_walking_release.png': { sourceW: 576, sourceH: 384, targetW: 462, targetH: 308 },
};

async function findPngs(dir, files = []) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        await findPngs(p, files);
      } else if (e.name.endsWith('.png') && CONVERSION_MAP[e.name]) {
        files.push(p);
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return files;
}

async function convertImage(inputPath, filename) {
  const cfg = CONVERSION_MAP[filename];
  if (!cfg) return false;

  const meta = await sharp(inputPath).metadata();
  if (meta.width !== cfg.sourceW || meta.height !== cfg.sourceH) {
    return false;
  }

  const tempPath = inputPath + '.tmp';
  await sharp(inputPath)
    .resize(cfg.targetW, cfg.targetH, { kernel: 'nearest' })
    .toFile(tempPath);

  const { rename } = await import('fs/promises');
  await rename(tempPath, inputPath);
  return true;
}

async function main() {
  console.log('Converting animal sprite sheets (nearest-neighbor)...\n');

  const allPngs = await findPngs(ASSETS_DIR);
  let converted = 0;
  let skipped = 0;

  for (const filepath of allPngs) {
    const filename = filepath.split(/[/\\]/).pop();
    try {
      const ok = await convertImage(filepath, filename);
      if (ok) {
        console.log(`  ✓ ${relative(ASSETS_DIR, filepath)}`);
        converted++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`  ✗ ${relative(ASSETS_DIR, filepath)}:`, err.message);
      skipped++;
    }
  }

  console.log(`\nDone. Converted: ${converted}, Skipped/unchanged: ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
