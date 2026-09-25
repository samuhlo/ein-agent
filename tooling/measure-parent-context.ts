// Offline transcript audit. Reports counts only; never prints prompts or tool output.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PARENT_OUTPUT_LIMIT_BYTES } from "../ein-pi/agent/lib/parent-output-budget.ts";

export function measureParentContext(jsonl: string) {
	const tools = new Map<string, { calls: number; bytes: number; oversized: number; excessBytes: number; repeatedBytes: number }>();
	const seen = new Set<string>();
	const compactions: { tokensBefore: number | null; summaryBytes: number }[] = [];
	for (const line of jsonl.split("\n")) {
		if (!line.trim()) continue;
		let entry: any;
		try { entry = JSON.parse(line); } catch { continue; }
		if (entry.type === "compaction") {
			compactions.push({ tokensBefore: typeof entry.tokensBefore === "number" ? entry.tokensBefore : null, summaryBytes: Buffer.byteLength(String(entry.summary ?? "")) });
			continue;
		}
		const message = entry.message;
		if (entry.type !== "message" || message?.role !== "toolResult" || typeof message.toolName !== "string") continue;
		const text = Array.isArray(message.content) ? message.content.filter((part: any) => part?.type === "text").map((part: any) => String(part.text ?? "")).join("\n") : "";
		const bytes = Buffer.byteLength(text);
		const row = tools.get(message.toolName) ?? { calls: 0, bytes: 0, oversized: 0, excessBytes: 0, repeatedBytes: 0 };
		row.calls++;
		row.bytes += bytes;
		if (bytes > PARENT_OUTPUT_LIMIT_BYTES) { row.oversized++; row.excessBytes += bytes - PARENT_OUTPUT_LIMIT_BYTES; }
		const digest = createHash("sha256").update(text).digest("hex");
		if (seen.has(`${message.toolName}:${digest}`)) row.repeatedBytes += bytes;
		else seen.add(`${message.toolName}:${digest}`);
		tools.set(message.toolName, row);
	}
	return { compactions, tools: [...tools].sort((a, b) => b[1].bytes - a[1].bytes).map(([tool, values]) => ({ tool, ...values })) };
}

if (import.meta.main) {
	const path = process.argv[2];
	if (!path) throw new Error("Usage: bun tooling/measure-parent-context.ts <parent-session.jsonl>");
	console.log(JSON.stringify(measureParentContext(readFileSync(path, "utf8")), null, 2));
}
