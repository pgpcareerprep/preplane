import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode: _mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    // Raise the warning threshold — chunks are intentionally split, not merged
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          // React core + router — loaded on every page
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/react-router") ||
            id.includes("/scheduler/")
          ) return "react-vendor";

          // Data-fetching
          if (id.includes("/@tanstack/")) return "query";

          // Supabase client
          if (id.includes("/@supabase/")) return "supabase";

          // Heavy document processing — only used by DataSources / Import pages
          if (
            id.includes("/pdfjs-dist/") ||
            id.includes("/mammoth/") ||
            id.includes("/xlsx/") ||
            id.includes("/papaparse/")
          ) return "documents";

          // Markdown rendering — only used in Copilot
          if (
            id.includes("/react-markdown/") ||
            id.includes("/remark") ||
            id.includes("/micromark") ||
            id.includes("/mdast") ||
            id.includes("/unified/") ||
            id.includes("/vfile") ||
            id.includes("/hast") ||
            id.includes("/rehype")
          ) return "markdown";

          // Rich-text editor — only used in a few pages
          if (id.includes("/@tiptap/")) return "editor";

          // Charts — only used in Dashboard / Analytics
          if (id.includes("/recharts/") || id.includes("/d3-")) return "charts";

          // Animations
          if (id.includes("/framer-motion/")) return "framer";

          // Drag-and-drop
          if (id.includes("/@dnd-kit/")) return "dnd";

          // Icon library — large but stable; share across all pages
          if (id.includes("/lucide-react/")) return "icons";

          // Radix UI primitives
          if (id.includes("/@radix-ui/")) return "radix";

          // Everything else (date-fns, zod, class-variance-authority, etc.)
          return "vendor";
        },
      },
    },
  },
}));
