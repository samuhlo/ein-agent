import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	compressHeadroom, eligibleHeadroomOutput, headroomConfig, headroomNotice, headroomTableText,
	verifyHeadroomTable, saveHeadroomOriginal, HEADROOM_SESSION_BYTES,
	type HeadroomConfig,
} from "../lib/headroom.ts";

export function createHeadroomExtension(config: HeadroomConfig): (pi: ExtensionAPI) => void {
	return (pi: ExtensionAPI): void => {
	if (config.mode === "off") return;
	let consecutiveFailures = 0;
	let sessionId = "";
	let storedBytes = 0;
	const counts = { eligible: 0, compressed: 0, unchanged: 0, rejected: 0, failed: 0, savedBytes: 0, wouldSaveBytes: 0, elapsedMs: 0 };
	pi.registerCommand("ein:headroom", {
		description: "Show experimental Headroom measurements for this session.",
		handler: async (_args, ctx) => { if (ctx.hasUI) ctx.ui.notify(`Headroom ${config.mode}: ${JSON.stringify(counts)}; circuit=${consecutiveFailures >= 3 ? "open" : "closed"}`, "info"); },
	});
	pi.on("tool_result", async (event, ctx) => {
		const currentSession = ctx.sessionManager.getSessionId();
		if (currentSession !== sessionId) {
			sessionId = currentSession; storedBytes = 0; consecutiveFailures = 0;
			for (const key of Object.keys(counts) as (keyof typeof counts)[]) counts[key] = 0;
		}
		if (consecutiveFailures >= 3 || !pi.getActiveTools().includes("read")) return;
		const original = eligibleHeadroomOutput(event); if (!original) return;
		counts.eligible++;
		const started = performance.now();
		let outcome = "unchanged";
		try {
			const result = await compressHeadroom(original, config, ctx.signal);
			consecutiveFailures = 0;
			if (result.text === original) { counts.unchanged++; return; }
			const compact = headroomTableText(result.text);
			// Require room for the retrieval notice AND a useful net byte reduction.
			if (Buffer.byteLength(compact) + 600 > Buffer.byteLength(original) * 0.90 || !verifyHeadroomTable(original, compact)) {
				counts.rejected++; outcome = "rejected"; return;
			}
			if (config.mode === "observe") { counts.wouldSaveBytes += Buffer.byteLength(original) - Buffer.byteLength(compact) - 600; outcome = "would-compress"; return; }
			if (storedBytes + Buffer.byteLength(original) > HEADROOM_SESSION_BYTES) { counts.rejected++; outcome = "storage-budget"; return; }
			const path = await saveHeadroomOriginal(ctx.cwd, sessionId, original);
			storedBytes += Buffer.byteLength(original);
			const text = headroomNotice(path) + compact;
			counts.compressed++; counts.savedBytes += Buffer.byteLength(original) - Buffer.byteLength(text); outcome = "compressed";
			return { content: [{ type: "text" as const, text }] };
		} catch {
			counts.failed++; consecutiveFailures++; outcome = ctx.signal?.aborted ? "cancelled" : "unavailable";
			// Keep content, details, error/exit status and usage exactly as Pi supplied.
			return;
		} finally {
			const elapsedMs = performance.now() - started; counts.elapsedMs += elapsedMs;
			// Metadata only. Metrics never become instructions or tool-result evidence.
			try { pi.appendEntry("ein-headroom", { version: 1, mode: config.mode, toolCallId: event.toolCallId, outcome, elapsedMs, counts: { ...counts } }); } catch { /* Observability must not break a result. */ }
		}
	});
	};
}

export default function headroomExtension(pi: ExtensionAPI): void {
	try { createHeadroomExtension(headroomConfig())(pi); }
	catch {
		pi.registerCommand("ein:headroom", { description: "Headroom configuration error.", handler: async (_args, ctx) => {
			if (ctx.hasUI) ctx.ui.notify("Headroom disabled: invalid EIN_HEADROOM_MODE, EIN_HEADROOM_URL or EIN_HEADROOM_TIMEOUT_MS.", "warning");
		} });
	}
}
