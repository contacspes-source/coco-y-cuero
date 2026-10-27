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
    // dos páginas: la tienda y los términos de compra
    rollupOptions: {
      input: {
        tienda: fileURLToPath(new URL("index.html", import.meta.url)),
        terminos: fileURLToPath(new URL("terminos.html", import.meta.url)),
      },
    },
  },
  server: { port: 5174 },
});
