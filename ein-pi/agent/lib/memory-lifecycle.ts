import {
	MAX_RETRIEVALS,
	MAX_SAVES,
	approveCandidate,
	filterRetrievalEntries,
	limitBytes,
	projectHash,
	type EngramReason,
	type EngramTransport,
	type MemoryCandidate,
	type MemoryReceipt,
	type PreparedEntry,
	type ProjectIdentity,
} from "./memory-contract.ts";

export type PreparedMemory = { receipt: MemoryReceipt; entries: PreparedEntry[] };
type LifecycleOptions = { transport: EngramTransport; project: ProjectIdentity; now?: () => Date };

export class MemoryLifecycle {
	private readonly now: () => Date;
	private retrievals = 0;
	private saves = 0;
	private readonly prepared = new Map<string, PreparedMemory>();
	private readonly saved = new Set<string>();

	constructor(private readonly options: LifecycleOptions) {
		this.now = options.now ?? (() => new Date());
	}

	private receipt(
		operation: MemoryReceipt["operation"], status: MemoryReceipt["status"], reason: EngramReason,
		extra: Partial<MemoryReceipt> = {},
	): MemoryReceipt {
		return {
			operation, status, reason, projectHash: projectHash(this.options.project), durationMs: 0,
			timestamp: this.now().toISOString(), ...extra,
		};
	}

	async prepare(input: { lifecycleKey: string; query: string }): Promise<PreparedMemory> {
		const cached = this.prepared.get(input.lifecycleKey);
		if (cached) return cached;
		if (this.options.project.kind === "unknown") return { receipt: this.receipt("search", "skipped", "unknown_project", { lifecycleKey: input.lifecycleKey }), entries: [] };
		if (this.retrievals >= MAX_RETRIEVALS) return { receipt: this.receipt("search", "skipped", "budget_exhausted", { lifecycleKey: input.lifecycleKey }), entries: [] };
		this.retrievals += 1;
		const started = Date.now();
		const query = /(?:token|api[ _-]?key|authorization|password|cookie)\s*[:=]|\b[A-Z][A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD)\s*=/i.test(input.query)
			? "project memory" : limitBytes(input.query, 256);
		const result = await this.options.transport.search({ query, projectId: this.options.project.id });
		const durationMs = Date.now() - started;
		if (result.status !== "retrieved") {
			const prepared = { receipt: this.receipt("search", result.status, result.reason, { lifecycleKey: input.lifecycleKey, durationMs }), entries: [] };
			this.prepared.set(input.lifecycleKey, prepared);
			return prepared;
		}
		const entries = filterRetrievalEntries(result.entries, this.options.project.id, this.now());
		const bytes = entries.reduce((total, entry) => total + new TextEncoder().encode(entry.content).byteLength, 0);
		const prepared = {
			receipt: this.receipt("search", entries.length ? "retrieved" : "empty", entries.length ? "ok" : "no_results", { lifecycleKey: input.lifecycleKey, count: entries.length, bytes, durationMs }),
			entries,
		};
		this.prepared.set(input.lifecycleKey, prepared);
		return prepared;
	}

	async save(candidate: MemoryCandidate): Promise<{ receipt: MemoryReceipt }> {
		if (this.options.project.kind === "unknown") return { receipt: this.receipt("save", "skipped", "unknown_project") };
		if (this.saves >= MAX_SAVES) return { receipt: this.receipt("save", "skipped", "budget_exhausted") };
		const checked = approveCandidate(candidate);
		if (!checked.approved) return { receipt: this.receipt("save", "skipped", checked.reason ?? "invalid_candidate") };
		const key = `${this.options.project.id}:${checked.approved.topic}:${checked.approved.digest}`;
		if (this.saved.has(key)) return { receipt: this.receipt("save", "skipped", "duplicate", { topic: checked.approved.topic, digest: checked.approved.digest }) };
		this.saves += 1;
		const started = Date.now();
		const result = await this.options.transport.save({
			title: checked.approved.title,
			content: checked.approved.content,
			type: checked.approved.type,
			projectId: this.options.project.id,
			topic: checked.approved.topic,
		});
		const receipt = this.receipt("save", result.status, result.reason, {
			topic: checked.approved.topic,
			digest: checked.approved.digest,
			bytes: new TextEncoder().encode(checked.approved.content).byteLength,
			durationMs: Date.now() - started,
		});
		if (result.status === "saved") this.saved.add(key);
		return { receipt };
	}
}
