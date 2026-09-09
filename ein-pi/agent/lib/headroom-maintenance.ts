import { accessSync, constants, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync, openSync, closeSync } from "node:fs";
import { join, relative } from "node:path";
import { randomUUID } from "node:crypto";
import { HeadroomService, headroomServiceHome, inspectHeadroomService } from "./headroom-service.ts";
import { headroomConfig } from "./headroom.ts";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { verifyHeadroomCompatibility } from "./headroom-compatibility.ts";

export const HEADROOM_RELEASE = "0.37.0";
export const HEADROOM_PYTHON = "3.14";
const PROFILE = "ein-verified-v1";

export function inspectManagedHeadroom(home: string): { version: string; python?: string; profile?: string } | undefined {
  try {
    const target = realpathSync(join(home, "active"));
    const path = relative(realpathSync(join(home, "versions")), target);
    if (!path || path.startsWith("..") || !existsSync(join(target, "venv/bin/headroom"))) return;
    accessSync(join(target, "venv/bin/headroom"), constants.X_OK);
    const evidence = JSON.parse(readFileSync(join(target, "verified.json"), "utf8"));
    if (evidence.pass !== true || !Array.isArray(evidence.results) || evidence.results.length < 3 || !evidence.results.every((row: { pass?: boolean }) => row.pass === true)) return;
    const version = readFileSync(join(target, "selected-version.txt"), "utf8").trim();
    if (evidence.service !== version || !/^\d+\.\d+\.\d+/.test(version)) return;
    let profile: { python?: string; profile?: string } = {};
    try { profile = JSON.parse(readFileSync(join(target, "installation.json"), "utf8")); } catch { /* Older managed installs migrate once. */ }
    return { version, python: profile.python, profile: profile.profile };
  } catch { return; }
}

export function selectHeadroomVersion(home: string, candidate: string): void {
  const versions = realpathSync(join(home, "versions")), target = realpathSync(candidate);
  const path = relative(versions, target);
  if (!path || path.startsWith("..") || !existsSync(join(target, "venv/bin/headroom")) || !existsSync(join(target, "verified.json"))) throw new Error("Candidate is not a verified local installation");
  const evidence = JSON.parse(readFileSync(join(target, "verified.json"), "utf8"));
  if (evidence.pass !== true || !Array.isArray(evidence.results) || evidence.results.length < 3 || !evidence.results.every((row: { pass?: boolean }) => row.pass === true)) throw new Error("Candidate compatibility verification failed");
  const select = (name: string, value: string) => { const tmp = join(home, `${name}-${randomUUID()}`); symlinkSync(value, tmp); try { renameSync(tmp, join(home, name)); } finally { if (existsSync(tmp)) unlinkSync(tmp); } };
  if (existsSync(join(home, "active"))) select("previous", readlinkSync(join(home, "active")));
  select("active", target);
}

export function acquireHeadroomMaintenanceLock(home: string): () => void {
  const lock = join(home, "maintenance.lock"), owner = join(lock, "owner.json"), token = randomUUID();
  try { mkdirSync(lock); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST" || !lstatSync(lock).isDirectory()) throw error;
    if (readdirSync(lock).join(",") !== "owner.json" || !lstatSync(owner).isFile()) throw new Error(`Unknown maintenance lock contents: ${lock}`);
    const prior = JSON.parse(readFileSync(owner, "utf8"));
    if (!Number.isSafeInteger(prior.pid) || prior.pid <= 0) throw new Error(`Invalid maintenance lock: ${lock}`);
    let alive = true;
    try { process.kill(prior.pid, 0); } catch (probe) { if ((probe as NodeJS.ErrnoException).code === "ESRCH") alive = false; }
    if (alive) throw new Error(`Headroom maintenance already running (pid ${prior.pid})`);
    // Only remove this known dead owner's metadata, never recursively delete a
    // lock containing unknown files. A concurrent contender may win: then stop.
    unlinkSync(owner); rmdirSync(lock); mkdirSync(lock);
  }
  writeFileSync(owner, JSON.stringify({ pid: process.pid, token }), { mode: 0o600, flag: "wx" });
  return () => {
    if (JSON.parse(readFileSync(owner, "utf8")).token !== token) throw new Error("Maintenance lock ownership changed");
    unlinkSync(owner); rmdirSync(lock);
  };
}

async function unusedPort(): Promise<number> {
  const server = createServer();
  return new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => { const port = (server.address() as {port: number}).port; server.close((error) => error ? reject(error) : resolve(port)); }); });
}

