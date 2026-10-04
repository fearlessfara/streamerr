import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@streamerr/ui/styles.css",
        replacement: path.resolve(__dirname, "../../packages/ui/src/styles.css"),
      },
      {
        find: /^@streamerr\/ui$/,
        replacement: path.resolve(__dirname, "../../packages/ui/src/index.ts"),
      },
      {
        find: /^@streamerr\/shared$/,
        replacement: path.resolve(__dirname, "../../packages/shared/src/index.ts"),
      },
    ],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.STREAMERR_API_PROXY ?? "http://localhost:8787",
        changeOrigin: true,
        // Live MPEG-TS must not be buffered by the Vite proxy.
        configure: (proxy) => {
          proxy.on("proxyReq", (_proxyReq, req) => {
            if (req.url?.includes("/playback/dispatcharr/live/")) {
              // Prefer streaming; avoid compression transforming TS packets.
              req.headers["accept-encoding"] = "identity";
            }
          });
          proxy.on("proxyRes", (proxyRes, req) => {
            if (req.url?.includes("/playback/dispatcharr/live/")) {
              proxyRes.headers["cache-control"] = "no-store, no-transform";
              proxyRes.headers["x-accel-buffering"] = "no";
              delete proxyRes.headers["content-length"];
            }
          });
        },
      },
    },
  },
});
