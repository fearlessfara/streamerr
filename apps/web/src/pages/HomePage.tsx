import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@streamerr/ui";
import type { Media } from "@streamerr/shared";
import { home, resolvePlaybackForPlay } from "@streamerr/client";
import { actionLabel, canPlayMedia, formatRuntime, mediaHref } from "@streamerr/client";
import { AppChrome } from "../components/AppChrome";
import { MediaRailSection } from "../components/MediaRailSection";

export function HomePage({ username }: { username: string }) {
  const navigate = useNavigate();
  const homeQuery = useQuery({ queryKey: ["home"], queryFn: home });
  const [bufferStatus, setBufferStatus] = useState<string | null>(null);

  const openMedia = (media: Media) => {
    const href = mediaHref(media);
    if (href) navigate(href);
  };

  const playMedia = useMutation({
    mutationFn: async (media: Media) => {
      setBufferStatus("Resolving…");
      const source = await resolvePlaybackForPlay(media.identity, {
        meta: media.metadata,
        onBuffering: ({ bytesDownloaded = 0, totalBytes }) => {
          if (totalBytes && totalBytes > 0) {
            setBufferStatus(
              `Buffering… ${Math.min(99, Math.round((bytesDownloaded / totalBytes) * 100))}%`,
            );
          } else {
            setBufferStatus(`Buffering… ${Math.round(bytesDownloaded / 1_000_000)} MB`);
          }
        },
      });
      return {
        source,
        title: media.metadata.title,
        identity: media.identity,
      };
    },
    onSuccess: ({ source, title, identity }) => {
      setBufferStatus(null);
      navigate("/play", { state: { source, title, identity } });
    },
    onError: (_err, media) => {
      setBufferStatus(null);
      openMedia(media);
    },
  });

  const featured = useMemo(() => {
    const rows = homeQuery.data?.rows ?? [];
    for (const row of rows) {
      if (row.items[0]) return row.items[0];
    }
    return null;
  }, [homeQuery.data]);

  const featureBg =
    featured?.metadata.backdropUrl || featured?.metadata.posterUrl || undefined;

  const featuredChips = featured
    ? [
        featured.metadata.year ? String(featured.metadata.year) : null,
        formatRuntime(featured.metadata.runtimeMinutes),
        featured.identity.mediaType !== "other" ? featured.identity.mediaType : null,
      ].filter(Boolean)
    : [];

  const featuredPlayable = featured ? canPlayMedia(featured) : false;
  const playLabel = featured ? actionLabel(featured).replace(/^▶\s*/, "") : "Play";

  return (
    <AppChrome username={username}>
      <main className="app-main with-billboard">
        {homeQuery.isLoading ? (
          <div className="page-status" role="status">
            Loading your library…
          </div>
        ) : null}
        {homeQuery.isError ? (
          <div className="page-status error" role="alert">
            {(homeQuery.error as Error).message}
          </div>
        ) : null}

        {featured ? (
          <section className="billboard" aria-label="Featured">
            <div
              className="billboard-bg"
              style={
                featureBg
                  ? { backgroundImage: `url(${featureBg})` }
                  : { background: "linear-gradient(135deg, #2a0a0c, #141414 60%)" }
              }
            />
            <div className="billboard-shade" />
            <div className="billboard-content">
              <h1 className="billboard-title">{featured.metadata.title}</h1>
              {featuredChips.length ? (
                <div className="billboard-meta-row">
                  {featuredChips.map((chip) => (
                    <span key={String(chip)} className="meta-chip">
                      {chip}
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="billboard-overview">
                {featured.metadata.overview ||
                  "Pick up where you left off. Your media. One stream."}
              </p>
              <div className="billboard-actions">
                <Button
                  id="billboard-play"
                  onClick={() => {
                    if (featuredPlayable) playMedia.mutate(featured);
                    else openMedia(featured);
                  }}
                  autoFocus
                >
                  <span aria-hidden="true">▶</span>{" "}
                  {playMedia.isPending ? bufferStatus || "Resolving…" : playLabel}
                </Button>
                <Button
                  id="billboard-info"
                  variant="secondary"
                  onClick={() => openMedia(featured)}
                >
                  <span aria-hidden="true">ℹ</span> More info
                </Button>
              </div>
              {playMedia.isError ? (
                <p className="error" style={{ marginTop: "0.75rem" }}>
                  {(playMedia.error as Error).message}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        <div className="rails">
          {homeQuery.data?.rows.map((row, rowIndex) => (
            <MediaRailSection
              key={row.id}
              id={row.id}
              title={row.title}
              items={row.items}
              autoFocusFirst={!featured && rowIndex === 0}
            />
          ))}
        </div>
      </main>
    </AppChrome>
  );
}
