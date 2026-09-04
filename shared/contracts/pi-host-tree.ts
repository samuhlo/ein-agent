// =============================================================================
// PI HOST TREE
// El manifiesto global de bun fijó @earendil-works/pi-agent-core, pi-ai y
// pi-tui a ^0.78.0. Sobre 0.x eso es >=0.78.0 <0.79.0: nunca podían subir con
// el host en 0.85.0. Ningún doctor lo vio porque ambos comprobaban forma de
// versión, no satisfacción de rango, contra roots distintos del árbol real
// del host. Este módulo lee ese árbol del disco (offline, sin resolver
// módulos: los paquetes son ESM puro y require.resolve da falso negativo) y
// diagnostica — nunca repara.
// =============================================================================

import { readFileSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";

const PI_HOST_PACKAGE = "@earendil-works/pi-coding-agent";
const REPAIR_TAG = "latest";

export type PiHostTreeFailure = {
  package: string;
  reason: string;
  requiredRange: string | null;
  installedVersion: string | null;
  repairCommand: string;
};

export type PiHostTreeVerdict =
  | { coherent: true }
  | { coherent: false; failures: PiHostTreeFailure[] };

function repairCommandFor(packageName: string): string {
  return `bun install -g ${packageName}@${REPAIR_TAG}`;
}

// GUARD -> Un manifiesto ilegible o malformado es fallo declarado, nunca un
// "no aplica" silencioso que deje pasar el árbol roto.
function rootUnresolvedFailure(): PiHostTreeFailure {
  return {
    package: PI_HOST_PACKAGE,
    reason: "no se pudo determinar el root de instalación del host",
    requiredRange: null,
    installedVersion: null,
    repairCommand: repairCommandFor(PI_HOST_PACKAGE),
  };
}

// -----------------------------------------------------------------------------
// Resolución del root: desde un ancla ya resuelta (binario o bundle del host),
// realpath y última aparición de "node_modules" en la ruta. bun instala los
// paquetes @earendil-works/* planos en ese mismo node_modules (medido).
// -----------------------------------------------------------------------------

export type ResolvePiHostRootDeps = {
  realpath?: (path: string) => string;
};

export function resolvePiHostRoot(
  anchor: string | null,
  deps: ResolvePiHostRootDeps = {},
): string | null {
  if (!anchor) return null;
  const realpath = deps.realpath ?? ((path: string) => realpathSync(path));
  let resolved: string;
  try {
    resolved = realpath(anchor);
  } catch {
    return null;
  }
  const segments = resolved.split(sep);
  const lastIndex = segments.lastIndexOf("node_modules");
  if (lastIndex === -1) return null;
  return segments.slice(0, lastIndex + 1).join(sep) || sep;
}

// -----------------------------------------------------------------------------
// Comparador de rangos: propio y deliberadamente estrecho. Solo ^x.y.z (con
// semántica npm real sobre 0.x) y x.y.z exacto. Cualquier otra forma es
// "unknown" -> fallo declarado (R4), nunca verde por defecto.
// -----------------------------------------------------------------------------

const EXACT_VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const CARET_RANGE = /^\^(\d+)\.(\d+)\.(\d+)$/;
const EXACT_RANGE = /^(\d+)\.(\d+)\.(\d+)$/;

type VersionTuple = readonly [number, number, number];

function parseVersionTuple(version: string): VersionTuple | null {
  const match = EXACT_VERSION.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareTuples([a0, a1, a2]: VersionTuple, [b0, b1, b2]: VersionTuple): number {
  if (a0 !== b0) return a0 - b0;
  if (a1 !== b1) return a1 - b1;
  return a2 - b2;
}

export type RangeSatisfaction = boolean | "unknown";

export function satisfiesRange(range: string, installedVersion: string): RangeSatisfaction {
  const installed = parseVersionTuple(installedVersion);
  if (!installed) return "unknown";

  const caret = CARET_RANGE.exec(range);
  if (caret) {
    const x = Number(caret[1]);
    const y = Number(caret[2]);
    const z = Number(caret[3]);
    const lower: VersionTuple = [x, y, z];
    // La semántica del bug: sobre 0.x el techo es el siguiente minor, no el
    // siguiente major.
    const upper: VersionTuple = x > 0 ? [x + 1, 0, 0] : y > 0 ? [0, y + 1, 0] : [0, 0, z + 1];
    return compareTuples(installed, lower) >= 0 && compareTuples(installed, upper) < 0;
  }

  if (EXACT_RANGE.test(range)) {
    return range === installedVersion;
  }

  return "unknown";
}

// -----------------------------------------------------------------------------
// Lectura de manifiestos y veredicto.
// -----------------------------------------------------------------------------

type Manifest = { dependencies?: Record<string, unknown>; version?: unknown };

export type ReadManifestFile = (path: string) => string | null;

function defaultReadManifestFile(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function parseManifest(raw: string | null): Manifest | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as Manifest;
  } catch {
    return null;
  }
}

export type EvaluatePiHostTreeDeps = {
  readManifestFile?: ReadManifestFile;
};

export function evaluatePiHostTree(
  nodeModulesRoot: string | null,
  deps: EvaluatePiHostTreeDeps = {},
): PiHostTreeVerdict {
  if (!nodeModulesRoot) {
    return { coherent: false, failures: [rootUnresolvedFailure()] };
  }

  const readManifestFile = deps.readManifestFile ?? defaultReadManifestFile;
  const hostManifestPath = join(nodeModulesRoot, ...PI_HOST_PACKAGE.split("/"), "package.json");
  const host = parseManifest(readManifestFile(hostManifestPath));
  if (!host) {
    return {
      coherent: false,
      failures: [
        {
          package: PI_HOST_PACKAGE,
          reason: "manifiesto del host ilegible o malformado",
          requiredRange: null,
          installedVersion: null,
          repairCommand: repairCommandFor(PI_HOST_PACKAGE),
        },
      ],
    };
  }

  const declared = host.dependencies ?? {};
  const failures: PiHostTreeFailure[] = [];

  for (const [name, rawRange] of Object.entries(declared)) {
    if (!name.startsWith("@earendil-works/")) continue;

    const siblingPath = join(nodeModulesRoot, ...name.split("/"), "package.json");
    const sibling = parseManifest(readManifestFile(siblingPath));
    const installedVersion = typeof sibling?.version === "string" ? sibling.version : null;
    const range = typeof rawRange === "string" ? rawRange : null;

    if (range === null) {
      failures.push({
        package: name,
        reason: "rango declarado no comprendido",
        requiredRange: null,
        installedVersion,
        repairCommand: repairCommandFor(name),
      });
      continue;
    }

    if (installedVersion === null) {
      failures.push({
        package: name,
        reason: "manifiesto hermano ilegible o versión indeterminable",
        requiredRange: range,
        installedVersion: null,
        repairCommand: repairCommandFor(name),
      });
      continue;
    }

    const satisfaction = satisfiesRange(range, installedVersion);
    if (satisfaction === "unknown") {
      failures.push({
        package: name,
        reason: "rango no comprendido",
        requiredRange: range,
        installedVersion,
        repairCommand: repairCommandFor(name),
      });
      continue;
    }

    if (!satisfaction) {
      failures.push({
        package: name,
        reason: "versión instalada fuera del rango declarado",
        requiredRange: range,
        installedVersion,
        repairCommand: repairCommandFor(name),
      });
    }
  }

  return failures.length > 0 ? { coherent: false, failures } : { coherent: true };
}