export async function maintainHeadroom(command: "update" | "rollback", version?: string, environment: NodeJS.ProcessEnv = process.env, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  if (command === "update" && (!version || !/^\d+\.\d+\.\d+(?:[a-z0-9.-]+)?$/.test(version))) throw new Error("Specify a release version, e.g. /ein:headroom update 0.37.0");
  const home = headroomServiceHome(environment); mkdirSync(home, { recursive: true });
  const release = acquireHeadroomMaintenanceLock(home);
  let service: HeadroomService | undefined;
  const abortService = () => { void service?.stop(); };
  signal?.addEventListener("abort", abortService, { once: true });
  try {
    if (command === "rollback") { selectHeadroomVersion(home, realpathSync(join(home, "previous"))); return "Previous verified version selected for the next service start."; }
    const installed = inspectManagedHeadroom(home);
    if (installed && installed.version === version && installed.python === HEADROOM_PYTHON && installed.profile === PROFILE) return `Headroom ${version} ya está verificado con Python ${HEADROOM_PYTHON}; no se crea otra copia.`;
    const candidate = join(home, "versions", `${version}-${randomUUID()}`); mkdirSync(candidate, { recursive: true });
    let step = 0;
    const run = async (args: [string, ...string[]]) => {
      signal?.throwIfAborted();
      const log = join(candidate, `step-${++step}.log`), fd = openSync(log, "w", 0o600);
      try {
        await new Promise<void>((resolve, reject) => {
          const installEnv: NodeJS.ProcessEnv = {};
          for (const key of ["PATH", "HOME", "TMPDIR", "LANG", "SSL_CERT_FILE", "SSL_CERT_DIR", "SYSTEMROOT", "UV_CACHE_DIR", "UV_PYTHON_INSTALL_DIR"]) if (environment[key]) installEnv[key] = environment[key];
          const child = spawn(args[0], args.slice(1), { env: installEnv, stdio: ["ignore", fd, fd] });
          const abort = () => child.kill("SIGKILL"); signal?.addEventListener("abort", abort, { once: true });
          const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`Candidate timeout; current version unchanged. See ${log}`)); }, 180_000);
          child.once("error", (error) => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(error); });
          child.once("exit", (code) => { clearTimeout(timer); signal?.removeEventListener("abort", abort); code === 0 ? resolve() : reject(new Error(`Candidate rejected; current version unchanged. See ${log}`)); });
        });
      } finally { closeSync(fd); }
    };
    const managedUv = join(home, "tools", "uv");
    const uv = existsSync(managedUv) ? managedUv : "uv";
    await run([uv, "venv", "--python", HEADROOM_PYTHON, join(candidate, "venv")]);
    await run([uv, "pip", "install", "--python", join(candidate, "venv/bin/python"), `headroom-ai[proxy]==${version}`]);
    signal?.throwIfAborted();
    service = new HeadroomService({ ...environment, EIN_HEADROOM_BIN: join(candidate, "venv/bin/headroom"), EIN_HEADROOM_SERVICE_DIR: join(candidate, "service") });
    const endpoint = `http://127.0.0.1:${await unusedPort()}`, config = headroomConfig({ EIN_HEADROOM_MODE: "on", EIN_HEADROOM_URL: endpoint, EIN_HEADROOM_TIMEOUT_MS: "5000" });
    const startup = await service.start(config), health = await inspectHeadroomService(config);
    if (!service.owned || health.pid !== service.ownedPid || health.version !== version) throw new Error(`Candidate endpoint identity mismatch; current version unchanged. ${startup}`);
    const result = await verifyHeadroomCompatibility(config);
    writeFileSync(join(candidate, "verified.json"), JSON.stringify(result, null, 2) + "\n");
    if (!result.pass) throw new Error(`Compatibility check failed; current version unchanged. See ${candidate}/verified.json`);
    await service.stop();
    signal?.throwIfAborted();
    writeFileSync(join(candidate, "selected-version.txt"), `${version}\n`);
    writeFileSync(join(candidate, "installation.json"), JSON.stringify({ version, python: HEADROOM_PYTHON, profile: PROFILE }) + "\n");
    selectHeadroomVersion(home, candidate);
    return `Headroom ${version} verified and selected for the next service start. Running sessions were not changed; the previous managed version is retained for rollback.`;
  } finally { signal?.removeEventListener("abort", abortService); await service?.stop(); release(); }
}
