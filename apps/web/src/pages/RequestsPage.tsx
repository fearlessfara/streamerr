import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listRequests } from "@streamerr/client";
import { AppChrome } from "../components/AppChrome";
import { ListSkeleton } from "../components/skeletons";

export function RequestsPage({ username }: { username: string }) {
  const query = useQuery({
    queryKey: ["requests"],
    queryFn: () => listRequests({ take: 50 }),
  });

  const items = query.data?.items ?? [];

  return (
    <AppChrome username={username} solid>
      <main className="app-main catalog-page">
        <div className="catalog-header">
          <h1>Requests</h1>
          <p>Seerr request status for titles you&apos;ve asked for.</p>
        </div>

        {query.isLoading ? (
          <div className="catalog-body">
            <ListSkeleton rows={6} variant="poster" />
          </div>
        ) : null}
        {query.isError ? (
          <div className="page-status error">{(query.error as Error).message}</div>
        ) : null}
        {!query.isLoading && items.length === 0 ? (
          <div className="page-status">No requests yet.</div>
        ) : null}

        <ul className="requests-list">
          {items.map((item) => {
            const href =
              item.tmdbId != null ? `/media/${item.mediaType}/${item.tmdbId}` : null;
            return (
              <li key={item.id} className="requests-row">
                {item.posterUrl ? (
                  <img src={item.posterUrl} alt="" className="requests-poster" />
                ) : (
                  <div className="requests-poster is-empty" aria-hidden="true" />
                )}
                <div className="requests-meta">
                  <div className="requests-title">
                    {href ? <Link to={href}>{item.title}</Link> : item.title}
                    {item.year ? <span className="requests-year"> ({item.year})</span> : null}
                    {item.is4k ? <span className="requests-badge">4K</span> : null}
                  </div>
                  <div className="requests-sub">
                    <span>{item.mediaType}</span>
                    <span className={`requests-status is-${item.status.toLowerCase()}`}>
                      {item.status}
                    </span>
                    {item.mediaStatus ? <span>{item.mediaStatus}</span> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </main>
    </AppChrome>
  );
}
