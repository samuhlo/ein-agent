import { observeNextApplyPacket } from "./apply-packet-observation.ts";
import { normalizeGroupTitle } from "./apply-packet-compile.ts";
import { readExplicitSddChange } from "../extensions/internal/ein-pi-event-contracts.ts";

// Opt-in via an exact group selector, so a legacy or deliberately different
// assignment can never be silently replaced by the router's next group.
export function compileApplyHandoff(cwd: string, task: string): string | undefined {
	const selectors = [...task.matchAll(/^apply_group:[\t ]*(.+)$/gm)];
	if (!selectors.length) return;
	if (selectors.length !== 1) throw new Error("Use exactly one apply_group selector");
	const change = readExplicitSddChange({ task });
	if (!change) throw new Error("A compiled apply needs an explicit openspec/changes/<change>/ reference");
	const observation = observeNextApplyPacket(cwd, change);
	if (observation.status !== "executable") {
		const issues = "issues" in observation ? observation.issues?.map((issue) => `${issue.field}: ${issue.detail}`).join("; ") ?? observation.status : observation.detail;
		throw new Error(`Apply packet ${observation.status}: ${issues}. Have tasks correct this group; do not regenerate other phases or improvise an implementation.`);
	}
	if (normalizeGroupTitle(selectors[0]![1]) !== observation.packet.group) throw new Error("apply_group differs from the next pending group; reconcile progress before launching");
	const block = JSON.stringify(observation.packet);
	if (Buffer.byteLength(block) > 16 * 1024) throw new Error("Apply packet exceeds 16 KiB; split this group before launching a cheap executor");
	return `## Compiled apply packet\n${block}\nUse this current group as your primary checklist. Read its readContext, relevant project rules/configuration (including tsconfig and its extends), and current source/tests. Read design/tasks spans only for a specific missing decision or inconsistency; do not reconstruct the full plan. Preserve the exact task IDs for progress and return unanswered decisions to the parent. The writeAllowlist is the assigned scope, not a claim of shell confinement.`;
}
