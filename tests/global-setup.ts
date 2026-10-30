import { execSync } from "node:child_process";

// Build a throwaway SQLite database for the test run. Never touches dev.db.
export default function setup() {
  execSync("npx prisma db push --force-reset --skip-generate", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  });
}
