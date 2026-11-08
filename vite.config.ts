import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { validateCity } from './src/data/validate';
import { renderListHtml } from './src/data/staticList';
import type { CityData } from './src/types';

/**
 * Validates content/city.json at build time and pre-renders the project list
 * into index.html, so search engines and visitors without JavaScript still see
 * every project as plain text.
 */
function cityContent(): Plugin {
  return {
    name: 'city-content',
    transformIndexHtml(html) {
      const raw: unknown = JSON.parse(readFileSync('content/city.json', 'utf8'));
      const errors = validateCity(raw);
      if (errors.length) {
        throw new Error(`content/city.json is invalid:\n  - ${errors.join('\n  - ')}`);
      }
      return html.replace('<!--STATIC_LIST-->', renderListHtml(raw as CityData, 'en'));
    },
  };
}

export default defineConfig(({ command }) => ({
  // GitHub Pages serves the site from https://hathomas3.github.io/City-Res/
  base: command === 'build' ? '/City-Res/' : '/',
  plugins: [cityContent()],
  build: { chunkSizeWarningLimit: 900 },
}));
