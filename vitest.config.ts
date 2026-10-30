import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./tests/global-setup.ts"],
    env: {
      DATABASE_URL: "file:./test.db",
      NODE_ENV: "test",
      // Deterministic integration test configuration. Tests that exercise the
      // "not configured" paths stub these values for the duration of a case.
      INTEGRATION_ENCRYPTION_KEY:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      INTEGRATION_STATE_SECRET: "vitest-integration-state-secret",
      INTEGRATIONS_BASE_URL: "https://backend.test",
      EMAIL_PROVIDER: "gmail",
      EMAIL_GMAIL_CLIENT_ID: "test-gmail-client-id",
      EMAIL_GMAIL_CLIENT_SECRET: "test-gmail-client-secret",
      CRON_SECRET: "test-cron-secret",
      META_APP_ID: "test-meta-app-id",
      META_APP_SECRET: "test-meta-app-secret",
      META_GRAPH_VERSION: "v26.0",
      META_WEBHOOK_VERIFY_TOKEN: "test-meta-verify-token",
    },
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
