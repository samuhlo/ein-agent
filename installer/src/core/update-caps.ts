import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  createReadStream,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  closeSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { UpdateStageError } from "./release-types.ts";

const MAX_REDIRECTS = 5;
// The downloaded asset is a Bun-compiled standalone binary that bundles the
// runtime — the Linux builds are ~90-95 MB and grow over time. This cap must sit
// well ABOVE the largest platform binary or `ein update` fails at asset download
// with "Response exceeds size limit" (64 MB was below the Linux/darwin-x64
// binaries, so update never worked there). Still bounded to reject a runaway
// response.
const MAX_RESPONSE_BYTES = 256 * 1024 * 1024;
// Metadata/checksums are tiny JSON/text — a short deadline fails fast on a dead
// endpoint. The asset is the ~90-95 MB Bun binary: a 15 s total deadline timed
// out mid-download (a 91 MB fetch takes ~40 s even on a fast link, minutes on a
// slow one), so it gets a generous per-call timeout. Callers pass the long one
// for the asset download; everything else uses the short default.
const REQUEST_TIMEOUT_MS = 30_000;
const ASSET_TIMEOUT_MS = 300_000;
const GITHUB_HOSTS = new Set([
  "api.github.com",
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
]);

export type HttpResponse = {
  status: number;
  url: string;
  headers: Record<string, string>;
  body: Uint8Array;
};

export type FileEntry = {
  kind: "file" | "directory" | "symlink" | "other";
  mode: number;
  uid: number;
  dev: number;
};

export type ChildSpawnOptions = { env?: Record<string, string> };

export type HttpGetOptions = { timeoutMs?: number };

export type UpdateCaps = {
  http: { get(url: string, options?: HttpGetOptions): Promise<HttpResponse> };
  hashFile(path: string): Promise<string>;
  fs: {
    createTempDir(prefix: string): string;
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
    exists(path: string): boolean;
    makeDir(path: string): void;
    copyDir(sourcePath: string, destinationPath: string): void;
    removeDir(path: string): void;
    inspect(path: string): FileEntry;
    currentUid(): number;
    createSiblingFile(destinationPath: string): string;
    copyFile(sourcePath: string, destinationPath: string): void;
    chmod(path: string, mode: number): void;
    rename(sourcePath: string, destinationPath: string): void;
    removeFile(path: string): void;
    fsyncDir(path: string): void;
  };
  child: { spawn(command: string, args: string[], options?: ChildSpawnOptions): Promise<{ code: number; stdout: string }> };
  template: {
    deploy(binaryPath: string, agentDir: string): Promise<void>;
    readManifest(agentDir: string): Promise<{ templateVersion?: string } | null>;
  };
  clock: { now(): Date };
  signals: { on(signal: "SIGINT" | "SIGTERM", handler: () => void): () => void };
  output: { write(line: string): void };
};

export function isTrustedReleaseUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && GITHUB_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function assertSafeUrl(raw: string): URL {
  if (!isTrustedReleaseUrl(raw)) throw new Error("Unsafe release URL");
  return new URL(raw);
}

async function defaultHttpGet(raw: string, options?: HttpGetOptions): Promise<HttpResponse> {
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  let url = assertSafeUrl(raw);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/vnd.github+json" },
    });
    const headers = Object.fromEntries(response.headers.entries());
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect response without location");
      if (redirects === MAX_REDIRECTS) throw new Error("Too many redirects");
      url = assertSafeUrl(new URL(location, url).toString());
      continue;
    }
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_RESPONSE_BYTES) throw new Error("Response exceeds size limit");
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength > MAX_RESPONSE_BYTES) throw new Error("Response exceeds size limit");
    return { status: response.status, url: response.url, headers, body };
  }
  throw new Error("Too many redirects");
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk: Buffer) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

export function defaultUpdateCaps(): UpdateCaps {
  return {
    http: { get: defaultHttpGet },
    hashFile: sha256File,
    fs: {
      createTempDir: (prefix) => mkdtempSync(join(tmpdir(), prefix)),
      writeFile: (path, data) => writeFileSync(path, data),
      readFile: (path) => new Uint8Array(readFileSync(path)),
      exists: (path) => existsSync(path),
      makeDir: (path) => mkdirSync(path, { recursive: true }),
      copyDir: (sourcePath, destinationPath) => cpSync(sourcePath, destinationPath, { recursive: true }),
      removeDir: (path) => rmSync(path, { recursive: true, force: true }),
      inspect(path) {
        const entry = lstatSync(path);
        return {
          kind: entry.isFile() ? "file" : entry.isDirectory() ? "directory" : entry.isSymbolicLink() ? "symlink" : "other",
          mode: entry.mode,
          uid: entry.uid,
          dev: entry.dev,
        };
      },
      currentUid: () => process.getuid?.() ?? 0,
      createSiblingFile(destinationPath) {
        const directory = dirname(destinationPath);
        return join(directory, `.${basename(destinationPath)}.ein-candidate-${randomUUID()}`);
      },
      copyFile: (sourcePath, destinationPath) => copyFileSync(sourcePath, destinationPath),
      chmod: (path, mode) => chmodSync(path, mode),
      rename: (sourcePath, destinationPath) => renameSync(sourcePath, destinationPath),
      removeFile: (path) => unlinkSync(path),
      fsyncDir(path) {
        const fd = openSync(path, "r");
        try {
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
      },
    },
    child: {
      async spawn(command, args, options) {
        const childProcess = Bun.spawn([command, ...args], {
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, ...options?.env },
        });
        return { code: await childProcess.exited, stdout: await new Response(childProcess.stdout).text() };
      },
    },
    template: {
      async deploy(binaryPath, agentDir) {
        const result = await Bun.spawn([binaryPath, `--ein-deploy-template=${agentDir}`], { stdout: "pipe", stderr: "pipe" });
        if (await result.exited !== 0) throw new Error("Continuation template deployment failed");
      },
      async readManifest(agentDir) {
        const path = join(agentDir, "template-manifest.json");
        if (!existsSync(path)) return null;
        return JSON.parse(readFileSync(path, "utf8")) as { templateVersion?: string };
      },
    },
    clock: { now: () => new Date() },
    signals: {
      on(signal, handler) {
        process.once(signal, handler);
        return () => process.off(signal, handler);
      },
    },
    output: { write: (line) => console.log(line) },
  };
}

export function stageError(stage: UpdateStageError["stage"], code: string, message: string): UpdateStageError {
  return { stage, code, message };
}

export const updateCapsLimits = { MAX_REDIRECTS, MAX_RESPONSE_BYTES, REQUEST_TIMEOUT_MS, ASSET_TIMEOUT_MS };
