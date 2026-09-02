// =============================================================================
// PROJECT EIN STATE
// Projects the curated and generated boundaries of EIN.md without rewriting
// the project context while it is being inspected.
// =============================================================================

import { existsSync } from "node:fs";
import { einMdPath, readEinMd } from "./project-context.ts";
import type { ProjectEinBoundary, ProjectEinState } from "./project-state-contract.ts";

function curatedBoundary(content: string): ProjectEinBoundary {
	const autoStart = content.indexOf("<!-- ein:auto:start");
	const curated = content.slice(0, autoStart >= 0 ? autoStart : content.length);
	const meaningful = curated
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.filter((line) => !/^<!--.*-->$/.test(line))
		.filter((line) => !/^#+\s+/.test(line))
		.filter((line) => !/^_\((?:pendiente|pending|describe)\)_$/i.test(line));
	return {
		present: meaningful.length > 0 || /(?:^|\n)#{2,}\s+/.test(curated),
		complete: meaningful.length > 0,
	};
}

export function readProjectEinState(cwd: string): ProjectEinState {
	const path = einMdPath(cwd);
	if (!existsSync(path)) {
		return {
			path,
			quality: "absent",
			reason: "not-found",
			curated: { present: false, complete: false },
			auto: { present: false },
		};
	}

	const info = readEinMd(cwd);
	if (!info.exists) {
		return {
			path,
			quality: "unavailable",
			reason: "read-error",
			curated: { present: false, complete: false },
			auto: { present: false },
		};
	}

	const autoStart = info.content.indexOf("<!-- ein:auto:start");
	const autoEnd = info.content.indexOf("<!-- ein:auto:end -->");
	const autoPresent = autoStart >= 0 && autoEnd > autoStart;
	const autoMarkerIncomplete =
		(autoStart >= 0) !== (autoEnd >= 0) || (autoStart >= 0 && autoEnd < autoStart);
	const curated = curatedBoundary(info.content);
	return {
		path,
		...(curated.complete && !autoMarkerIncomplete
			? { quality: "current" as const, reason: "read-success" as const }
			: { quality: "incomplete" as const, reason: "incomplete-source" as const }),
		...(info.rev ? { revision: info.rev } : {}),
		curated,
		auto: { present: autoPresent },
	};
}
