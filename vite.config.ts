import { defineConfig, type Plugin } from 'vite';
import { rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Identifies this build to the running game.
 *
 * GitHub Pages serves index.html with a ten-minute cache and offers no way to
 * change that, so a player's browser keeps loading the previous bundle long
 * after a deploy. The game polls the file this id is written into and reloads
 * itself when the two disagree - see `watchForNewBuild` in main.ts.
 */
const BUILD_ID = new Date().toISOString();

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

/**
 * Writes the build id where the running game can read it.
 *
 * A plain JSON file rather than anything cleverer: it has to be fetchable
 * without touching the cached index.html, which is the very thing that goes
 * stale.
 */
function emitBuildVersion(): Plugin {
  return {
    name: 'emit-build-version',
    apply: 'build',
    async closeBundle() {
      await writeFile(
        fileURLToPath(new URL('dist/version.json', import.meta.url)),
        JSON.stringify({ build: BUILD_ID })
      );
    }
  };
}

export default defineConfig({
  // Relative, so the build works from a subpath - GitHub Pages serves this
  // from /merge-legacy/, where absolute asset URLs would 404 at the domain
  // root.
  base: './',
  plugins: [dropUnshippedAssets(), emitBuildVersion()],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID)
  },
  server: {
    port: 5173,
    host: '::'
  },
  build: {
    outDir: 'dist',
    target: 'es2020'
  }
});
