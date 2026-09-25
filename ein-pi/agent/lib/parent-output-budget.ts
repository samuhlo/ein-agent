import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// These tools return source or derived text, not acceptance receipts. Keep their
// full output recoverable while preventing a single read from filling the parent.
export const PARENT_OUTPUT_LIMIT_BYTES = 4 * 1024;
const BOUNDED_TOOLS = new Set(["read", "bash", "ctx_execute", "ctx_execute_file", "ctx_batch_execute"]);

export function budgetParentOutput(input: {
	toolName: string;
	content: readonly { type: string; text?: string }[];
	sessionDir: string;
}): { content: { type: "text"; text: string }[]; originalBytes: number; deliveredBytes: number } | undefined {
	if (!BOUNDED_TOOLS.has(input.toolName) || input.content.some((part) => part.type !== "text")) return;
	const full = input.content.map((part) => part.text ?? "").join("\n");
	const originalBytes = Buffer.byteLength(full);
	if (originalBytes <= PARENT_OUTPUT_LIMIT_BYTES) return;
	const digest = createHash("sha256").update(full).digest("hex");
	const directory = join(input.sessionDir, "ein-parent-outputs");
	const file = join(directory, `${digest}.txt`);
	mkdirSync(directory, { recursive: true, mode: 0o700 });
	writeFileSync(file, full, { mode: 0o600 });
	const bytes = Buffer.from(full);
	const preview = (input.toolName === "bash" ? bytes.subarray(-1536) : bytes.subarray(0, 1536)).toString("utf8").replace(/\uFFFD$/u, "");
	const text = [
		`Large ${input.toolName} result: ${originalBytes} bytes. Full output: ${file}`,
		`sha256: ${digest}. Read only the needed span with read offset/limit. The result was not verified by this receipt.`,
		input.toolName === "bash" ? "Preview (end only):" : "Preview (beginning only):",
		preview,
	].join("\n");
	return { content: [{ type: "text", text }], originalBytes, deliveredBytes: Buffer.byteLength(text) };
}

export function registerParentOutputBudget(pi: ExtensionAPI): void {
	pi.on("tool_result", (event, ctx) => {
		// RPC parents need the same protection; children retain their own reads.
		if (process.env.PI_SUBAGENT_CHILD === "1") return;
		try {
			const result = budgetParentOutput({
				toolName: event.toolName,
				content: event.content,
				sessionDir: join(ctx.sessionManager.getSessionDir(), ctx.sessionManager.getSessionId()),
			});
			return result ? { content: result.content } : undefined;
		} catch {
			// A storage problem must never silently discard a tool result.
			return;
		}
	});
}
