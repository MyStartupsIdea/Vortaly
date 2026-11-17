// Local dev launcher that keeps the server away from live services.
// Next loads .env.local (live Supabase keys) automatically; empty strings
// passed here win over it, whereas unsetting a variable does not.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

const child = spawn(process.execPath, [nextBin, "dev", "--port", "3100"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    SUPABASE_SECRET_KEY: "",
    // A fake bot token: lets local tests sign Telegram payloads themselves.
    // No real bot answers to it, so nothing can reach Telegram.
    TELEGRAM_BOT_TOKEN: "123456:local-dev-token",
    CLICK_SECRET_KEY: "",
    CLICK_MERCHANT_ID: "",
    CLICK_SERVICE_ID: "",
    PAYME_MERCHANT_ID: "",
    // A local-only admin secret, so the real one is never needed for testing.
    PLATFORM_ADMIN_SECRET: "vortaly-local-dev",
  },
});

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 0));
