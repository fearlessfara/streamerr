import { useEffect, useState } from "react";
import { Image, type ImageResizeMode, type ImageStyle, type StyleProp } from "react-native";
import { SESSION_HEADER, getClient } from "@streamerr/client";

/** Artwork URLs are built from the API's public origin. The TV talks to a different one. */
export function artworkUri(url: string | undefined | null, maxWidth?: number): string | undefined {
  if (!url) return undefined;
  const base = getClient().baseUrl;
  if (!base) return url;
  try {
    const parsed = new URL(url, base);
    if (!parsed.pathname.startsWith("/api/")) return parsed.href;
    if (maxWidth) {
      parsed.searchParams.set("maxWidth", String(maxWidth));
      parsed.searchParams.set("quality", "80");
    }
    const path = `${parsed.pathname}${parsed.search}`;
    return new URL(path, base.endsWith("/") ? base : `${base}/`).href;
  } catch {
    return url;
  }
}

function useSessionHeaders(): Record<string, string> | null {
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getClient()
      .sessionHeaders()
      .then((next) => {
        if (cancelled) return;
        const session = next[SESSION_HEADER];
        setHeaders(session ? { [SESSION_HEADER]: session } : {});
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return headers;
}

export function Artwork({
  url,
  style,
  resizeMode = "cover",
  maxWidth,
  onError,
}: {
  url?: string | null;
  style: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  /** Ask the image proxy for a bitmap this wide. Full Jellyfin backdrops are 4K and the TV decoder drops some of them. */
  maxWidth?: number;
  onError?: () => void;
}) {
  const headers = useSessionHeaders();
  const uri = artworkUri(url, maxWidth);
  if (!uri || !headers) return null;
  return (
    <Image
      source={{ uri, headers }}
      style={style}
      resizeMode={resizeMode}
      resizeMethod="resize"
      onError={onError}
    />
  );
}
