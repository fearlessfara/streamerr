import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { configureClient } from "@streamerr/client";
import "@streamerr/ui/styles.css";
import { App } from "./App";
import { FocusGate } from "./components/FocusGate";
import "./app.css";

configureClient({
  baseUrl: "",
  credentials: "include",
  storage: localStorage,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <FocusGate>
          <App />
        </FocusGate>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
