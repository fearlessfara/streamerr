import type { StreamerrClient } from "@streamerr/client";
import {
  attachClient as attach,
  clearSession as clear,
  loadServerUrl as load,
  SERVER_URL_KEY,
} from "@streamerr/native-ui";
import { apiBaseUrl, isSpaDevPort, webStorage } from "./storage";

export { SERVER_URL_KEY, SESSION_KEY } from "@streamerr/native-ui";

/**
 * Resolve the Streamerr API origin for this browser session.
 *
 * Web always uses the host serving this SPA (same-origin / Metro `/api` proxy).
 * There is no “change server” — that is a mobile/TV concern.
 */
export async function loadServerUrl(): Promise<string | null> {
  // Drop any legacy saved API URL from when web had a server picker.
  const stored = await load(webStorage);
  if (stored) {
    await webStorage.removeItem(SERVER_URL_KEY);
  }

  if (typeof window !== "undefined" && isSpaDevPort(window.location.port)) {
    // Empty base → relative /api/* via Metro proxy to :8787
    return "";
  }

  const auto = apiBaseUrl();
  if (auto) return auto;
  if (typeof window !== "undefined") {
    // Production: web is served from the Streamerr API host.
    return "";
  }
  return null;
}

export async function clearSession(): Promise<void> {
  return clear(webStorage);
}

export function attachClient(baseUrl: string): StreamerrClient {
  // Empty string is intentional for Expo proxy / same-origin API static hosting.
  return attach(webStorage, baseUrl);
}

/** Attach the same-origin (or env) API client. */
export async function ensureClient(): Promise<string | null> {
  const url = await loadServerUrl();
  // `""` is a valid same-origin / proxied base — still attach.
  if (url === null) return null;
  attachClient(url);
  return url;
}
