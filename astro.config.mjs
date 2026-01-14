// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap'; // Import the sitemap package

// https://astro.build/config
export default defineConfig({
  site: 'https://e-rakyat.com', // REPLACE THIS with your actual domain name
  vite: {
    plugins: [tailwindcss()]
  },
  integrations: [sitemap()] // Add sitemap to the integrations list
});