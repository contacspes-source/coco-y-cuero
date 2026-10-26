import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const raizRepo = fileURLToPath(new URL("..", import.meta.url));

// El panel se compila a dist/panel y se sirve en cocoycuero.com/panel/.
// El sitio público lo copia scripts/copiar-sitio.mjs a dist/ tal cual.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "/panel/",
  publicDir: false,
  build: {
    outDir: fileURLToPath(new URL("../dist/panel", import.meta.url)),
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
  },
  server: {
    port: 5173,
    // en desarrollo, /assets/… se sirve desde el sitio público
    fs: { allow: [raizRepo] },
    proxy: {},
  },
  plugins: [
    {
      name: "assets-del-sitio-en-desarrollo",
      configureServer(servidor) {
        servidor.middlewares.use("/assets", (req, res, siguiente) => {
          void import("node:fs").then(({ createReadStream, existsSync }) => {
            const ruta = `${raizRepo}assets${decodeURIComponent((req.url ?? "").split("?")[0] ?? "")}`;
            if (!existsSync(ruta)) return siguiente();
            createReadStream(ruta).pipe(res);
          });
        });
      },
    },
  ],
});
