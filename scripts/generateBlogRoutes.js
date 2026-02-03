/**
 * Generate blog routes for pre-rendering
 * Run this script after adding new blog posts:
 *   node scripts/generateBlogRoutes.js
 * 
 * This regenerates prerender-routes.json which is used during production builds
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Static routes (non-blog pages)
const staticRoutes = [
  '/',
  '/blog',
  '/privacy',
  '/terms',
  '/cookies',
  '/ai-disclosure',
];

// Extract slugs by reading blog post files directly
function extractSlugsFromPostFiles() {
  const postsDir = path.join(__dirname, '..', 'client', 'src', 'blog', 'data', 'posts');
  const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.js') && f !== 'template.js');
  
  const slugs = [];
  
  for (const file of files) {
    const filePath = path.join(postsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Extract slug from the file content using regex
    const slugMatch = content.match(/slug:\s*["']([^"']+)["']/);
    if (slugMatch) {
      slugs.push(slugMatch[1]);
    } else {
      console.warn(`Warning: Could not extract slug from ${file}`);
    }
  }
  
  return slugs;
}

function generateRoutes() {
  try {
    // Get all blog post slugs
    const blogSlugs = extractSlugsFromPostFiles();

    // Generate blog post routes
    const blogRoutes = blogSlugs.map(slug => `/blog/${slug}`);

    // Combine all routes
    const allRoutes = [...staticRoutes, ...blogRoutes];

    // Write to prerender-routes.json
    const outputPath = path.join(__dirname, '..', 'prerender-routes.json');
    const output = {
      routes: allRoutes,
      generatedAt: new Date().toISOString(),
      totalRoutes: allRoutes.length,
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    console.log('✅ Generated prerender-routes.json');
    console.log(`   Static pages: ${staticRoutes.length}`);
    console.log(`   Blog posts: ${blogRoutes.length}`);
    console.log(`   Total routes: ${allRoutes.length}`);
    console.log(`\n   Output: ${outputPath}`);

  } catch (error) {
    console.error('Error generating routes:', error);
    process.exit(1);
  }
}

generateRoutes();
