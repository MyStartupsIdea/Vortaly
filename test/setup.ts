import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { vi } from "vitest";

// Hard stop: a test run must never talk to a real database.
for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"]) {
  if (process.env[name]) throw new Error(`${name} is set: refusing to run tests against a live project`);
}

// Each test file gets its own scratch directory for the .vortaly/ dev stores.
process.chdir(mkdtempSync(path.join(tmpdir(), "vortaly-test-")));

// No test may reach the network unless it installs its own fetch mock.
vi.stubGlobal("fetch", vi.fn(async () => {
  throw new Error("network access in tests: mock fetch for this test");
}));
