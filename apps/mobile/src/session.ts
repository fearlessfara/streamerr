import AsyncStorage from "@react-native-async-storage/async-storage";
import type { StreamerrClient } from "@streamerr/client";
import {
  attachClient as attach,
  clearSession as clear,
  loadServerUrl as load,
  probeServer,
  saveServerUrl as save,
} from "@streamerr/native-ui";

export { SERVER_URL_KEY, SESSION_KEY, probeServer } from "@streamerr/native-ui";

export async function loadServerUrl(): Promise<string | null> {
  return load(AsyncStorage);
}

export async function saveServerUrl(url: string): Promise<string> {
  return save(AsyncStorage, url);
}

export async function clearSession(): Promise<void> {
  return clear(AsyncStorage);
}

export function attachClient(baseUrl: string): StreamerrClient {
  return attach(AsyncStorage, baseUrl);
}
