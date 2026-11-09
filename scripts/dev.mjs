// `npm run dev`: builds and runs the Wisp server on :8080 and the Vite dev server
// on :5173 (which proxies /wisp/ to it). Ctrl+C stops both.
import { spawn } from "node:child_process";

const run = (cmd, args, name, env = {}) => {
  const child = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, ...env } });
  child.on("exit", (code) => {
    console.log(`[dev] ${name} exited with code ${code}`);
    process.exit(code ?? 0);
  });
  return child;
};

const build = spawn("npm", ["run", "build", "-w", "server"], { stdio: "inherit", shell: process.platform === "win32" });
build.on("exit", (code) => {
  if (code !== 0) process.exit(code ?? 1);
  const server = run("node", ["server/dist/index.js"], "wisp server", { PORT: "8080", HOST: "127.0.0.1" });
  const web = run("npm", ["run", "dev", "-w", "web"], "vite");
  const stop = () => {
    server.kill("SIGTERM");
    web.kill("SIGTERM");
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
});
