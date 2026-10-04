import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export function Rail({ title, children }: { title: string; children: ReactNode }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateChevrons = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanLeft(el.scrollLeft > 8);
    setCanRight(max > 8 && el.scrollLeft < max - 8);
  }, []);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    updateChevrons();
    el.addEventListener("scroll", updateChevrons, { passive: true });
    const ro = new ResizeObserver(updateChevrons);
    ro.observe(el);
    window.addEventListener("resize", updateChevrons);
    return () => {
      el.removeEventListener("scroll", updateChevrons);
      ro.disconnect();
      window.removeEventListener("resize", updateChevrons);
    };
  }, [updateChevrons, children]);

  const scrollByPage = (dir: -1 | 1) => {
    const el = rowRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <section className="se-rail">
      <h2 className="se-rail-title">{title}</h2>
      <div className="se-rail-track">
        <button
          type="button"
          className={`se-rail-chevron left${canLeft ? " is-visible" : ""}`}
          aria-label={`Scroll ${title} left`}
          tabIndex={-1}
          onClick={() => scrollByPage(-1)}
        >
          ‹
        </button>
        <div ref={rowRef} className="se-rail-row">
          {children}
        </div>
        <button
          type="button"
          className={`se-rail-chevron right${canRight ? " is-visible" : ""}`}
          aria-label={`Scroll ${title} right`}
          tabIndex={-1}
          onClick={() => scrollByPage(1)}
        >
          ›
        </button>
      </div>
    </section>
  );
}
