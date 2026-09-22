// =============================================================================
// TEST-ONLY HELPERS :: FAKE UPDATE CAPABILITIES
// -----------------------------------------------------------------------------
// Mantiene `FakeCapsOptions` y `fakeUpdateCaps` fuera de la superficie de
// producción (`installer/src/core/update-caps.ts`). Los modulos runtime
// nunca deben importar nada desde `tests/`.
// =============================================================================

import { createHash } from "node:crypto";
import type { UpdateCaps } from "../../installer/src/core/update-caps.ts";

// `fs` is partial one level deeper: callers routinely override two or three
// operations, and requiring the whole surface forces unrelated boilerplate.
export type FakeCapsOptions = Omit<Partial<UpdateCaps>, "fs"> & {
  fs?: Partial<UpdateCaps["fs"]>;
  files?: Map<string, Uint8Array>;
  removedDirs?: string[];
};

export function fakeUpdateCaps(options: FakeCapsOptions = {}): UpdateCaps {
  const files = options.files ?? new Map<string, Uint8Array>();
  const directories = new Set<string>();
  const directoryExists = (path: string): boolean => directories.has(path)
    || [...files.keys()].some((file) => file.startsWith(`${path}/`));
  let counter = 0;
  const fallback: UpdateCaps = {
    http: { get: async () => { throw new Error("Unscripted HTTP request"); } },
    hashFile: async (path) => createHash("sha256").update(files.get(path) ?? new Uint8Array()).digest("hex"),
    fs: {
      createTempDir: (prefix) => `/fake/${prefix}${counter++}`,
      writeFile: (path, data) => files.set(path, data),
      readFile: (path) => {
        const data = files.get(path);
        if (!data) throw new Error(`Missing fake file: ${path}`);
        return data;
      },
      exists: (path) => files.has(path) || directoryExists(path),
      makeDir: (path) => directories.add(path),
      listDir: (path) => [...new Set([...directories, ...files.keys()]
        .filter((entry) => entry.startsWith(`${path}/`))
        .map((entry) => entry.slice(path.length + 1).split("/")[0]!)
        .filter(Boolean))].sort(),
      copyDir: () => undefined,
      removeDir: (path) => {
        options.removedDirs?.push(path);
        for (const file of [...files.keys()]) if (file === path || file.startsWith(`${path}/`)) files.delete(file);
        for (const directory of [...directories]) if (directory === path || directory.startsWith(`${path}/`)) directories.delete(directory);
      },
      inspect: (path) => ({ kind: files.has(path) ? "file" : "directory", mode: 0o755, uid: 0, dev: 1 }),
      currentUid: () => 0,
      createSiblingFile: (destinationPath) => `${destinationPath}.candidate-${counter++}`,
      copyFile: (sourcePath, destinationPath) => {
        const source = files.get(sourcePath);
        if (!source) throw new Error(`Missing fake file: ${sourcePath}`);
        files.set(destinationPath, source);
      },
      chmod: () => undefined,
      rename: (sourcePath, destinationPath) => {
        const source = files.get(sourcePath);
        if (!source) throw new Error(`Missing fake file: ${sourcePath}`);
        files.set(destinationPath, source);
        files.delete(sourcePath);
      },
      removeFile: (path) => files.delete(path),
      fsyncDir: () => undefined,
    },
    child: { spawn: async () => ({ code: 0, stdout: "" }) },
    template: {
      deploy: async () => undefined,
      readManifest: async () => null,
      queryInventory: async () => ({ code: 1, stdout: "" }),
    },
    clock: { now: () => new Date(0) },
    signals: { on: () => () => undefined },
    output: { write: () => undefined },
  };
  return {
    ...fallback,
    ...options,
    http: options.http ?? fallback.http,
    fs: { ...fallback.fs, ...options.fs },
    child: options.child ?? fallback.child,
    template: options.template ?? fallback.template,
    clock: options.clock ?? fallback.clock,
    signals: options.signals ?? fallback.signals,
    output: options.output ?? fallback.output,
    hashFile: options.hashFile ?? fallback.hashFile,
  };
}
