import { lstatSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BUN_BUILD_ARTIFACT = /^\.[a-f0-9]+-\d+\.bun-build$/;

export type WorkspaceCleanup = Readonly<{ files: number; bytes: number }>;

export function cleanBunBuildArtifacts(roots: readonly string[]): WorkspaceCleanup {
	let files = 0;
	let bytes = 0;
	for (const root of roots) {
		for (const entry of readdirSync(root, { withFileTypes: true })) {
			if (!entry.isFile() || !BUN_BUILD_ARTIFACT.test(entry.name)) continue;
			const path = join(root, entry.name);
			const stat = lstatSync(path);
			if (!stat.isFile()) continue;
			unlinkSync(path);
			files += 1;
			bytes += stat.size;
		}
	}
	return { files, bytes };
}

if (import.meta.main) {
	const repository = join(dirname(fileURLToPath(import.meta.url)), "..");
	const result = cleanBunBuildArtifacts([repository, join(repository, "installer")]);
	console.log(`workspace limpio: ${result.files} temporales Bun · ${(result.bytes / 1024 / 1024 / 1024).toFixed(2)} GiB`);
}
