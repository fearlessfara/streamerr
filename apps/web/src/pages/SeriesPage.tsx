import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@streamerr/ui";
import { discoverTv, libraryItems } from "../lib/api";
import { AppChrome } from "../components/AppChrome";
import { CatalogSkeleton } from "../components/CatalogSkeleton";
import { MediaRailSection } from "../components/MediaRailSection";

export function SeriesPage({ username }: { username: string }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const library = useQuery({
    queryKey: ["library", "tv", search],
    queryFn: () => libraryItems("tv", { limit: 48, search: search.trim() || undefined }),
  });

  const discover = useQuery({
    queryKey: ["discover", "tv", page],
    queryFn: () => discoverTv(page),
  });

  const popular = useMemo(() => discover.data?.items ?? [], [discover.data?.items]);

  return (
    <AppChrome username={username} solid>
      <main className="app-main catalog-page">
        <div className="catalog-header">
          <h1>Series</h1>
          <p>Your Jellyfin library and popular TV to request or play via IPTV.</p>
          <label className="catalog-filter">
            <span className="sr-only">Filter library</span>
            <input
              type="search"
              placeholder="Filter library…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>

        {library.isLoading ? (
          <div className="catalog-body">
            <CatalogSkeleton cards={8} />
          </div>
        ) : null}

        <div className="rails">
          <MediaRailSection
            id="series-library"
            title="My Library"
            items={library.data?.items ?? []}
            emptyText="No series in Jellyfin yet."
            autoFocusFirst
          />
          {discover.isLoading && page === 1 ? (
            <CatalogSkeleton cards={8} />
          ) : (
            <MediaRailSection
              id="series-popular"
              title="Popular"
              items={popular}
              emptyText="No popular series found."
            />
          )}
        </div>

        <div className="catalog-pager">
          <Button
            id="series-prev"
            variant="ghost"
            disabled={page <= 1 || discover.isFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="catalog-pager-label">Page {page}</span>
          <Button
            id="series-next"
            variant="ghost"
            disabled={!popular.length || discover.isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            More
          </Button>
        </div>
      </main>
    </AppChrome>
  );
}
