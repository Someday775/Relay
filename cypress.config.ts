import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { defineConfig } from 'cypress';
import { addCucumberPreprocessorPlugin } from '@badeball/cypress-cucumber-preprocessor';
import { createEsbuildPlugin } from '@badeball/cypress-cucumber-preprocessor/esbuild';
import createBundler from '@bahmutov/cypress-esbuild-preprocessor';
import { createApp } from './server.js';

const reportDirectory =
  process.env.RELAY_REPORT_DIRECTORY ?? '.quality-current';

export default defineConfig({
  expose: { jsonOutput: join(reportDirectory, 'cucumber.json') },
  video: false,
  screenshotOnRunFailure: true,
  screenshotsFolder: join(reportDirectory, 'screenshots'),
  downloadsFolder: join(reportDirectory, 'downloads'),
  retries: 0,
  e2e: {
    specPattern: 'cypress/e2e/features/*.feature',
    testIsolation: true,
    supportFile: 'cypress/support/e2e.ts',
    async setupNodeEvents(on, config) {
      // Replace the request handler and its in-memory store between scenarios.
      // The browser never receives an HTTP reset endpoint.
      let app = createApp();
      const server = createServer((req, res) => app.emit('request', req, res));
      await addCucumberPreprocessorPlugin(on, config);
      on(
        'file:preprocessor',
        createBundler({ plugins: [createEsbuildPlugin(config)] }),
      );
      on('task', {
        resetRelay() {
          app = createApp();
          return null;
        },
      });
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      server.unref();
      config.baseUrl =
        'http://127.0.0.1:' + (server.address() as AddressInfo).port;
      const response = await fetch(config.baseUrl);
      await response.text();
      if (!response.ok) throw new Error('Relay failed its readiness check.');
      return config;
    },
  },
});
