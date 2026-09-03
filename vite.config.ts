import { defineConfig, type Plugin } from 'vite';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Directories under `public/` that stay in the repo but never ship.
 *
 * Vite copies `public/` wholesale, so 29MB of dispenser art that nothing in
 * the game references yet was being uploaded on every deploy. Players never
 * downloaded it - a file is only fetched when something asks for it - but it
 * made each deploy slower for no gain. Delete an entry here the moment its art
 * gets wired up, or the game will 404 looking for it.
 */
const UNSHIPPED_DIRS = ['assets/dispensers'];

function dropUnshippedAssets(): Plugin {
  return {
    name: 'drop-unshipped-assets',
    apply: 'build',
    // After the bundle is written, so this prunes the OUTPUT and never the
    // source directory.
    async closeBundle() {
      for (const dir of UNSHIPPED_DIRS) {
        await rm(fileURLToPath(new URL(`dist/${dir}`, import.meta.url)), {
          recursive: true,
          force: true
        });
      }
    }
  };
}

export default defineConfig({
  // Relative, so the build works from a subpath - GitHub Pages serves this
  // from /merge-legacy/, where absolute asset URLs would 404 at the domain
  // root.
  base: './',
  plugins: [dropUnshippedAssets()],
  server: {
    port: 5173,
    host: '::'
  },
  build: {
    outDir: 'dist',
    target: 'es2020'
  }
});
