import { spawn } from "node:child_process";
const child = spawn(
  process.execPath,
  ["server/index.mjs", "--dev", ...process.argv.slice(2)],
  { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
