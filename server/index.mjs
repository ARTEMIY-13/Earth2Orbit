import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { serveAPI } from "./http.mjs";
const dev = process.argv.includes("--dev");
const portArg = process.argv.indexOf("--port");
const port = Number(
  process.env.PORT || (portArg >= 0 ? process.argv[portArg + 1] : 3000),
);
const root = resolve("dist/client");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};
const vite = dev
  ? await (
      await import("vite")
    ).createServer({ server: { middlewareMode: true }, appType: "spa" })
  : null;
const server = createServer(async (req, res) => {
  if (req.url?.startsWith("/api/")) {
    await serveAPI(req, res, process.env);
    return;
  }
  if (vite) {
    vite.middlewares(req, res);
    return;
  }
  try {
    const url = new URL(req.url, "http://localhost");
    let file = resolve(root, "." + decodeURIComponent(url.pathname));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (file === root) file = resolve(root, "index.html");
    let found;
    try {
      found = await stat(file);
    } catch {}
    if (!found?.isFile() && !extname(url.pathname)) {
      file = resolve(root, "index.html");
      found = await stat(file);
    }
    if (!found?.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control": file.endsWith(".html")
        ? "no-cache"
        : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    const stream = createReadStream(file);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  } catch {
    res.writeHead(500);
    res.end("Unable to serve this request");
  }
});
server.requestTimeout = 30000;
server.headersTimeout = 10000;
server.listen(port, "0.0.0.0", () =>
  console.log(`ORBITAL React + Node.js listening on ${port}`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () =>
    server.close(async () => {
      await vite?.close();
      process.exit(0);
    }),
  );
