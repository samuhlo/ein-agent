import {
	digestManifest,
	serializeOpenSpec,
	sha256,
	type OpenSpecDocument,
	type OpenSpecScenario,
} from "./openspec-spec-contract.ts";
import { parseOpenSpec, parseOpenSpecDelta, type OpenSpecDeltaOperation } from "./openspec-spec-parser.ts";

export type SyncConflict = { domain: string; scenarioId: string | null; code: string; detail: string };
export type DomainSyncResult = {
	domain: string;
	before: string | "absent";
	after: string | "absent";
	added: number;
	modified: number;
	removed: number;
	result: OpenSpecDocument | null;
};
export type OpenSpecSyncPlan = {
	change: string;
	state: "synchronized" | "conflict";
	deltaSha256: string;
	baseSha256: string;
	resultSha256: string;
	domains: readonly DomainSyncResult[];
	conflicts: readonly SyncConflict[];
};
export type SyncDeltaInput = { path: string; bytes: Uint8Array };
export type SyncBaseInput = { domain: string; bytes: Uint8Array };

function fail(message: string): never {
	throw new Error(`OpenSpec sync: ${message}`);
}

function operationsFor(domain: string, operations: readonly OpenSpecDeltaOperation[]): OpenSpecDeltaOperation[] {
	return [...operations].sort((left, right) => {
		const leftId = left.kind === "REMOVED" ? left.scenarioId : left.scenario.id;
		const rightId = right.kind === "REMOVED" ? right.scenarioId : right.scenario.id;
		return leftId.localeCompare(rightId, "en");
	});
}

function conflict(domain: string, scenarioId: string | null, code: string, detail: string): SyncConflict {
	return { domain, scenarioId, code, detail };
}

export function planOpenSpecSync(change: string, deltas: readonly SyncDeltaInput[], bases: readonly SyncBaseInput[]): OpenSpecSyncPlan {
	const parsedDeltas = [...deltas].sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path))).map((input) => {
		const parsed = parseOpenSpecDelta(Buffer.from(input.bytes).toString("utf8"));
		if (!parsed.ok) fail(`${input.path}: ${parsed.errors[0]?.code ?? "invalid delta"}`);
		return { ...input, document: parsed.value };
	});
	const deltaDomains = new Set<string>();
	for (const delta of parsedDeltas) {
		if (!/^specs\/([a-z0-9]+(?:-[a-z0-9]+)*)\/spec\.md$/.test(delta.path)) fail(`invalid delta path: ${delta.path}`);
		if (deltaDomains.has(delta.document.domain)) fail(`duplicate delta domain: ${delta.document.domain}`);
		deltaDomains.add(delta.document.domain);
	}
	const baseByDomain = new Map<string, { document: OpenSpecDocument; bytes: Uint8Array }>();
	for (const base of bases) {
		if (baseByDomain.has(base.domain)) fail(`duplicate base domain: ${base.domain}`);
		const parsed = parseOpenSpec(Buffer.from(base.bytes).toString("utf8"));
		if (!parsed.ok) fail(`${base.domain}: ${parsed.errors[0]?.code ?? "invalid spec"}`);
		if (parsed.value.domain !== base.domain) fail(`${base.domain}: domain does not match canonical path`);
		baseByDomain.set(base.domain, { document: parsed.value, bytes: base.bytes });
	}

	const deltaSha256 = digestManifest(parsedDeltas.map(({ path, bytes }) => ({ path, bytes })));
	const baseSha256 = digestManifest([...baseByDomain].filter(([domain]) => deltaDomains.has(domain)).map(([domain, base]) => ({ path: `specs/${domain}/spec.md`, bytes: base.bytes })));
	const domains: DomainSyncResult[] = [];
	const conflicts: SyncConflict[] = [];
	for (const delta of parsedDeltas.sort((a, b) => a.document.domain.localeCompare(b.document.domain, "en"))) {
		const base = baseByDomain.get(delta.document.domain);
		const original = base?.document.scenarios ?? [];
		const byId = new Map(original.map((scenario) => [scenario.id, scenario]));
		let added = 0;
		let modified = 0;
		let removed = 0;
		for (const operation of operationsFor(delta.document.domain, delta.document.operations)) {
			const id = operation.kind === "REMOVED" ? operation.scenarioId : operation.scenario.id;
			if (operation.kind === "ADDED") {
				if (byId.has(id)) conflicts.push(conflict(delta.document.domain, id, "added-existing", "ADDED target already exists"));
				else added += 1;
			} else if (!byId.has(id)) {
				conflicts.push(conflict(delta.document.domain, id, "target-missing", `${operation.kind} target does not exist`));
			} else if (operation.kind === "MODIFIED") modified += 1;
			else removed += 1;
		}
		const domainConflicts = conflicts.filter((item) => item.domain === delta.document.domain);
		let result: OpenSpecDocument | null = null;
		if (domainConflicts.length === 0) {
			const next = new Map(byId);
			for (const operation of delta.document.operations) {
				// Discriminated on the single-literal member: the two-literal side
				// does not narrow the `else` branch.
				if (operation.kind === "REMOVED") next.delete(operation.scenarioId);
				else next.set(operation.scenario.id, operation.scenario);
			}
			result = { domain: delta.document.domain, scenarios: [...next.values()] };
		}
		const before = base ? sha256(base.bytes) : "absent";
		domains.push({ domain: delta.document.domain, before, after: result ? sha256(serializeOpenSpec(result)) : before, added, modified, removed, result });
	}
	conflicts.sort((a, b) => `${a.domain}/${a.scenarioId ?? "none"}/${a.code}`.localeCompare(`${b.domain}/${b.scenarioId ?? "none"}/${b.code}`, "en"));
	const state = conflicts.length === 0 ? "synchronized" : "conflict";
	const resultSha256 = state === "conflict" ? baseSha256 : digestManifest(domains.map((domain) => ({ path: `specs/${domain.domain}/spec.md`, bytes: Buffer.from(serializeOpenSpec(domain.result!)) })));
	return { change, state, deltaSha256, baseSha256, resultSha256, domains, conflicts };
}

