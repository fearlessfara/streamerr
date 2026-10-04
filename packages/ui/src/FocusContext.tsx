import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type FocusMap = Map<string, HTMLElement>;

interface FocusContextValue {
  focusedId: string | null;
  disabled: boolean;
  register: (id: string, el: HTMLElement | null) => void;
  focus: (id: string) => void;
  move: (direction: "up" | "down" | "left" | "right") => void;
}

const FocusCtx = createContext<FocusContextValue | null>(null);

function center(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, r };
}

export function FocusProvider({
  children,
  disabled = false,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  const nodes = useRef<FocusMap>(new Map());
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const register = useCallback((id: string, el: HTMLElement | null) => {
    if (!el) {
      nodes.current.delete(id);
      return;
    }
    nodes.current.set(id, el);
  }, []);

  const focus = useCallback((id: string) => {
    const el = nodes.current.get(id);
    if (!el) return;
    setFocusedId(id);
    el.focus({ preventScroll: false });
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, []);

  const move = useCallback(
    (direction: "up" | "down" | "left" | "right") => {
      const currentId = focusedId;
      const entries = [...nodes.current.entries()];
      if (!entries.length) return;

      const currentEl = currentId ? nodes.current.get(currentId) : null;
      if (!currentEl) {
        focus(entries[0]![0]);
        return;
      }

      const c = center(currentEl);
      let bestId: string | null = null;
      let bestScore = Number.POSITIVE_INFINITY;

      for (const [id, el] of entries) {
        if (id === currentId) continue;
        const t = center(el);
        const dx = t.x - c.x;
        const dy = t.y - c.y;

        const aligned =
          direction === "left"
            ? dx < -8
            : direction === "right"
              ? dx > 8
              : direction === "up"
                ? dy < -8
                : dy > 8;
        if (!aligned) continue;

        const primary =
          direction === "left" || direction === "right" ? Math.abs(dx) : Math.abs(dy);
        const secondary =
          direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
        const score = primary + secondary * 2.5;
        if (score < bestScore) {
          bestScore = score;
          bestId = id;
        }
      }

      if (bestId) focus(bestId);
    },
    [focus, focusedId],
  );

  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement | null)?.isContentEditable) return;

      const key = e.key;
      if (key === "ArrowUp") {
        e.preventDefault();
        move("up");
      } else if (key === "ArrowDown") {
        e.preventDefault();
        move("down");
      } else if (key === "ArrowLeft") {
        e.preventDefault();
        move("left");
      } else if (key === "ArrowRight") {
        e.preventDefault();
        move("right");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled, move]);

  const value = useMemo(
    () => ({ focusedId, disabled, register, focus, move }),
    [focusedId, disabled, register, focus, move],
  );

  return <FocusCtx.Provider value={value}>{children}</FocusCtx.Provider>;
}

export function useFocus() {
  const ctx = useContext(FocusCtx);
  if (!ctx) throw new Error("useFocus requires FocusProvider");
  return ctx;
}

export function useFocusable(id: string, autoFocus = false) {
  const { register, focus, focusedId, disabled } = useFocus();
  const ref = useCallback(
    (el: HTMLElement | null) => {
      register(id, el);
    },
    [id, register],
  );

  useEffect(() => {
    if (autoFocus && !disabled) focus(id);
  }, [autoFocus, disabled, focus, id]);

  return {
    ref,
    tabIndex: 0,
    "data-focused": focusedId === id ? "true" : "false",
    onFocus: () => {
      if (!disabled) focus(id);
    },
    className: "se-focusable",
  };
}
