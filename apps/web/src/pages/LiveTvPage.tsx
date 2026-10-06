import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LiveChannel, LiveNowNext } from "@streamerr/shared";
import { AppChrome } from "../components/AppChrome";
import { LiveGuideGrid } from "../components/LiveGuideGrid";
import { LiveSkeleton } from "../components/skeletons";
import {
  liveChannels,
  liveGuide,
  liveGroups,
  liveNow,
  playLiveChannel,
  toggleLiveFavourite,
} from "@streamerr/client";

function formatClock(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function NowNextLine({ entry }: { entry?: LiveNowNext }) {
  if (!entry?.now) return <span className="live-epg-empty">No guide data</span>;
  return (
    <span className="live-epg">
      <span className="live-epg-now">{entry.now.title}</span>
      {entry.next ? (
        <span className="live-epg-next">
          Next {formatClock(entry.next.startsAt)} · {entry.next.title}
        </span>
      ) : null}
    </span>
  );
}

type LiveView = "channels" | "guide";

export function LiveTvPage({ username }: { username: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [groupId, setGroupId] = useState<string | "favourites" | "">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<LiveView>("channels");
  const [guideOffsetHours, setGuideOffsetHours] = useState(0);
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);

  const groups = useQuery({ queryKey: ["live", "groups"], queryFn: liveGroups });

  const channels = useQuery({
    queryKey: ["live", "channels", groupId, search, page],
    queryFn: () =>
      liveChannels({
        groupId: groupId && groupId !== "favourites" ? groupId : undefined,
        favouritesOnly: groupId === "favourites",
        search: search.trim() || undefined,
        page,
        pageSize: 60,
      }),
  });

  const channelUuids = useMemo(
    () => (channels.data?.items ?? []).map((c) => c.uuid),
    [channels.data?.items],
  );

  const guideWindow = useMemo(() => {
    const origin = Date.now() + guideOffsetHours * 60 * 60_000;
    return {
      start: new Date(origin - 30 * 60_000).toISOString(),
      end: new Date(origin + 3 * 60 * 60_000).toISOString(),
    };
  }, [guideOffsetHours]);

  const guide = useQuery({
    queryKey: ["live", "guide", guideWindow.start, guideWindow.end],
    queryFn: () => liveGuide(guideWindow),
    enabled: view === "guide",
    staleTime: 60_000,
  });

  const nowNext = useQuery({
    queryKey: ["live", "now", channelUuids.join(",")],
    queryFn: () => liveNow(channelUuids),
    enabled: channelUuids.length > 0,
    refetchInterval: 60_000,
  });

  const nowMap = useMemo(() => {
    const map = new Map<string, LiveNowNext>();
    for (const item of nowNext.data?.items ?? []) map.set(item.channelUuid, item);
    return map;
  }, [nowNext.data?.items]);

  useEffect(() => {
    const items = channels.data?.items ?? [];
    if (!items.length) {
      setSelectedUuid(null);
      return;
    }
    if (!selectedUuid || !items.some((c) => c.uuid === selectedUuid)) {
      setSelectedUuid(items[0]!.uuid);
    }
  }, [channels.data?.items, selectedUuid]);

  const selected: LiveChannel | undefined = (channels.data?.items ?? []).find(
    (c) => c.uuid === selectedUuid,
  );

  const favMutation = useMutation({
    mutationFn: (uuid: string) => toggleLiveFavourite(uuid),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["live", "channels"] });
    },
  });

  const playMutation = useMutation({
    mutationFn: (uuid: string) => playLiveChannel(uuid),
    onSuccess: (data, uuid) => {
      const list = (channels.data?.items ?? []).map((c) => ({
        uuid: c.uuid,
        name: c.name,
        number: c.number,
      }));
      navigate("/play", {
        state: {
          source: data.source,
          title: data.title ?? data.channel?.name ?? "Live TV",
          live: true,
          channelUuid: uuid,
          liveChannels: list.length ? list : [{ uuid, name: data.title ?? "Live TV" }],
        },
      });
    },
  });

  const totalPages = Math.max(1, Math.ceil((channels.data?.total ?? 0) / 60));

  return (
    <AppChrome username={username} solid>
      <main className="app-main live-page">
        <div className="catalog-header">
          <h1>Live TV</h1>
          <p>Channels, guide, and live playback from Dispatcharr.</p>
        </div>

        <div className={`live-layout${view === "guide" ? " is-guide" : ""}`}>
          <aside className="live-groups" aria-label="Channel groups">
            <button
              type="button"
              className={`live-group-btn${!groupId ? " active" : ""}`}
              onClick={() => {
                setGroupId("");
                setPage(1);
              }}
            >
              All channels
            </button>
            <button
              type="button"
              className={`live-group-btn${groupId === "favourites" ? " active" : ""}`}
              onClick={() => {
                setGroupId("favourites");
                setPage(1);
              }}
            >
              Favourites
            </button>
            {(groups.data?.items ?? []).map((g) => (
              <button
                key={g.id}
                type="button"
                className={`live-group-btn${groupId === g.id ? " active" : ""}`}
                onClick={() => {
                  setGroupId(g.id);
                  setPage(1);
                }}
              >
                {g.name}
              </button>
            ))}
          </aside>

          <section className="live-main">
            <div className="live-toolbar">
              <div className="live-view-toggle" role="tablist" aria-label="Live TV view">
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === "channels"}
                  className={view === "channels" ? "active" : undefined}
                  onClick={() => setView("channels")}
                >
                  Channels
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === "guide"}
                  className={view === "guide" ? "active" : undefined}
                  onClick={() => setView("guide")}
                >
                  Guide
                </button>
              </div>
              <input
                className="live-search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search channels"
                aria-label="Search channels"
              />
              <span className="live-count">
                {channels.data ? `${channels.data.total} channels` : "…"}
              </span>
              {view === "guide" ? (
                <div className="live-guide-nav">
                  <button type="button" onClick={() => setGuideOffsetHours((h) => h - 3)}>
                    −3h
                  </button>
                  <button type="button" onClick={() => setGuideOffsetHours(0)}>
                    Now
                  </button>
                  <button type="button" onClick={() => setGuideOffsetHours((h) => h + 3)}>
                    +3h
                  </button>
                </div>
              ) : null}
            </div>

            {channels.isError ? (
              <p className="page-status error">{(channels.error as Error).message}</p>
            ) : null}
            {view === "guide" && guide.isError ? (
              <p className="page-status error">{(guide.error as Error).message}</p>
            ) : null}

            {view === "guide" ? (
              guide.isLoading ? (
                <LiveSkeleton mode="guide" />
              ) : (
                <LiveGuideGrid
                  channels={channels.data?.items ?? []}
                  programmes={guide.data?.items ?? []}
                  windowStart={guide.data?.start ?? guideWindow.start}
                  windowEnd={guide.data?.end ?? guideWindow.end}
                  selectedUuid={selectedUuid}
                  onSelectChannel={setSelectedUuid}
                  onWatch={(uuid) => playMutation.mutate(uuid)}
                />
              )
            ) : (
              <div className="live-channel-list" role="listbox" aria-label="Channels">
                {(channels.data?.items ?? []).map((ch) => {
                  const active = ch.uuid === selectedUuid;
                  return (
                    <div
                      key={ch.uuid}
                      role="option"
                      tabIndex={0}
                      aria-selected={active}
                      className={`live-channel-row${active ? " active" : ""}`}
                      onClick={() => setSelectedUuid(ch.uuid)}
                      onDoubleClick={() => playMutation.mutate(ch.uuid)}
                      onKeyDown={(e) => {
                        const items = channels.data?.items ?? [];
                        const idx = items.findIndex((c) => c.uuid === ch.uuid);
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          playMutation.mutate(ch.uuid);
                          return;
                        }
                        if (e.key === "ArrowDown" && idx >= 0 && idx < items.length - 1) {
                          e.preventDefault();
                          const next = items[idx + 1]!;
                          setSelectedUuid(next.uuid);
                          (
                            e.currentTarget.parentElement?.children[idx + 1] as HTMLElement | undefined
                          )?.focus();
                        }
                        if (e.key === "ArrowUp" && idx > 0) {
                          e.preventDefault();
                          const prev = items[idx - 1]!;
                          setSelectedUuid(prev.uuid);
                          (
                            e.currentTarget.parentElement?.children[idx - 1] as HTMLElement | undefined
                          )?.focus();
                        }
                      }}
                    >
                      <span className="live-ch-num">{ch.number ?? "—"}</span>
                      {ch.logoUrl ? (
                        <img className="live-ch-logo" src={ch.logoUrl} alt="" loading="lazy" />
                      ) : (
                        <span className="live-ch-logo placeholder" aria-hidden="true" />
                      )}
                      <span className="live-ch-meta">
                        <span className="live-ch-name">{ch.name}</span>
                        <NowNextLine entry={nowMap.get(ch.uuid)} />
                      </span>
                      <button
                        type="button"
                        className={`live-fav-btn${ch.favourite ? " is-on" : ""}`}
                        aria-label={ch.favourite ? "Remove favourite" : "Add favourite"}
                        onClick={(e) => {
                          e.stopPropagation();
                          favMutation.mutate(ch.uuid);
                        }}
                      >
                        {ch.favourite ? "★" : "☆"}
                      </button>
                    </div>
                  );
                })}
                {channels.isLoading ? <LiveSkeleton mode="channels" /> : null}
                {!channels.isLoading && (channels.data?.items.length ?? 0) === 0 ? (
                  <p className="page-status">No channels in this group.</p>
                ) : null}
              </div>
            )}

            <div className="live-pager">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span>
                Page {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </section>

          <aside className="live-detail">
            {selected ? (
              <>
                <div className="live-detail-head">
                  {selected.logoUrl ? (
                    <img src={selected.logoUrl} alt="" className="live-detail-logo" />
                  ) : null}
                  <div>
                    <h2>{selected.name}</h2>
                    <p>
                      {selected.number != null ? `Ch ${selected.number}` : null}
                      {selected.groupName ? ` · ${selected.groupName}` : null}
                    </p>
                  </div>
                </div>
                <div className="live-detail-epg">
                  <h3>Now</h3>
                  <p>{nowMap.get(selected.uuid)?.now?.title ?? "No programme info"}</p>
                  {nowMap.get(selected.uuid)?.now?.description ? (
                    <p className="live-detail-desc">
                      {nowMap.get(selected.uuid)?.now?.description}
                    </p>
                  ) : null}
                  <h3>Next</h3>
                  <p>
                    {nowMap.get(selected.uuid)?.next
                      ? `${formatClock(nowMap.get(selected.uuid)?.next?.startsAt)} · ${nowMap.get(selected.uuid)?.next?.title}`
                      : "—"}
                  </p>
                </div>
                <button
                  type="button"
                  className="live-watch-btn"
                  disabled={playMutation.isPending}
                  onClick={() => playMutation.mutate(selected.uuid)}
                >
                  {playMutation.isPending ? "Starting…" : "Watch live"}
                </button>
                {playMutation.isError ? (
                  <p className="error">{(playMutation.error as Error).message}</p>
                ) : null}
              </>
            ) : (
              <p className="page-status">Select a channel</p>
            )}
          </aside>
        </div>
      </main>
    </AppChrome>
  );
}
