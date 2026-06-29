import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode: _mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "PrepLane",
        short_name: "PrepLane",
        description: "Career prep and placement ops",
        theme_color: "#0f172a",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/quick",
        icons: [
          { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
          { src: "/favicon.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        navigateFallbackDenylist: [/^\/api/, /^\/rest/, /^\/auth/, /^\/functions/],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    chunkSizeWarningLimit: 1000,
    ...( _mode === "production" ? { esbuild: { drop: ["console"] as ("console")[] } } : {}),
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep Recharts, es-toolkit, and d3 in one stable chunk so the
          // es-toolkit iteratee/comparator references resolve at the same
          // evaluation time. Splitting them across dynamic chunks causes
          // "t is not a function" in minified Recharts 3.x builds.
          if (
            id.includes("recharts") ||
            id.includes("es-toolkit") ||
            id.includes("/d3-") ||
            id.includes("/d3/")
          ) {
            return "charts-vendor";
          }
        },
      },
    },
  },
}));
