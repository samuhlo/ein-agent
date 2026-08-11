import { createHash } from "node:crypto";
import { cpSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { inspectArtifact } from "../../spikes/opentui-solid-packaging/src/package-layout.ts";
import { validateCandidateInventory, type CandidateInventory } from "../../spikes/opentui-solid-packaging/src/candidate-artifact.ts";
import { targetById, type Target } from "../../spikes/opentui-solid-packaging/src/targets.ts";

export const DASHBOARD_SEED_ROOT = "ein/runtime-seed/dashboard/v1";
const SELECTOR_SOURCES = [
	"ein-pi/agent/launcher/dashboard-selector.ts",
	"ein-pi/agent/lib/dashboard-package.ts",
	"ein-pi/agent/lib/terminal-app-args.ts",
] as const;

export type CandidateInput = Readonly<{ target: Target; candidateBinary: string; candidateInventory: string }>;
type VerifiedCandidate = Readonly<{ input: CandidateInput; inventory: CandidateInventory; bytes: Buffer }>;

export function candidateInputFromArgs(args: readonly string[]): CandidateInput | undefined {
	if (args.length === 0) return undefined;
	if (args.length !== 6 || args[0] !== "--target" || args[2] !== "--candidate-binary" || args[4] !== "--candidate-inventory") {
		throw new Error("Target-aware bundling requires --target, --candidate-binary, and --candidate-inventory");
	}
	return { target: targetById(args[1]!), candidateBinary: args[3]!, candidateInventory: args[5]! };
}

export function candidateInputArgs(input: CandidateInput): string[] {
	return ["--target", input.target.id, "--candidate-binary", input.candidateBinary, "--candidate-inventory", input.candidateInventory];
}

export function verifyCandidateInput(input: CandidateInput): VerifiedCandidate {
	const binaryMetadata = lstatSync(input.candidateBinary);
	const inventoryMetadata = lstatSync(input.candidateInventory);
	if (!binaryMetadata.isFile() || binaryMetadata.isSymbolicLink() || !inventoryMetadata.isFile() || inventoryMetadata.isSymbolicLink()) {
		throw new Error("Candidate inputs must be regular files");
	}
	const bytes = readFileSync(input.candidateBinary);
	const inventory = validateCandidateInventory(JSON.parse(readFileSync(input.candidateInventory, "utf8")) as unknown, input.target);
	if (basename(input.candidateBinary) !== inventory.artifact.filename) throw new Error("Candidate binary filename mismatch");
	inspectArtifact(bytes, input.target);
	const digest = createHash("sha256").update(bytes).digest("hex");
	if (inventory.artifact.sha256 !== digest || inventory.artifact.bytes !== bytes.byteLength || (binaryMetadata.mode & 0o777) !== 0o755) {
		throw new Error(`Candidate artifact does not match inventory for ${input.target.id}`);
	}
	return { input, inventory, bytes };
}

export function stageDashboardSeed(candidate: VerifiedCandidate, staging: string, repoRoot: string): string[] {
	const paths: string[] = [];
	const write = (path: string, value: string | Buffer, mode?: number): void => {
		const destination = join(staging, path);
		mkdirSync(dirname(destination), { recursive: true });
		writeFileSync(destination, value, mode ? { mode } : undefined);
		paths.push(path);
	};
	const packageRoot = `${DASHBOARD_SEED_ROOT}/packages/${candidate.input.target.id}`;
	write(`${packageRoot}/${candidate.inventory.artifact.filename}`, candidate.bytes, 0o755);
	write(`${packageRoot}/candidate-inventory.json`, `${JSON.stringify(candidate.inventory, null, 2)}\n`);
	for (const source of SELECTOR_SOURCES) {
		const path = `${DASHBOARD_SEED_ROOT}/selector/${source.replace("ein-pi/agent/", "")}`;
		mkdirSync(dirname(join(staging, path)), { recursive: true });
		cpSync(join(repoRoot, source), join(staging, path));
		paths.push(path);
	}
	return paths;
}
