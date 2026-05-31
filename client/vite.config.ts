import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import { APP_NAME } from './src/app/config.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Co-located `Component/Component.css` imports are treated as CSS modules. */
function componentCssModules(): Plugin {
  const virtualSuffix = '.component-css-module.module.css';

  return {
    name: 'component-css-modules',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer) return null;
      const match = source.match(/^\.\/([^/]+)\.css$/);
      if (!match) return null;
      const dir = path.dirname(importer);
      if (match[1] !== path.basename(dir)) return null;
      const cssPath = path.resolve(dir, `${match[1]}.css`);
      if (!fs.existsSync(cssPath)) return null;
      return cssPath + virtualSuffix;
    },
    load(id) {
      if (!id.endsWith(virtualSuffix)) return null;
      const cssPath = id.slice(0, -virtualSuffix.length);
      return fs.readFileSync(cssPath, 'utf-8');
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    componentCssModules(),
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
