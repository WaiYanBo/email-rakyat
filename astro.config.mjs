// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap'; // Import the sitemap package

import react from '@astrojs/react';

// https://astro.build/config
// astro.config.mjs
export default defineConfig({
  site: 'https://e-rakyat.com',
  vite: {
    plugins: [
      tailwindcss({
        config: './tailwind.config.mjs', // Tell Astro to use YOUR config
      })
    ],
    optimizeDeps: {
      exclude: ['@supabase/supabase-js']
    }
  },
  integrations: [sitemap(), react()]
});