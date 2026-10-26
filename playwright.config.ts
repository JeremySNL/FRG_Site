import { defineConfig } from '@playwright/test';

const executablePath = process.env['PLAYWRIGHT_EXECUTABLE_PATH'];

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4321',
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
