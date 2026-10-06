import { z } from "zod";
import type { DispatcharrAuth } from "@streamerr/providers";
import { parsePreferredLanguages } from "@streamerr/shared";

const EnvSchema = z.object({
  STREAMERR_PORT: z.coerce.number().default(8787),
  STREAMERR_SESSION_SECRET: z.string().min(16).default("dev-only-change-me-please"),
  STREAMERR_DATA_DIR: z.string().default("./data"),
  STREAMERR_PUBLIC_URL: z.string().default("http://localhost:8787"),
  /**
   * `nginx` — API returns X-Accel-Redirect; nginx sends media bytes.
   * `node` — API pipes upstream / local files (local Vite/dev default).
   */
  STREAMERR_MEDIA_PLANE: z.enum(["nginx", "node"]).default("node"),
  /**
   * When true (default), the API process runs the HLS packager loop.
   * Docker runs a dedicated packager process and sets this to false.
   */
  STREAMERR_EMBED_PACKAGER: z
    .string()
    .optional()
    .transform((v) => v !== "0" && v !== "false"),
  STREAMERR_USE_MOCKS: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
  JELLYFIN_URL: z.string().default(""),
  SEERR_URL: z.string().default(""),
  SEERR_API_KEY: z.string().optional(),
  DISPATCHARR_URL: z.string().default(""),
  DISPATCHARR_API_KEY: z.string().optional(),
  DISPATCHARR_USERNAME: z.string().optional(),
  DISPATCHARR_PASSWORD: z.string().optional(),
  DISPATCHARR_CF_ACCESS_CLIENT_ID: z.string().optional(),
  DISPATCHARR_CF_ACCESS_CLIENT_SECRET: z.string().optional(),
  BAZARR_URL: z.string().default(""),
  BAZARR_API_KEY: z.string().optional(),
  HTTP_TIMEOUT_MS: z.coerce.number().default(15_000),
  /** Max bytes for CACHE-mode acquisitions (default 50 GiB). */
  STREAMERR_CACHE_MAX_BYTES: z.coerce.number().default(50 * 1024 * 1024 * 1024),
  /** TTL for idle CACHE files (default 7 days). */
  STREAMERR_CACHE_TTL_MS: z.coerce.number().default(7 * 24 * 60 * 60 * 1000),
  /** Max concurrent IPTV upstream connections (live + VOD + downloads). */
  STREAMERR_IPTV_MAX_CONNECTIONS: z.coerce.number().int().positive().default(3),
  /**
   * Preferred IPTV catalogue/audio languages (comma-separated, strongest first).
   * Used to rank EN-/IT- prefixed Dispatcharr VOD variants for the same TMDb id.
   */
  STREAMERR_PREFERRED_LANGUAGES: z.string().default("en"),
  /** How often to rescan the Dispatcharr VOD catalogue into SQLite (default 12h). */
  STREAMERR_VOD_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(12 * 60 * 60 * 1000),
  FFMPEG_PATH: z.string().optional(),
  FFPROBE_PATH: z.string().optional(),
  NODE_ENV: z.string().optional(),
});

export type AppConfig = Omit<z.infer<typeof EnvSchema>, "STREAMERR_PREFERRED_LANGUAGES"> & {
  STREAMERR_PREFERRED_LANGUAGES: string[];
  dispatcharrAuth?: DispatcharrAuth;
  dispatcharrCloudflareAccess?: { clientId: string; clientSecret: string };
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  const isProd = parsed.NODE_ENV === "production";
  if (isProd && parsed.STREAMERR_SESSION_SECRET === "dev-only-change-me-please") {
    throw new Error(
      "STREAMERR_SESSION_SECRET must be set to a strong random value in production",
    );
  }
  let dispatcharrAuth: DispatcharrAuth | undefined;
  if (parsed.DISPATCHARR_API_KEY) {
    dispatcharrAuth = { type: "apiKey", apiKey: parsed.DISPATCHARR_API_KEY };
  } else if (parsed.DISPATCHARR_USERNAME && parsed.DISPATCHARR_PASSWORD) {
    dispatcharrAuth = {
      type: "credentials",
      username: parsed.DISPATCHARR_USERNAME,
      password: parsed.DISPATCHARR_PASSWORD,
    };
  }
  let dispatcharrCloudflareAccess: AppConfig["dispatcharrCloudflareAccess"];
  if (parsed.DISPATCHARR_CF_ACCESS_CLIENT_ID && parsed.DISPATCHARR_CF_ACCESS_CLIENT_SECRET) {
    dispatcharrCloudflareAccess = {
      clientId: parsed.DISPATCHARR_CF_ACCESS_CLIENT_ID,
      clientSecret: parsed.DISPATCHARR_CF_ACCESS_CLIENT_SECRET,
    };
  }
  return {
    ...parsed,
    STREAMERR_PREFERRED_LANGUAGES: parsePreferredLanguages(parsed.STREAMERR_PREFERRED_LANGUAGES),
    dispatcharrAuth,
    dispatcharrCloudflareAccess,
  };
}

/** Prefer Secure cookies when the public URL is https or NODE_ENV is production. */
export function sessionCookieSecure(config: AppConfig): boolean {
  if (config.NODE_ENV === "production") return true;
  try {
    return new URL(config.STREAMERR_PUBLIC_URL).protocol === "https:";
  } catch {
    return false;
  }
}
