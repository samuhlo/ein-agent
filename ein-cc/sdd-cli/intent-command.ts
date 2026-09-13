import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAgreement, validateAgreement, writeAgreement, type IntentAgreement } from "../../shared/sdd/intent-agreement.ts";
import { createIntentMaterialKey, normalizeIntentMaterial, type IntentMaterial } from "../../shared/sdd/sdd-intent-preflight.ts";
import { isSafeChangeName, resolveChangesDir } from "../../shared/sdd/sdd-routing-core.ts";

export const INTENT_HELP = `ein-cc-sdd intent <change> [show|record] < agreement.json
show is read-only. record requires JSON:
{"material":{"objective":"...","boundaries":{"in":["..."],"out":["..."]},"completionCriteria":["..."]},"questions":["Exact question"],"response":"Literal user answer","confirmed":true}
For a complete user request, questions may be []. Reuse an unchanged confirmed agreement.
Earlier rounds may be supplied as rounds: [{questions:["..."],response:"literal answer"}].
To replace an existing agreement, include expectedRevision and reopenReason.
For an unmanaged intent.md, include expectedDigest (from show) and reopenReason;
the original is preserved beside intent.md. Review existing artifacts before binding
them to the returned materialKey. Never relabel stale work without reviewing it.
Claude records coordinator-attested conversation, not Pi observed-response receipts.
--force cannot bypass intent, failed verification, pending tasks or spec conflicts.`;

type RecordInput = {
	material: IntentMaterial;
	questions: string[];
	response: string;
	confirmed: boolean;
	expectedRevision?: string;
	expectedDigest?: string;
	reopenReason?: string;
	rounds?: { questions: string[]; response: string }[];
};

export function runIntentCommand(cwd: string, args: readonly string[], raw = ""): { text: string; exitCode: number } {
	try {
		const [change, action = "show"] = args;
		if (!change || args.includes("--help")) return { text: INTENT_HELP, exitCode: args.includes("--help") ? 0 : 1 };
		if (!isSafeChangeName(change) || args.length > 2 || !["show", "record"].includes(action)) throw new Error(INTENT_HELP);
		const root = resolveChangesDir(cwd);
		const dir = join(root, change);
		// DESTINO -> No seguir enlaces al registrar un acuerdo fuera del proyecto.
		for (const path of [join(cwd, "openspec"), join(cwd, ".sdd"), root, dir, join(dir, "intent.md")]) {
			if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error("Unsafe intent path");
		}
		const current = readAgreement(dir);
		const original = current.kind === "invalid" ? readFileSync(join(dir, "intent.md"), "utf8") : undefined;
		const digest = original === undefined ? undefined : `sha256:${createHash("sha256").update(original).digest("hex")}`;
		if (action === "show") return { text: JSON.stringify({ ...current, ...(digest ? { digest } : {}) }), exitCode: 0 };
		if (Buffer.byteLength(raw) > 64 * 1024) throw new Error("Intent input exceeds 64 KiB");
		const input: RecordInput = JSON.parse(raw);
		if (input.confirmed !== true || typeof input.response !== "string" || !input.response.trim()) throw new Error("Record only an actual user agreement: confirmed=true and literal response required");
		const material = normalizeIntentMaterial(input.material);
		const materialKey = createIntentMaterialKey(material);
		const previous = current.kind === "valid" ? current.agreement : undefined;
		if (previous && previous.work !== change) throw new Error("Agreement belongs to a different change");
		if (previous?.status === "confirmed" && previous.materialKey === materialKey) return { text: JSON.stringify({ outcome: "adopted", agreement: previous }), exitCode: 0 };
		if (current.kind !== "absent") {
			if (!input.reopenReason?.trim()) throw new Error("Existing intent requires reopenReason");
			if (previous ? input.expectedRevision !== previous.revision : input.expectedDigest !== digest) throw new Error("Intent changed or was not reviewed: use the revision/digest from intent show");
		}
		if (input.rounds !== undefined && !Array.isArray(input.rounds)) throw new Error("Invalid earlier rounds");
		const rounds = (input.rounds ?? []).map((round) => {
			if (!Array.isArray(round.questions) || round.questions.length < 1 || round.questions.length > 4 || round.questions.some((q) => typeof q !== "string" || !q.trim()) || typeof round.response !== "string" || !round.response.trim()) throw new Error("Invalid earlier round");
			return { questions: round.questions, response: { id: randomUUID(), text: round.response, source: "claude-coordinator" as const } };
		});
		const history = [...(previous?.history ?? []), ...(previous?.response ? [{ questions: previous.questions, response: previous.response }] : []), ...rounds];
		const agreement: IntentAgreement = validateAgreement({
			version: 1, work: change, change, status: "confirmed", material, materialKey,
			questions: input.questions, ...(input.questions?.length === 0 ? { fromRequest: true } : {}),
			response: { id: randomUUID(), text: input.response, source: "claude-coordinator" },
			revision: randomUUID(), ...(input.reopenReason ? { reopenReason: input.reopenReason } : {}),
			...(history.length ? { history } : {}),
		});
		mkdirSync(dir, { recursive: true });
		if (original !== undefined) {
			const backup = join(dir, `intent-before-claude-${digest!.slice(7)}.md`);
			if (existsSync(backup)) {
				if (lstatSync(backup).isSymbolicLink() || readFileSync(backup, "utf8") !== original) throw new Error("Intent backup conflicts");
			} else writeFileSync(backup, original, { flag: "wx", mode: 0o600 });
		}
		writeAgreement(dir, agreement);
		return { text: JSON.stringify({ outcome: "recorded", agreement }), exitCode: 0 };
	} catch (error) {
		return { text: error instanceof Error ? error.message : String(error), exitCode: 1 };
	}
}
