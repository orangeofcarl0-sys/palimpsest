/**
 * PLMP-WEB-E2E-1 (spec 36, G9-G): the browser/system regression gate.
 *
 * Frozen rules (36 号 §9/§10/§40):
 *   - Chromium only; retries = 0 (flakiness is fixed, never retried away);
 *   - workers = 1 (deterministic semantic safety first, not wall-clock);
 *   - trace = retain-on-failure, screenshot = only-on-failure, video = off;
 *   - E2E servers bind 127.0.0.1 : port 0 - the OS assigns the port, no
 *     globally reserved fixed port range (local sessions / CI / worktrees).
 *
 * The suite drives the REAL built product stack: dist/src kernel + dist/web
 * bundle through `pnpm build && pnpm build:web` (the pretest:e2e script).
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  // Kernel modules are imported from dist/src; a stale/missing build would
  // silently test the wrong stack - global-setup fails fast instead (§12).
  globalSetup: "e2e/support/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 10_000,
  },
  outputDir: "test-results",
});
