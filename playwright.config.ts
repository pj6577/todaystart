import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45000,
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" }
})
