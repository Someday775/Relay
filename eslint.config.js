import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig(
  globalIgnores(['reports/**', '.quality-current/**']),
  { files: ['cypress/**/*.ts', 'cypress.config.ts'], extends: [tseslint.configs.recommended] },
  { files: ['quality/**/*.mjs'], rules: { 'no-unused-vars': 'error', 'no-undef': 'off' } }
);
