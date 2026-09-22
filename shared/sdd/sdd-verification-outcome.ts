export type VerificationOutcome = "pass" | "fail" | "unknown";
export type VerificationStatus = "pass" | "fail";
export type VerificationCoverage = "verified" | "partial" | "none" | "n-a";

export type VerificationReportParse = {
	outcome: VerificationOutcome;
	status: VerificationStatus | null;
	coverage: VerificationCoverage | null;
	requiredChecks: { command: string; exitCode: number | null }[];
	issues: { code: string; line: number; message: string }[];
};

type Fence = { character: "`" | "~"; length: number };
type Located<T> = { value: T; line: number };

const STATUS_VALUES: Readonly<Record<string, VerificationStatus>> = {
	pass: "pass",
	passed: "pass",
	ok: "pass",
	pasa: "pass",
	fail: "fail",
	failed: "fail",
	falla: "fail",
};

const COVERAGE_VALUES = new Set<VerificationCoverage>(["verified", "partial", "none", "n-a"]);

function openingFence(line: string): Fence | null {
	const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
	if (!match) return null;
	return { character: match[1]![0] as Fence["character"], length: match[1]!.length };
}

function closesFence(line: string, fence: Fence): boolean {
	const match = line.match(/^ {0,3}(`+|~+)\s*$/);
	return Boolean(match && match[1]![0] === fence.character && match[1]!.length >= fence.length);
}

function isGlobalMetadataContainer(line: string): boolean {
	return /^\s*(?:>|\|)/.test(line) || /^\s*(?:[-+*]|\d+[.)])\s+/.test(line);
}

function isRequiredCheckContainer(line: string): boolean {
	return /^\s*(?:>|\|)/.test(line);
}

export function parseVerificationReport(content: string): VerificationReportParse {
	const lines = content.replace(/\r\n?/g, "\n").split("\n");
	const issues: VerificationReportParse["issues"] = [];
	const statuses: Located<VerificationStatus>[] = [];
	const coverages: Located<VerificationCoverage>[] = [];
	const requiredChecks: VerificationReportParse["requiredChecks"] = [];
	let statusDeclarations = 0;
	let coverageDeclarations = 0;
	let invalidStatus = false;
	let invalidCoverage = false;
	let invalidRequiredCheck = false;
	let failedRequiredCheck = false;
	let fence: Fence | null = null;
	let inComment = false;
	let atDocumentStart = true;
	let inFrontmatter = false;
	let preambleOpen = true;
	let preambleContentSeen = false;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index]!;
		const lineNumber = index + 1;
		const trimmed = line.trim();

		if (atDocumentStart) {
			if (!trimmed) continue;
			atDocumentStart = false;
			if (trimmed === "---") {
				inFrontmatter = true;
				continue;
			}
		}
		if (inFrontmatter) {
			if (trimmed === "---" || trimmed === "...") inFrontmatter = false;
			continue;
		}

		if (fence) {
			if (closesFence(line, fence)) fence = null;
			continue;
		}
		const marker = openingFence(line);
		if (marker) {
			fence = marker;
			continue;
		}
		// Hidden examples and indented code are not report metadata.
		if (inComment || line.includes("<!--")) {
			let offset = 0;
			while (offset < line.length) {
				const boundary = line.indexOf(inComment ? "-->" : "<!--", offset);
				if (boundary < 0) break;
				offset = boundary + (inComment ? 3 : 4);
				inComment = !inComment;
			}
			continue;
		}
		if (/^(?: {4}|\t)/.test(line)) continue;

		if (preambleOpen && /^ {0,3}#{1,6}(?:\s+|$)/.test(line)) {
			if (!preambleContentSeen && /^ {0,3}#(?:\s+|$)/.test(line)) {
				preambleContentSeen = true;
				continue;
			}
			preambleOpen = false;
		}
		if (trimmed) preambleContentSeen = true;

		if (preambleOpen && !isGlobalMetadataContainer(line)) {
			const statusMatch = line.match(/^\s*(?:status|result|resultado)\s*[:=]\s*(.*?)\s*$/i);
			if (statusMatch) {
				statusDeclarations += 1;
				const raw = statusMatch[1]!;
				const value = STATUS_VALUES[raw.toLowerCase()];
				if (value) statuses.push({ value, line: lineNumber });
				else {
					invalidStatus = true;
					issues.push({ code: "invalid-status", line: lineNumber, message: `Estado global no válido: ${raw || "(vacío)"}.` });
				}
			}

			const coverageMatch = line.match(/^\s*behavior_coverage\s*[:=]\s*(.*?)\s*$/i);
			if (coverageMatch) {
				coverageDeclarations += 1;
				const raw = coverageMatch[1]!;
				const normalized = raw.toLowerCase();
				if (COVERAGE_VALUES.has(normalized as VerificationCoverage)) {
					coverages.push({ value: normalized as VerificationCoverage, line: lineNumber });
				} else {
					invalidCoverage = true;
					issues.push({ code: "invalid-coverage", line: lineNumber, message: `behavior_coverage no válido: ${raw || "(vacío)"}.` });
				}
			}
		}

		if (!isRequiredCheckContainer(line)) {
			const checkMatch = line.match(/^\s*(?:[-*]\s+)?required_check\s*:\s*(.*)$/);
			if (checkMatch) {
				try {
					const value: unknown = JSON.parse(checkMatch[1]!);
					if (
						typeof value !== "object" || value === null || Array.isArray(value) ||
						typeof (value as { command?: unknown }).command !== "string" ||
						!(value as { command: string }).command.trim() ||
						!(Number.isInteger((value as { exitCode?: unknown }).exitCode) || (value as { exitCode?: unknown }).exitCode === null)
					) throw new Error("invalid shape");
					const check = value as { command: string; exitCode: number | null };
					requiredChecks.push({ command: check.command, exitCode: check.exitCode });
					if (check.exitCode !== 0) {
						failedRequiredCheck = true;
						issues.push({
							code: "required-check-failed",
							line: lineNumber,
							message: `required_check no fue satisfactorio: ${check.command} (exitCode ${String(check.exitCode)}).`,
						});
					}
				} catch {
					invalidRequiredCheck = true;
					issues.push({
						code: "invalid-required-check",
						line: lineNumber,
						message: "required_check debe ser JSON con command no vacío y exitCode entero o null.",
					});
				}
			}
		}
	}

	if (statusDeclarations === 0) {
		issues.push({ code: "missing-status", line: 0, message: "Falta una declaración global de status/result/resultado." });
	}
	if (statusDeclarations > 1) {
		issues.push({ code: "duplicate-status", line: statuses[1]?.line ?? statuses[0]?.line ?? 0, message: "Hay más de una declaración global de estado." });
	}
	if (coverageDeclarations === 0) {
		issues.push({ code: "missing-coverage", line: 0, message: "Falta behavior_coverage; se admite como informe legacy." });
	}
	if (coverageDeclarations > 1) {
		issues.push({ code: "duplicate-coverage", line: coverages[1]?.line ?? coverages[0]?.line ?? 0, message: "Hay más de una declaración global de behavior_coverage." });
	}

	const hasFailStatus = statuses.some((entry) => entry.value === "fail");
	const hasInsufficientCoverage = coverages.some((entry) => entry.value === "partial" || entry.value === "none");
	const ambiguous = statusDeclarations !== 1 || invalidStatus || invalidCoverage || coverageDeclarations > 1;
	const status = statusDeclarations === 1 && statuses.length === 1
		? statuses[0]!.value
		: hasFailStatus ? "fail" : null;
	const coverage = coverageDeclarations === 1 && coverages.length === 1 ? coverages[0]!.value : null;
	const outcome: VerificationOutcome = invalidRequiredCheck || failedRequiredCheck || hasInsufficientCoverage || hasFailStatus
		? "fail"
		: ambiguous
			? "unknown"
			: "pass";

	return { outcome, status, coverage, requiredChecks, issues };
}
