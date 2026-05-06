import type { ForgeConfig } from '@electron-forge/shared-types';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: './assets/icon',
    // Uncomment and configure for code signing:
    // osxSign: {},
    // osxNotarize: { tool: 'notarytool', appleId: '...', ... },
  },
  rebuildConfig: {},
  makers: [
    new MakerZIP({}, ['darwin']),
    new MakerDMG({ format: 'ULFO' }),
  ],
  plugins: [
    // Ensures native modules like better-sqlite3 are unpacked from asar
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // Main process and preload builds
      build: [
        {
          entry: 'electron/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'electron/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      // Two separate renderer processes — Admin Dashboard and Big Screen Clock
      renderer: [
        {
          name: 'admin_window',
          config: 'vite.admin.config.ts',
        },
        {
          name: 'clock_window',
          config: 'vite.clock.config.ts',
        },
      ],
    }),
  ],
};

export default config;
