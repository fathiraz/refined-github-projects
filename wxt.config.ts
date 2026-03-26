import path from 'path'
import { defineConfig } from 'wxt'

export default defineConfig({
  // source code lives in src/, entries in src/entries/, output goes to dist/
  srcDir: 'src',
  modulesDir: 'wxt-modules',
  outDir: 'dist',
  publicDir: 'static',
  entrypointsDir: 'entries',
  modules: ['@wxt-dev/module-react'],
  webExt: {
    startUrls: ['https://github.com/orgs/kitabisa/projects/58/views/8'],
  },
  vite: () => ({
    server: {
      strictPort: true,
      port: 3000,
    },
    build: {
      chunkSizeWarningLimit: 900,
    },
    resolve: {
      alias: {
        // Stub out @primer/live-region-element to prevent customElements error in content scripts
        // Content scripts run in isolated world where customElements is null
        '@primer/live-region-element': path.resolve(__dirname, 'src/lib/primer-live-region-stub.ts'),
      },
    },
  }),
  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      if (manifest.web_accessible_resources) {
        // Step 1: Clean each entry - remove use_dynamic_url from CSS files, dedupe matches
        const cleaned = manifest.web_accessible_resources.map((resource: any) => {
          const cleanedResource = { ...resource }
          
          // Remove use_dynamic_url for CSS files (only needed for JS)
          const isCssOnly = resource.resources.every((r: string) => r.endsWith('.css'))
          if (isCssOnly && cleanedResource.use_dynamic_url) {
            delete cleanedResource.use_dynamic_url
          }
          
          // Deduplicate matches array
          if (cleanedResource.matches && Array.isArray(cleanedResource.matches)) {
            cleanedResource.matches = [...new Set(cleanedResource.matches)]
          }
          
          return cleanedResource
        })

        // Step 2: Merge entries by resources - group by resources array
        const byResources = new Map<string, any>()
        for (const resource of cleaned) {
          const key = JSON.stringify(resource.resources.slice().sort())
          if (byResources.has(key)) {
            // Merge matches arrays
            const existing = byResources.get(key)
            const allMatches = [...existing.matches, ...resource.matches]
            existing.matches = [...new Set(allMatches)]
          } else {
            byResources.set(key, { ...resource })
          }
        }

        manifest.web_accessible_resources = Array.from(byResources.values())
      }
    }
  },
  manifest: ({ browser }) => ({
    name: 'Refined GitHub Projects',
    description: 'GitHub Projects, but the way it should work. Bulk edit, close, delete, and deep duplicate items — all from the table.',
    permissions: ['storage'],
    host_permissions: [
      'https://api.github.com/*',
      'https://github.com/*',
    ],
    web_accessible_resources: [
      {
        resources: ['content-scripts/content.css'],
        matches: ['https://github.com/*'],
      },
    ],
    action: {
      default_popup: 'popup.html',
      default_icon: {
        '16': 'icon/16.png',
        '32': 'icon/32.png',
        '48': 'icon/48.png',
        '96': 'icon/96.png',
        '128': 'icon/128.png',
      },
    },
    icons: {
      '16': 'icon/16.png',
      '32': 'icon/32.png',
      '48': 'icon/48.png',
      '96': 'icon/96.png',
      '128': 'icon/128.png',
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'refined-github-projects@example.com',
              data_collection_permissions: {
                required: ['none'],
              },
            },
          },
        }
      : {}),
  }),
})
