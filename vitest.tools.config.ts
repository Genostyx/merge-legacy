import { defineConfig } from 'vitest/config';

/** Runs the dev utilities under `tools/debug/`, which the main suite excludes. */
export default defineConfig({
  test: {
    include: ['tools/**/*.{test,spec}.ts']
  }
});
