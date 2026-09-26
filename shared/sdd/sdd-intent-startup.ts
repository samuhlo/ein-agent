import { existsSync } from "node:fs";
import { join } from "node:path";
import { readIntentAdmission } from "./intent-admission.ts";
import { isSafeChangeName, resolveChangesDir } from "./sdd-routing-core.ts";

export type SddIntentStartup =
	| { admitted: true; source: "agreement" | "legacy-scope" }
	| { admitted: false; reason: string };

/** A new scope must consume an agreed intent; an already scoped legacy change can resume. */
export function assessSddIntentStartup(
	cwd: string,
	change: string,
	allowStarted = true,
): SddIntentStartup {
	if (!isSafeChangeName(change)) return { admitted: false, reason: "Invalid SDD change name" };
	const changeDir = join(resolveChangesDir(cwd), change);
	const started = allowStarted && ["scope.md", "explore.md"].some((name) => existsSync(join(changeDir, name)));
	const admission = readIntentAdmission({ root: cwd, work: change, changeDir, requiresCanonical: !started });
	if (admission.state === "absent" && !started) {
		return {
			admitted: false,
			reason: `Before starting '${change}', use ein_intent record for a fully defined request, or ein_intent propose to resolve product decisions, with work and change both set to '${change}'. Then run SDD preflight and scope.`,
		};
	}
	if (!admission.admitted) {
		return { admitted: false, reason: `Intent for '${change}' is ${admission.state}: ${admission.reason ?? "resolve the current agreement before continuing"}` };
	}
	if (admission.state === "confirmed") return { admitted: true, source: "agreement" };
	if (started) return { admitted: true, source: "legacy-scope" };
	return { admitted: false, reason: `Intent for '${change}' is absent` };
}
