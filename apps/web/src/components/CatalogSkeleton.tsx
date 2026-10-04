export function CatalogSkeleton({ cards = 8 }: { cards?: number }) {
  return (
    <div className="catalog-skeleton" aria-hidden="true">
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="catalog-skeleton-card" />
      ))}
    </div>
  );
}
