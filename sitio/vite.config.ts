import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// El sitio público se compila a dist/ (raíz de cocoycuero.com).
// publico/ se copia tal cual: fotos, logos y favicon.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "/",
  publicDir: fileURLToPath(new URL("../publico", import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL("../dist", import.meta.url)),
    emptyOutDir: true,
    target: "es2022",
  },
  server: { port: 5174 },
});
