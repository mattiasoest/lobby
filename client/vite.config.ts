import { defineConfig, loadEnv } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import { APP_NAME } from './src/app/config.ts';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_PROXY_TARGET ?? 'http://localhost:3001';

  return {
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
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