export function serializeSyncReport(plan: OpenSpecSyncPlan): string {
	const domains = [...plan.domains].sort((a, b) => a.domain.localeCompare(b.domain, "en"));
	const totals = domains.reduce((sum, domain) => ({ added: sum.added + domain.added, modified: sum.modified + domain.modified, removed: sum.removed + domain.removed }), { added: 0, modified: 0, removed: 0 });
	const lines = [
		"# OpenSpec Sync Report",
		"sync_report_version: 1",
		`change: ${plan.change}`,
		`state: ${plan.state}`,
		`delta_sha256: ${plan.deltaSha256}`,
		`base_sha256: ${plan.baseSha256}`,
		`result_sha256: ${plan.resultSha256}`,
		`domains: ${domains.map((domain) => domain.domain).join(",")}`,
		`operations: added=${totals.added} modified=${totals.modified} removed=${totals.removed}`,
		`conflicts: ${plan.conflicts.length}`,
		"",
		"## Domain Results",
		...domains.map((domain) => `- domain=${domain.domain}; before=${domain.before}; after=${domain.after}; added=${domain.added}; modified=${domain.modified}; removed=${domain.removed}`),
		"",
		"## Conflicts",
	];
	if (plan.conflicts.length === 0) lines.push("- none");
	else lines.push(...plan.conflicts.map((item) => `- identity=${item.domain}/${item.scenarioId ?? "none"}; code=${item.code}; detail=${item.detail}`));
	return `${lines.join("\n")}\n`;
}

export type OpenSpecState = "unresolved" | "conflict" | "synchronized" | "pending";

export function evaluateOpenSpecState(input: {
	declaration: "none" | "delta" | "invalid";
	change: string;
	deltas: readonly SyncDeltaInput[];
	bases: readonly SyncBaseInput[];
	report: string | null;
}): OpenSpecState {
	if (input.declaration === "invalid") return "unresolved";
	if (input.declaration === "none") return "synchronized";
	let plan: OpenSpecSyncPlan;
	try {
		plan = planOpenSpecSync(input.change, input.deltas, input.bases);
	} catch {
		return "unresolved";
	}
	const report = input.report === null ? null : parseSyncReport(input.report);
	if (!report?.ok) return "pending";
	// El recibo debe pertenecer a ESTE cambio: si no, es prestado.
	if (report.value.change !== input.change) return "pending";
	if (report.value.deltaSha256 !== plan.deltaSha256) return "pending";
	// El informe describe un resultado YA APLICADO sobre los specs canónicos, así
	// que la comprobación va contra los BYTES ACTUALES — no contra `plan.resultSha256`.
	//
	// Comparar con el plan re-derivado era el fallo de fondo: `bases` son los
	// specs de AHORA, ya sincronizados, y volver a aplicarles el delta produce un
	// conflicto artificial (`ADDED` sobre un escenario que el propio sync acaba de
	// insertar). Resultado: `synchronized` era INALCANZABLE — el sync escribía
	// "synchronized" y el router leía "pending" para siempre. Esta es la misma
	// comparación que ya hacía `synchronizeOpenSpecFilesystem` para ser idempotente.
	const currentSha256 = digestManifest(
		input.bases.map(({ domain, bytes }) => ({ path: `specs/${domain}/spec.md`, bytes })),
	);
	if (report.value.resultSha256 !== currentSha256) return "pending";
	if (report.value.state === "conflict") return plan.state === "conflict" ? "conflict" : "pending";
	return "synchronized";
}

// `change` se conserva a propósito: el informe ya lo serializaba, pero nadie lo
// leía, así que un recibo copiado de OTRO cambio con deltas equivalentes lo daba
// por sincronizado (verificado). Un recibo que no dice a qué trabajo pertenece
// no es trazabilidad, es coincidencia de hashes.
export function parseSyncReport(source: string): { ok: true; value: { change: string; state: "synchronized" | "conflict"; deltaSha256: string; resultSha256: string } } | { ok: false } {
	const values: Record<string, string> = {};
	for (const line of source.split("\n")) {
		const match = line.match(/^([a-z0-9_]+): (.+)$/);
		if (match?.[1] && match[2]) values[match[1]] = match[2];
	}
	if (
		!source.startsWith("# OpenSpec Sync Report\nsync_report_version: 1\n") ||
		!/^[a-f0-9]{64}$/.test(values.delta_sha256 ?? "") ||
		!/^[a-f0-9]{64}$/.test(values.result_sha256 ?? "") ||
		!["synchronized", "conflict"].includes(values.state ?? "") ||
		!(values.change ?? "").trim()
	)
		return { ok: false };
	return { ok: true, value: { change: values.change!.trim(), state: values.state as "synchronized" | "conflict", deltaSha256: values.delta_sha256!, resultSha256: values.result_sha256! } };
}
