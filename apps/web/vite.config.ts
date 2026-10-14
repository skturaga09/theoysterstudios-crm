import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// `vite build --mode preview` → one self-contained HTML file (for sharing a demo link).
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === "preview" ? [viteSingleFile()] : [])],
  server: { port: 5173, proxy: { "/api": "http://localhost:8787" } },
  build: { target: "es2022", outDir: mode === "preview" ? "dist-preview" : "dist" },
}));
