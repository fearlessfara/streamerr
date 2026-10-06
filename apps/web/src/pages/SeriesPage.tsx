import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { catalogRails } from "@streamerr/client";
import { AppChrome } from "../components/AppChrome";
import { CatalogSkeleton } from "../components/CatalogSkeleton";
import { MediaRailSection } from "../components/MediaRailSection";

export function SeriesPage({ username }: { username: string }) {
  const [search, setSearch] = useState("");

  const catalog = useQuery({
    queryKey: ["catalog", "tv", search],
    queryFn: () => catalogRails("tv", { search: search.trim() || undefined }),
  });

  const rows = catalog.data?.rows ?? [];

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

        {catalog.isLoading ? (
          <div className="catalog-body">
            <CatalogSkeleton cards={8} />
          </div>
        ) : null}

        {catalog.isError ? (
          <div className="page-status error" role="alert">
            {(catalog.error as Error).message}
          </div>
        ) : null}

        <div className="rails">
          {rows.map((row, rowIndex) => (
            <MediaRailSection
              key={row.id}
              id={row.id}
              title={row.title}
              items={row.items}
              emptyText={
                row.id === "library" ? "No series in Jellyfin yet." : "Nothing here yet."
              }
              autoFocusFirst={rowIndex === 0}
            />
          ))}
        </div>
      </main>
    </AppChrome>
  );
}
