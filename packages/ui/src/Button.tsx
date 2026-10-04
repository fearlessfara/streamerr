import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { useFocusable } from "./FocusContext.js";

export function Button({
  id,
  children,
  onClick,
  variant = "primary",
  autoFocus,
  disabled,
}: {
  id: string;
  children: ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary" | "ghost";
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const focusProps = useFocusable(id, autoFocus);
  const onKeyDown = (e: KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  const variantStyle =
    variant === "primary" ? primary : variant === "ghost" ? ghost : secondary;

  return (
    <button
      type="button"
      {...focusProps}
      data-variant={variant}
      className={`se-focusable se-btn ${focusProps.className}`}
      onClick={disabled ? undefined : onClick}
      onKeyDown={onKeyDown}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      style={{
        ...base,
        ...variantStyle,
        ...(disabled ? { opacity: 0.55, cursor: "default" } : null),
      }}
    >
      {children}
    </button>
  );
}

const base: CSSProperties = {
  borderRadius: 4,
  border: "0",
  padding: "0.55rem 1.4rem",
  fontWeight: 700,
  letterSpacing: "0.01em",
  cursor: "pointer",
  minWidth: 110,
  fontSize: "1rem",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.55rem",
  minHeight: 42,
};

const primary: CSSProperties = {
  background: "#ffffff",
  color: "#141414",
};

const secondary: CSSProperties = {
  background: "rgba(109, 109, 110, 0.7)",
  color: "#ffffff",
};

const ghost: CSSProperties = {
  background: "transparent",
  color: "#ffffff",
  border: "1px solid rgba(255,255,255,0.55)",
};
