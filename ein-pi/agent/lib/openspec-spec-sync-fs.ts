import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseSyncReport, planOpenSpecSync, serializeSyncReport, type OpenSpecSyncPlan, type SyncBaseInput, type SyncDeltaInput } from "./openspec-spec-sync";
import { digestManifest, serializeOpenSpec } from "./openspec-spec-contract";

const TEMP_PREFIX = ".openspec-sync-";

async function readIfPresent(path: string): Promise<Uint8Array | null> {
	try { return await readFile(path); } catch (error: unknown) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

async function deltaInputs(changePath: string): Promise<SyncDeltaInput[]> {
	const root = join(changePath, "specs");
	let domains: string[];
	try { domains = await readdir(root); } catch (error: unknown) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
	const inputs: SyncDeltaInput[] = [];
	for (const domain of domains.sort()) {
		const path = join(root, domain, "spec.md");
		const bytes = await readIfPresent(path);
		if (bytes) inputs.push({ path: `specs/${domain}/spec.md`, bytes });
	}
	return inputs;
}

async function replaceWithTemporary(path: string, bytes: Uint8Array): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temporary = join(dirname(path), `${TEMP_PREFIX}${process.pid}-${Math.random().toString(16).slice(2)}`);
	try {
		await writeFile(temporary, bytes);
		await rename(temporary, path);
	} finally {
		await rm(temporary, { force: true });
	}
}

async function restore(path: string, bytes: Uint8Array | null): Promise<void> {
	if (bytes === null) await rm(path, { force: true });
	else await replaceWithTemporary(path, bytes);
}

export type FilesystemSyncResult = { plan: OpenSpecSyncPlan; changed: boolean };

export async function synchronizeOpenSpecFilesystem(cwd: string, change: string): Promise<FilesystemSyncResult> {
	const changePath = join(cwd, "openspec", "changes", change);
	const deltas = await deltaInputs(changePath);
	const bases: SyncBaseInput[] = [];
	for (const delta of deltas) {
		const domain = delta.path.split("/")[1]!;
		const bytes = await readIfPresent(join(cwd, "openspec", "specs", domain, "spec.md"));
		if (bytes) bases.push({ domain, bytes });
	}
	const reportPath = join(changePath, "sync-report.md");
	const existingReport = await readIfPresent(reportPath);
	const deltaSha256 = digestManifest(deltas);
	if (existingReport) {
		const parsed = parseSyncReport(Buffer.from(existingReport).toString("utf8"));
		const resultSha256 = digestManifest(bases.map(({ domain, bytes }) => ({ path: `specs/${domain}/spec.md`, bytes })));
		if (parsed.ok && parsed.value.state === "synchronized" && parsed.value.deltaSha256 === deltaSha256 && parsed.value.resultSha256 === resultSha256) {
			return { plan: planOpenSpecSync(change, deltas, bases), changed: false };
		}
	}
	const plan = planOpenSpecSync(change, deltas, bases);
	const report = serializeSyncReport(plan);
	if (plan.state === "conflict") {
		await replaceWithTemporary(reportPath, Buffer.from(report));
		return { plan, changed: true };
	}
	const snapshots = new Map<string, Uint8Array | null>();
	try {
		for (const domain of plan.domains) {
			const path = join(cwd, "openspec", "specs", domain.domain, "spec.md");
			snapshots.set(path, await readIfPresent(path));
			await replaceWithTemporary(path, Buffer.from(serializeOpenSpec(domain.result!)));
		}
		await replaceWithTemporary(reportPath, Buffer.from(report));
	} catch (error) {
		// Se conserva el fallo ORIGINAL como causa, pero una restauración que
		// tambien falla NO puede quedarse muda: eso deja specs medio
		// sincronizadas mientras el error habla de otra cosa, y nadie se entera
		// de que el repo quedó inconsistente. Las rutas irrecuperables se
		// adjuntan al mensaje.
		const unrestored: string[] = [];
		for (const [path, snapshot] of snapshots) {
			try { await restore(path, snapshot); } catch { unrestored.push(path); }
		}
		if (unrestored.length > 0 && error instanceof Error) {
			error.message = `${error.message} [ATENCIÓN: no se pudo restaurar ${unrestored.join(", ")}; esos specs quedaron en estado sincronizado a medias y deben revisarse a mano]`;
		}
		throw error;
	}
	return { plan, changed: true };
}
