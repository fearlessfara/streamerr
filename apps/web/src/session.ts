import type { StreamerrClient } from "@streamerr/client";
import {
  attachClient as attach,
  clearSession as clear,
  loadServerUrl as load,
  normalizeServerUrl,
  probeServer,
  saveServerUrl as save,
  SERVER_URL_KEY,
} from "@streamerr/native-ui";
import { apiBaseUrl, isCurrentSpaOrigin, isSpaDevPort, webStorage } from "./storage";

export { SERVER_URL_KEY, SESSION_KEY, probeServer } from "@streamerr/native-ui";

/**
 * Resolve the Streamerr API origin for this browser session.
 * Never treat the Expo/Metro SPA origin as the API (that returns HTML for /api/*).
 */
export async function loadServerUrl(): Promise<string | null> {
  const stored = await load(webStorage);
  if (stored && !isCurrentSpaOrigin(stored)) {
    return stored;
  }
  if (stored && isCurrentSpaOrigin(stored)) {
    // Stale “server” saving of the web app URL — drop it.
    await webStorage.removeItem(SERVER_URL_KEY);
  }

  if (typeof window !== "undefined" && isSpaDevPort(window.location.port)) {
    // Empty base → relative /api/* via Metro proxy to :8787
    return "";
  }

  const auto = apiBaseUrl();
  if (auto) return auto;
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return null;
}

export async function saveServerUrl(url: string): Promise<string> {
  const normalized = normalizeServerUrl(url);
  if (isCurrentSpaOrigin(normalized)) {
    throw new Error(
      "That’s the web app, not the Streamerr API. Use the API port (e.g. http://192.168.1.10:8787).",
    );
  }
  return save(webStorage, normalized);
}

export async function clearSession(): Promise<void> {
  return clear(webStorage);
}

export function attachClient(baseUrl: string): StreamerrClient {
  // Empty string is intentional for Expo proxy / same-origin API static hosting.
  return attach(webStorage, baseUrl);
}

/** Dev convenience: auto-attach when no server saved. */
export async function ensureClient(): Promise<string | null> {
  const url = await loadServerUrl();
  // `""` is a valid same-origin / proxied base — still attach.
  if (url === null) return null;
  attachClient(url);
  return url;
}
