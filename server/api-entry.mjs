import { createServer } from "node:http";
import { serveAPI } from "./http.mjs";
const server = createServer((req, res) => serveAPI(req, res, process.env));
server.requestTimeout = 30000;
server.headersTimeout = 10000;
server.listen(Number(process.env.PORT || 3000), "0.0.0.0", () =>
  console.log("ORBITAL Node.js API ready"),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
