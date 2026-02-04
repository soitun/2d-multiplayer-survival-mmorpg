import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import Prerender from '@prerenderer/rollup-plugin'
import PuppeteerRenderer from '@prerenderer/renderer-puppeteer'
import prerenderRoutes from './prerender-routes.json'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Base plugins for all modes
  const plugins: any[] = [react()];
  
  // Only add prerenderer during production build
  if (command === 'build' && mode === 'production') {
    plugins.push(
      // Pre-render blog pages and static pages for SEO/LLEO
      Prerender({
        routes: prerenderRoutes.routes,
        renderer: new PuppeteerRenderer({
          // Wait for network to be idle before capturing
          renderAfterDocumentEvent: 'DOMContentLoaded',
          // Wait for React to render
          renderAfterTime: 2000,
          // Puppeteer launch options
          headless: true,
        }),
        // Post-process the rendered HTML
        postProcess(renderedRoute) {
          // Add prerendered indicator for debugging
          renderedRoute.html = renderedRoute.html.replace(
            '</head>',
            '<meta name="prerendered" content="true"></head>'
          );
        },
      })
    );
  }

  return {
    plugins,
    resolve: {
      alias: {
        // No alias needed - using spacetimedb package directly
      },
    },
    server: {
      port: 3008,
    },
    root: '.',
    publicDir: 'public',
    build: {
      outDir: 'dist',
      rollupOptions: {
        output: {
          assetFileNames: '[name]-[hash][extname]',
        }
      },
      // Enable asset inlining for small images (4KB threshold)
      assetsInlineLimit: 4096,
      // Improve build performance
      target: 'esnext',
      minify: 'esbuild',
    },
    // Optimize dependencies for faster loading
    optimizeDeps: {
      include: [
        '@fortawesome/fontawesome-svg-core', 
        '@fortawesome/react-fontawesome',
        '@fortawesome/free-brands-svg-icons'
      ]
    },
    // Enable experimental features for better performance
    esbuild: {
      // Remove console logs in production for better performance
      // This strips ALL console.* calls and debugger statements from production builds
      drop: mode === 'production' ? ['console', 'debugger'] : [],
    }
  };
})
