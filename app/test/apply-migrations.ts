import { applyD1Migrations, env } from "cloudflare:test";

// Runs before the tests: creates our tables in the test database
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);