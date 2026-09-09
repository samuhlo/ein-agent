import { observeNextApplyPacket } from "./apply-packet-observation.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { resolveChangesDir } from "./sdd-router.ts";
import { normalizeGroupTitle, applyGroupSkillNames, applyGroupText } from "./apply-packet-compile.ts";
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
	const groupText = applyGroupText(tasks, observation.packet.group);
	const header = JSON.stringify({ change, group: observation.packet.group, pendingTaskIds: [...new Set(observation.packet.steps.map((step) => step.taskId))], writeAllowlist: observation.packet.writeAllowlist, sourceDigests: observation.packet.sources });
	const prompt = `## Compiled apply packet
Validated group metadata: ${header}
Group-declared skills: ${skills.join("; ") || "none"}.
The original group and global notes below are your primary instructions; preserve all substeps. Execute only pending task IDs. Read the declared context, real compiler/test configuration (including tsconfig extends), and current source/tests. Expand design/tasks reads for a concrete gap; do not reconstruct other groups. Return unanswered decisions to the parent. The writeAllowlist describes the assignment, not shell confinement.

${groupText}`;
	if (Buffer.byteLength(prompt) > 16 * 1024) throw new Error("Apply handoff exceeds 16 KiB; narrow the group or its global notes before launching a cheap executor");
	return { prompt, skillTask: [observation.packet.outcome, ...observation.packet.readContext, ...observation.packet.behaviorSeams, ...skills].join("\n") };
}
