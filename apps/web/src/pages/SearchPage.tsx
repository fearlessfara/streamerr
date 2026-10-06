import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { searchMedia } from "@streamerr/client";
import { AppChrome } from "../components/AppChrome";
import { CatalogSkeleton } from "../components/CatalogSkeleton";
import { MediaGrid } from "../components/MediaGrid";

export function SearchPage({ username }: { username: string }) {
  const [params] = useSearchParams();
  const qFromUrl = params.get("q")?.trim() ?? "";
  const [q, setQ] = useState(qFromUrl);

  useEffect(() => {
    const t = setTimeout(() => setQ(qFromUrl), 0);
    return () => clearTimeout(t);
  }, [qFromUrl]);

  const query = useQuery({
    queryKey: ["search", q],
    queryFn: () => searchMedia(q),
    enabled: q.length >= 2,
  });

  return (
    <AppChrome username={username} solid>
      <main className="app-main catalog-page">
        <div className="catalog-header">
          <h1>Search</h1>
          {q.length === 0 ? (
            <p>Use the search icon in the header to find movies and TV.</p>
          ) : q.length < 2 ? (
            <p>Type at least 2 characters…</p>
          ) : (
            <p>
              Results for <strong>“{q}”</strong>
            </p>
          )}
        </div>
        {query.isFetching ? (
          <div className="catalog-body">
            <CatalogSkeleton cards={12} />
          </div>
        ) : null}
        {query.isError ? (
          <div className="page-status error">{(query.error as Error).message}</div>
        ) : null}
        {query.data && !query.isFetching ? (
          <div className="catalog-body">
            <MediaGrid
              id="search"
              items={query.data.items}
              emptyText="No matches."
              autoFocusFirst={false}
            />
          </div>
        ) : null}
      </main>
    </AppChrome>
  );
}
