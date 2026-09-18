import { join } from "node:path";

import { beginVerification, finishVerification, isSafeChangeName, resolveChangesDir } from "../../shared/ports/sdd.ts";

export type VerificationCliResult = Readonly<{ text: string; exitCode: 0 | 1 }>;

export function runVerificationCommand(dir: string, args: readonly string[], rawStdin: string): VerificationCliResult {
	const [change, action] = args;
	if (!change || !isSafeChangeName(change) || (action !== "begin" && action !== "finish")) {
		return { text: "Usage: ein-cc-sdd verification <change> <begin|finish> [--token <uuid>]", exitCode: 1 };
	}
	const request = { cwd: dir, changePath: join(resolveChangesDir(dir), change) };
	if (action === "begin") {
		const result = beginVerification(request);
		return result.ok
			? { text: JSON.stringify({ ok: true, token: result.value.token, startedAt: result.value.startedAt }), exitCode: 0 }
			: { text: JSON.stringify(result), exitCode: 1 };
	}
	const tokenIndex = args.indexOf("--token");
	const token = tokenIndex >= 0 ? args[tokenIndex + 1] : undefined;
	if (!token || rawStdin.length === 0) return { text: "verification finish requires --token and report content on stdin", exitCode: 1 };
	const result = finishVerification({ ...request, token, content: rawStdin });
	return result.ok
		? { text: JSON.stringify({ ok: true, outcome: result.value.outcome, receipt: "verification-receipt.json" }), exitCode: 0 }
		: { text: JSON.stringify(result), exitCode: 1 };
}
