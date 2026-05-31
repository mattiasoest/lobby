import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import { APP_NAME } from './src/app/config.ts';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    {
      name: 'html-app-name',
      transformIndexHtml(html) {
        return html.replace(/<title>.*?<\/title>/, `<title>${APP_NAME}</title>`);
      },
    },
  ],
  server: {
    // Bind to 0.0.0.0 so other devices on the LAN (e.g. a phone) can load the dev server.
    host: true,
  },
});
