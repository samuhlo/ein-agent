import { observeNextApplyPacket } from "./apply-packet-observation.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { resolveChangesDir } from "./sdd-router.ts";
import { normalizeGroupTitle, applyGroupSkillNames } from "./apply-packet-compile.ts";
import { readExplicitSddChange } from "../extensions/internal/ein-pi-event-contracts.ts";

// Opt-in via an exact group selector, so a legacy or deliberately different
// assignment can never be silently replaced by the router's next group.
export function compileApplyHandoff(cwd: string, task: string): { prompt: string; skillTask: string } | undefined {
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
	const tasks = readFileSync(join(resolveChangesDir(cwd), change, "tasks.md"), "utf8");
	if (createHash("sha256").update(tasks).digest("hex") !== observation.packet.sources["tasks.md"]) throw new Error("Tasks changed while preparing the handoff; refresh the current group");
	const skills = applyGroupSkillNames(tasks, observation.packet.group);
	const block = JSON.stringify(observation.packet);
	if (Buffer.byteLength(block + skills.join("; ")) > 16 * 1024) throw new Error("Apply packet exceeds 16 KiB; split this group before launching a cheap executor");
	return { skillTask: [observation.packet.outcome, ...observation.packet.readContext, ...observation.packet.behaviorSeams, ...skills].join("\n"), prompt: `## Compiled apply packet\n${block}\nGroup-declared skills: ${skills.join("; ") || "none"}.\nUse this current group as your primary checklist. Read its readContext, relevant project rules/configuration (including tsconfig and its extends), and current source/tests. Read design/tasks spans only for a specific missing decision or inconsistency; do not reconstruct the full plan. Preserve the exact task IDs for progress and return unanswered decisions to the parent. The writeAllowlist is the assigned scope, not a claim of shell confinement.` };
}
