import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export type LegacyRuntimeArtifact = Readonly<{
	id: "LEGACY_PI_LAUNCHER" | "LEGACY_CLAUDE_LAUNCHER" | "LEGACY_CLAUDE_SDD";
	runtime: "pi" | "claude";
	home: string;
	path: string;
	proof: Readonly<{ type: "sha256"; value: string } | { type: "managed-alpha-inventory" }>;
}>;

export type LegacyArtifactObservation = Readonly<{
	kind: "missing" | "file" | "directory" | "symlink" | "other";
	realPath: string | null;
	sha256: string | null;
	markerVersion: string | null;
}>;

export type LegacyArtifactClassification =
	| Readonly<{ status: "absent" }>
	| Readonly<{ status: "owned"; proof: "known-sha256" | "managed-alpha-inventory" }>
	| Readonly<{ status: "collision"; reason: "not-regular" | "path-mismatch" | "content-mismatch" | "marker-mismatch" }>;

const LEGACY_ALPHA_VERSION = "0.91.0-alpha.2";
const LEGACY_PI_LAUNCHER_SHA256 = "e411e86b455e44ebf15748f8c8bf74d97e85ca0e4d6e83243bd9da652e3b7692";
const LEGACY_CLAUDE_LAUNCHER_SHA256 = "614676668b6298bc8f8db7322d08c9c256122ea24ab771ffaf27b89e26dba41f";
const LEGACY_PI_LAUNCHER_PATH = (home: string) => join(home, ".config", "fish", "functions", "pi-ein.fish");
const LEGACY_CLAUDE_LAUNCHER_PATH = (home: string) => join(home, ".config", "fish", "functions", "cc-ein.fish");
const LEGACY_CLAUDE_SDD_PATH = (home: string) => join(home, ".claude-ein", "bin", "cc-ein-sdd");

export function legacyRuntimeArtifactInventory(home: string): readonly LegacyRuntimeArtifact[] {
	return [
		{
			id: "LEGACY_PI_LAUNCHER",
			runtime: "pi",
			home,
			path: LEGACY_PI_LAUNCHER_PATH(home),
			proof: { type: "sha256", value: LEGACY_PI_LAUNCHER_SHA256 },
		},
		{
			id: "LEGACY_CLAUDE_LAUNCHER",
			runtime: "claude",
			home,
			path: LEGACY_CLAUDE_LAUNCHER_PATH(home),
			proof: { type: "sha256", value: LEGACY_CLAUDE_LAUNCHER_SHA256 },
		},
		{
			id: "LEGACY_CLAUDE_SDD",
			runtime: "claude",
			home,
			path: LEGACY_CLAUDE_SDD_PATH(home),
			proof: { type: "managed-alpha-inventory" },
		},
	] as const;
}

export function classifyLegacyRuntimeArtifact(
	artifact: LegacyRuntimeArtifact,
	observation: LegacyArtifactObservation,
): LegacyArtifactClassification {
	if (observation.kind === "missing") return { status: "absent" };
	if (observation.kind !== "file") return { status: "collision", reason: "not-regular" };
	if (observation.realPath !== resolve(artifact.path)) return { status: "collision", reason: "path-mismatch" };

	if (artifact.proof.type === "sha256") {
		return observation.sha256 === artifact.proof.value
			? { status: "owned", proof: "known-sha256" }
			: { status: "collision", reason: "content-mismatch" };
	}

	return observation.markerVersion === LEGACY_ALPHA_VERSION
		? { status: "owned", proof: "managed-alpha-inventory" }
		: { status: "collision", reason: "marker-mismatch" };
}

export function observeLegacyRuntimeArtifact(
	artifact: LegacyRuntimeArtifact,
	markerVersion: string | null,
): LegacyArtifactObservation {
	let stats: ReturnType<typeof lstatSync>;
	try {
		stats = lstatSync(artifact.path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return { kind: "missing", realPath: null, sha256: null, markerVersion };
		}
		throw error;
	}

	const kind = stats.isSymbolicLink()
		? "symlink"
		: stats.isFile()
			? "file"
			: stats.isDirectory()
				? "directory"
				: "other";
	if (kind !== "file") return { kind, realPath: resolve(artifact.path), sha256: null, markerVersion };

	const lexicalHome = resolve(artifact.home);
	const lexicalArtifact = resolve(artifact.path);
	const pathWithinHome = relative(lexicalHome, lexicalArtifact);
	if (pathWithinHome === "" || pathWithinHome === ".." || pathWithinHome.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
		return { kind: "symlink", realPath: lexicalArtifact, sha256: null, markerVersion };
	}
	let canonicalHome: string;
	let canonicalArtifact: string;
	try {
		canonicalHome = realpathSync(lexicalHome);
		canonicalArtifact = realpathSync(lexicalArtifact);
	} catch {
		return { kind: "symlink", realPath: lexicalArtifact, sha256: null, markerVersion };
	}
	const expectedCanonicalArtifact = resolve(canonicalHome, pathWithinHome);
	if (canonicalArtifact !== expectedCanonicalArtifact) {
		return { kind: "symlink", realPath: canonicalArtifact, sha256: null, markerVersion };
	}

	return {
		kind,
		realPath: resolve(artifact.path),
		sha256: createHash("sha256").update(readFileSync(artifact.path)).digest("hex"),
		markerVersion,
	};
}

export function readInstallMarkerVersion(path: string): string | null {
	try {
		const marker = JSON.parse(readFileSync(path, "utf8")) as { version?: unknown };
		return typeof marker.version === "string" ? marker.version : null;
	} catch {
		return null;
	}
}
