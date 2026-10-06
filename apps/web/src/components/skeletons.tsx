/** Page-shaped loading placeholders matching real Streamerr/Netflix layout geometry. */

function times(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

export function CatalogSkeleton({ cards = 8 }: { cards?: number }) {
  return (
    <div className="catalog-skeleton" aria-hidden="true">
      {times(cards).map((i) => (
        <div key={i} className="sk-block catalog-skeleton-card" />
      ))}
    </div>
  );
}

export function RailSkeleton({ rails = 3, cards = 6 }: { rails?: number; cards?: number }) {
  return (
    <div className="rails" role="status" aria-label="Loading">
      {times(rails).map((rail) => (
        <section key={rail} className="se-rail" aria-hidden="true">
          <div className="sk-block sk-rail-title" />
          <div className="se-rail-row rail-skeleton-row">
            {times(cards).map((card) => (
              <div key={card} className="sk-block sk-rail-card" />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <div className="home-skeleton" role="status" aria-label="Loading">
      <section className="billboard" aria-hidden="true">
        <div className="billboard-bg home-skeleton-billboard-bg" />
        <div className="billboard-shade" />
        <div className="billboard-content">
          <div className="sk-block sk-billboard-title" />
          <div className="sk-meta-chips" aria-hidden="true">
            <div className="sk-block sk-chip" />
            <div className="sk-block sk-chip sk-chip-sm" />
            <div className="sk-block sk-chip sk-chip-sm" />
          </div>
          <div className="sk-block sk-billboard-overview" />
          <div className="billboard-actions">
            <div className="sk-block sk-btn" />
            <div className="sk-block sk-btn sk-btn-wide" />
          </div>
        </div>
      </section>
      <RailSkeleton rails={3} cards={6} />
    </div>
  );
}

export function DetailsSkeleton({ showEpisodes = false }: { showEpisodes?: boolean }) {
  return (
    <div className="details-skeleton" role="status" aria-label="Loading">
      <div className="sk-block sk-details-title" aria-hidden="true" />
      <div className="sk-meta-chips" aria-hidden="true">
        <div className="sk-block sk-chip" />
        <div className="sk-block sk-chip sk-chip-sm" />
        <div className="sk-block sk-chip" />
      </div>
      <div className="sk-block sk-details-overview" aria-hidden="true" />
      <div className="sk-block sk-details-overview" aria-hidden="true" />
      <div className="sk-block sk-details-overview sk-details-overview-short" aria-hidden="true" />
      <div className="details-actions" aria-hidden="true">
        <div className="sk-block sk-btn" />
        <div className="sk-block sk-btn sk-btn-wide" />
      </div>
      {showEpisodes ? <EpisodeListSkeleton /> : null}
    </div>
  );
}

export function DetailsAsideSkeleton() {
  return (
    <aside className="details-aside details-skeleton-aside" aria-hidden="true">
      <div className="details-facts">
        {times(4).map((i) => (
          <div key={i}>
            <div className="sk-block sk-fact-label" />
            <div className={`sk-block sk-fact-value${i === 3 ? " sk-fact-short" : ""}`} />
          </div>
        ))}
      </div>
    </aside>
  );
}

export function EpisodeListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="episode-skeleton" role="status" aria-label="Loading episodes">
      <div className="sk-block sk-episode-heading" aria-hidden="true" />
      <ul className="episode-list episode-skeleton-list" aria-hidden="true">
        {times(rows).map((i) => (
          <li key={i} className="episode-skeleton-row">
            <div className="sk-block sk-episode-thumb" />
            <div className="episode-skeleton-meta">
              <div className="sk-block sk-episode-title" />
              <div className="sk-block sk-episode-sub" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ListSkeleton({ rows = 6, variant = "row" }: { rows?: number; variant?: "row" | "poster" }) {
  return (
    <ul className="list-skeleton" role="status" aria-label="Loading">
      {times(rows).map((i) => (
        <li
          key={i}
          className={`list-skeleton-row${variant === "poster" ? " has-poster" : ""}`}
          aria-hidden="true"
        >
          {variant === "poster" ? <div className="sk-block sk-list-poster" /> : null}
          <div className="list-skeleton-meta">
            <div className="sk-block sk-list-title" />
            <div className="sk-block sk-list-sub" />
          </div>
          <div className="sk-block sk-list-action" />
        </li>
      ))}
    </ul>
  );
}

export function LiveSkeleton({ mode = "channels" }: { mode?: "channels" | "guide" }) {
  if (mode === "guide") {
    return (
      <div className="live-skeleton-guide" role="status" aria-label="Loading guide">
        {times(8).map((i) => (
          <div key={i} className="live-skeleton-guide-row" aria-hidden="true">
            <div className="sk-block sk-live-ch" />
            <div className="sk-block sk-live-track" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="live-skeleton-channels" role="status" aria-label="Loading channels">
      {times(10).map((i) => (
        <div key={i} className="live-skeleton-channel-row" aria-hidden="true">
          <div className="sk-block sk-live-num" />
          <div className="sk-block sk-live-logo" />
          <div className="live-skeleton-channel-meta">
            <div className="sk-block sk-live-name" />
            <div className="sk-block sk-live-now" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BootSkeleton() {
  return (
    <div className="login-page boot-skeleton" role="status" aria-label="Loading Streamerr">
      <div className="sk-block sk-boot-mark" aria-hidden="true" />
      <div className="sk-block sk-boot-line" aria-hidden="true" />
    </div>
  );
}
