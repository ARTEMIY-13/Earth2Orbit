import { handleAPI } from "./api.mjs";
export async function serveAPI(req, res, env = {}) {
  try {
    let length = 0;
    const chunks = [];
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 16000) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Запит завеликий." }));
        return;
      }
      chunks.push(chunk);
    }
    const host = req.headers.host || "localhost";
    const origin =
      (req.headers["x-forwarded-proto"] === "https" ? "https" : "http") +
      "://" +
      host;
    const bytes = Buffer.concat(chunks);
    const request = new Request(new URL(req.url, origin), {
      method: req.method,
      headers: req.headers,
      ...(bytes.length ? { body: bytes } : {}),
    });
    const response = await handleAPI(request, {
      ...env,
      RUNTIME: "node-" + process.versions.node,
    });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    if (!res.headersSent)
      res.writeHead(500, { "Content-Type": "application/json" });
    if (!res.writableEnded)
      res.end(JSON.stringify({ error: "Не вдалося обробити запит." }));
  }
}
