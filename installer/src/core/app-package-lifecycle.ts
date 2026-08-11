import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, normalize } from "node:path";

export type AppPackagePaths = Readonly<{ root: string; commands: readonly string[]; package?: boolean }>;

function metadata(path: string): ReturnType<typeof lstatSync> | undefined {
  try { return lstatSync(path); } catch { return undefined; }
}

function ownedPaths(options: AppPackagePaths): string[] {
  if (!isAbsolute(options.root) || normalize(options.root) !== options.root) throw new Error("unsafe app package root");
  if (options.commands.some((name) => !name || basename(name) !== name)) throw new Error("unsafe app command name");
  const paths = options.commands.map((name) => join(options.root, name));
  const packageRoot = join(options.root, ".ein-dashboard");
  const packageMetadata = metadata(packageRoot);
  if (options.package !== false && packageMetadata) {
    if (packageMetadata.isSymbolicLink()) throw new Error("refusing symlink dashboard package root");
    paths.push(...readdirSync(packageRoot)
      .filter((name) => name === "current.json" || name === "releases" || name.startsWith(".staging-"))
      .map((name) => join(packageRoot, name)));
  }
  return paths;
}

function assertSafe(path: string): void {
  const entry = metadata(path);
  if (!entry) return;
  if (entry.isSymbolicLink()) throw new Error(`refusing symlink in app package: ${path}`);
  if (entry.isDirectory()) for (const name of readdirSync(path)) assertSafe(join(path, name));
}

function inspect(options: AppPackagePaths): string[] {
  if (metadata(options.root)?.isSymbolicLink()) throw new Error("refusing symlink app package root");
  const paths = ownedPaths(options);
  for (const path of paths) assertSafe(path);
  return paths;
}

/** Remove only installer-owned app/package entries; unrelated runtime data survives. */
export function removeAppPackage(options: AppPackagePaths): number {
  const paths = inspect(options);
  let removed = 0;
  for (const path of paths) {
    if (!metadata(path)) continue;
    rmSync(path, { recursive: true, force: true });
    removed += 1;
  }
  const packageRoot = join(options.root, ".ein-dashboard");
  if (existsSync(packageRoot) && readdirSync(packageRoot).length === 0) {
    rmSync(packageRoot, { recursive: true, force: true });
  }
  return removed;
}

export function appPackageHash(options: AppPackagePaths): string {
  const hash = createHash("sha256");
  for (const path of inspect(options).sort()) {
    if (!metadata(path)) continue;
    const walk = (entry: string): void => {
      const metadata = lstatSync(entry);
      hash.update(entry.slice(options.root.length));
      if (metadata.isDirectory()) for (const name of readdirSync(entry).sort()) walk(join(entry, name));
      else hash.update(readFileSync(entry));
    };
    walk(path);
  }
  return hash.digest("hex");
}

export function copyAppPackage(options: AppPackagePaths, destination: string): void {
  for (const path of inspect(options)) {
    if (!metadata(path)) continue;
    const relative = path.slice(options.root.length + 1);
    mkdirSync(dirname(join(destination, relative)), { recursive: true });
    cpSync(path, join(destination, relative), { recursive: true });
  }
}

export function restoreAppPackage(source: string, options: AppPackagePaths): void {
  const sourceOptions = { ...options, root: source };
  if (metadata(source)) appPackageHash(sourceOptions);
  const rollback = mkdtempSync(join(tmpdir(), "ein-app-rollback-"));
  copyAppPackage(options, rollback);
  try {
    removeAppPackage(options);
    if (!metadata(source)) return;
    mkdirSync(options.root, { recursive: true });
    copyAppPackage(sourceOptions, options.root);
  } catch (error) {
    removeAppPackage(options);
    mkdirSync(options.root, { recursive: true });
    copyAppPackage({ ...options, root: rollback }, options.root);
    throw error;
  } finally {
    rmSync(rollback, { recursive: true, force: true });
  }
}
