import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { FocusProvider } from "@streamerr/ui";

export function FocusGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const disabled = location.pathname === "/play" || location.pathname === "/login";
  return <FocusProvider disabled={disabled}>{children}</FocusProvider>;
}
