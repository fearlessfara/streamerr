import AsyncStorage from "@react-native-async-storage/async-storage";
import { configureClient, createClient, type StreamerrClient } from "@streamerr/client";

export const SERVER_URL_KEY = "streamerr.serverUrl";
export const SESSION_KEY = "streamerr.sessionId";

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h.endsWith(".local") ||
    h.startsWith("127.") ||
    h.startsWith("10.") ||
    h.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)
  );
}

function normalizeServerUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!trimmed) return "";
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol === "http:" && !isPrivateHost(url.hostname)) {
      url.protocol = "https:";
    }
    return url.origin;
  } catch {
    return withScheme;
  }
}

export async function loadServerUrl(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(SERVER_URL_KEY);
  if (!raw) return null;
  const normalized = normalizeServerUrl(raw);
  if (normalized !== raw) await AsyncStorage.setItem(SERVER_URL_KEY, normalized);
  return normalized;
}

export async function saveServerUrl(url: string): Promise<string> {
  const normalized = normalizeServerUrl(url);
  await AsyncStorage.setItem(SERVER_URL_KEY, normalized);
  return normalized;
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}

export function attachClient(baseUrl: string): StreamerrClient {
  return configureClient({
    baseUrl,
    credentials: "include",
    storage: AsyncStorage,
    getSessionId: () => AsyncStorage.getItem(SESSION_KEY),
    setSessionId: async (id) => {
      if (id) await AsyncStorage.setItem(SESSION_KEY, id);
      else await AsyncStorage.removeItem(SESSION_KEY);
    },
  });
}

export async function probeServer(url: string): Promise<void> {
  const origin = normalizeServerUrl(url);
  const client = createClient({ baseUrl: origin });
  const health = await client.health();
  if (health.status !== "ok") {
    throw new Error("That server is not Streamerr");
  }
}
