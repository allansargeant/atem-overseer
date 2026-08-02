import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import { readFileSync } from 'node:fs';

// The ROOT package.json, not this workspace's: the release tag follows the root
// version, and packages/web/package.json has been left behind by past releases
// (it said 0.2.0 at the v0.2.2 tag). Reading the wrong one puts a wrong version
// in the About dialog, which is the one place it must not be wrong.
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

export default defineConfig({
  // The About dialog shows the version the build actually produced. about-data.js
  // carries one baked at sync time as a fallback, and it goes stale the moment a
  // release is tagged; this is the one that is always right.
  define: { __APP_VERSION__: JSON.stringify(`v${pkg.version}`) },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4700',
      '/ws': { target: 'ws://localhost:4700', ws: true },
    },
  },
});
