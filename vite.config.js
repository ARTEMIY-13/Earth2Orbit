import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// `vite build --mode pages` -> GitHub Pages (підкаталог + API в браузері).
// Звичайний `vite build` -> Node/Railway, база "/".
export default defineConfig(({ mode }) => ({
  base: mode === "pages" ? "/Earth2Orbit/" : "/",
  plugins: [react()],
  publicDir: "public",
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
  },
  server: { host: "0.0.0.0" },
}));
