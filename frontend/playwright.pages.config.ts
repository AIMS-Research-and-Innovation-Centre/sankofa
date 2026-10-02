import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests-pages',
  use: { baseURL: 'http://127.0.0.1:4173', launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
  webServer: { command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173', url: 'http://127.0.0.1:4173/sankofa/', env: { VITE_PAGES: 'true', VITE_API_BASE: '', VITE_GRAPH_WS: '' }, reuseExistingServer: false },
});
