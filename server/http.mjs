import { handleAPI } from "./api.mjs";
import { handleNodeAPI } from "./node-api.mjs";
const nodeWindows = new Map();
function nodeLimited(ip) {
  const now = Date.now();
  for (const [k, v] of nodeWindows) if (v.until < now) nodeWindows.delete(k);
  const w = nodeWindows.get(ip) || { n: 0, until: now + 60000 };
  w.n++;
  nodeWindows.set(ip, w);
  return w.n > 30 || nodeWindows.size > 2000;
}
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
    if (/^\/api\/(dem\/earth|horizons)$/.test(new URL(request.url).pathname)) {
      const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "anon").slice(0, 128);
      if (nodeLimited(ip)) {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Забагато запитів. Спробуй за хвилину." }));
        return;
      }
      const nodeResponse = await handleNodeAPI(request);
      if (nodeResponse) {
        res.writeHead(nodeResponse.status, Object.fromEntries(nodeResponse.headers));
        res.end(Buffer.from(await nodeResponse.arrayBuffer()));
        return;
      }
    }
    const response = await handleAPI(request, {
      ...env,
      RUNTIME: "node-" + process.versions.node,
    });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    if (!res.headersSent)
      res.writeHead(500, { "Content-Type": "application/json" });
    if (!res.writableEnded)
      res.end(JSON.stringify({ error: "Не вдалося обробити запит." }));
  }
}
