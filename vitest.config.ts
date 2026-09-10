import { defineConfig } from 'vitest/config';

/**
 * The suite is `src/` only.
 *
 * `tools/debug/` holds dev utilities shaped as spec files so they can be run
 * through vitest without a second toolchain - the icon contact sheet is one.
 * They WRITE FILES, so letting `npm run check` pick them up would mean every
 * check regenerating artefacts as a side effect. Run them by name instead:
 *
 *   npx vitest run tools/debug/icon-sheet.spec.ts --config vitest.tools.config.ts
 */
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.ts']
  }
});
