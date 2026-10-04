import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { createAppContext } from "./context.js";
import { buildApp } from "./app.js";

// Load monorepo root .env (apps/api/../../.env)
loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv({ path: resolve(process.cwd(), ".env") });

async function main() {
  const config = loadConfig();
  const ctx = createAppContext(config);
  const app = await buildApp(ctx);

  await app.listen({ port: config.STREAMERR_PORT, host: "0.0.0.0" });
  app.log.info(
    {
      port: config.STREAMERR_PORT,
      mocks: ctx.useMocks,
      jellyfin: config.JELLYFIN_URL || null,
      seerr: config.SEERR_URL || null,
      dispatcharr: config.DISPATCHARR_URL || null,
    },
    "Streamerr API listening",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
