import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

export type RetiredReferenceClass =
	| "data-home"
	| "legacy-migration"
	| "unclassified";

export interface RetiredReference {
	path: string;
	line: number;
	context: string;
	classification: RetiredReferenceClass;
	reason: string;
}

const RETIRED_PATTERN = /pi-ein|cc-ein|PiEin|CcEin|piEin|ccEin|PI_EIN|CC_EIN/;
const EXACT_EXCLUDED_ROOTS = [
	".git",
	".pi-subagents",
	"node_modules",
	"installer/node_modules",
	"docs-site/node_modules",
	"dist",
	"installer/dist",
	"docs-site/dist",
	"openspec/changes/archive",
];
const EXACT_PROTECTED_ACCEPTANCE_EVIDENCE = new Map<string, ReadonlySet<string>>([
	[
		"openspec/changes/fix-overlay-repaint-recovery/tasks.md",
		new Set([
			"- [ ] 4.2 In an interactive `pi-ein` session with WORKING and TODO visible, launch one async subagent and confirm a single live fleet row appears above TODO, updates while the job runs, and both startup repaint and WORKING updates occur without a keypress.",
		]),
	],
	[
		"openspec/changes/fix-overlay-repaint-recovery/verify-report.md",
		new Set([
			"| Live WORKING updates without a keypress | **blocked / unverified** | Requires an interactive deployed `pi-ein` session; deployment was declined. |",
			"2. **Task 4.2 / interactive acceptance — blocked by user decision:** after deployment, run one interactive `pi-ein` session with WORKING, TODO, and one live async subagent; confirm fleet-before-TODO order, one live fleet row, live updates, startup repaint, and keypress-free WORKING updates.",
		]),
	],
]);

function isInsideExactRoot(path: string, root: string): boolean {
	return path === root || path.startsWith(`${root}/`);
}

export function isExcludedAuditPath(path: string): boolean {
	if (EXACT_EXCLUDED_ROOTS.some((root) => isInsideExactRoot(path, root))) return true;
	return path.split("/").some((part) => part === ".cache" || /^\.[a-f0-9]+-\d+\.bun-build$/.test(part));
}

export function classifyRetiredReference(
	path: string,
	context: string,
): Pick<RetiredReference, "classification" | "reason"> {
	const stablePiHome = /(?:~\/|\$HOME\/)?\.pi-ein(?:\/agent)?/.test(context);
	const containsOnlyHomeSpelling = !/(?:^|[^.\w-])pi-ein(?:$|[^/\w-])/.test(
		context,
	);

	if (stablePiHome && containsOnlyHomeSpelling) {
		return {
			classification: "data-home",
			reason: "stable Pi runtime data home",
		};
	}

	const legacySymbol = /\bLEGACY(?:_[A-Z0-9]+)*\b/.test(context);
	const labelledLegacy =
		/\b(?:legacy|retired|obsolete|old|antigu[oa]s?|retirad[oa]s?|hard cut|rename|renombr)/i.test(
			context,
		);
	const exactChangeEvidence = new Set([
		"openspec/changes/rename-ein-runtime-surfaces/scope.md",
		"openspec/changes/rename-ein-runtime-surfaces/map.md",
		"openspec/changes/rename-ein-runtime-surfaces/design.md",
		"openspec/changes/rename-ein-runtime-surfaces/tasks.md",
		"openspec/changes/rename-ein-runtime-surfaces/apply-progress.md",
		"openspec/changes/rename-ein-runtime-surfaces/specs/installer-runtime/spec.md",
	]);
	const exactAuditEvidence = new Set([
		"tests/helpers/runtime-surface-naming-audit.ts",
		"tests/runtime-surface-naming-audit.test.ts",
	]);
	const exactLegacyFixture = new Set([
		"tests/legacy-runtime-artifacts.test.ts",
		"tests/runtime-surface-transaction.test.ts",
	]);
	const historicalReleaseEvidence = path === "CHANGELOG.md";
	const frozenHistoricalCorpus = path === "evals/apply-corpus.json";
	const protectedAcceptanceEvidence = EXACT_PROTECTED_ACCEPTANCE_EVIDENCE.get(path)?.has(
		context.trim(),
	);

	if (
		legacySymbol ||
		labelledLegacy ||
		exactChangeEvidence.has(path) ||
		exactAuditEvidence.has(path) ||
		exactLegacyFixture.has(path) ||
		historicalReleaseEvidence ||
		frozenHistoricalCorpus ||
		protectedAcceptanceEvidence
	) {
		return {
			classification: "legacy-migration",
			reason: legacySymbol
				? "explicit LEGACY code symbol"
				: protectedAcceptanceEvidence
					? "exact protected acceptance evidence"
					: historicalReleaseEvidence || frozenHistoricalCorpus
					? "immutable historical record"
					: exactAuditEvidence.has(path)
						? "typed naming-audit policy or fixture"
						: exactLegacyFixture.has(path)
							? "exact legacy cleanup fixture"
							: "bounded rename or legacy-migration evidence",
		};
	}

	return {
		classification: "unclassified",
		reason: "retired spelling is neither stable data-home nor bounded legacy evidence",
	};
}

function walkLiveFiles(root: string, current = root): string[] {
	const entries = readdirSync(current, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const absolute = resolve(current, entry.name);
		const path = relative(root, absolute).replaceAll("\\", "/");
		if (isExcludedAuditPath(path)) continue;
		if (entry.isSymbolicLink()) continue;
		if (entry.isDirectory()) files.push(...walkLiveFiles(root, absolute));
		if (entry.isFile() && lstatSync(absolute).isFile()) files.push(absolute);
	}

	return files;
}

export function auditRuntimeSurfaceNames(root: string): RetiredReference[] {
	const absoluteRoot = resolve(root);
	const matches: RetiredReference[] = [];

	for (const absolute of walkLiveFiles(absoluteRoot)) {
		const path = relative(absoluteRoot, absolute).replaceAll("\\", "/");
		if (RETIRED_PATTERN.test(path)) {
			matches.push({
				path,
				line: 0,
				context: `[path] ${path}`,
				...classifyRetiredReference(path, `[path] ${path}`),
			});
		}

		if (lstatSync(absolute).size > 2_000_000) continue;
		let contents: string;
		try {
			contents = readFileSync(absolute, "utf8");
		} catch {
			continue;
		}

		for (const [index, context] of contents.split("\n").entries()) {
			if (!RETIRED_PATTERN.test(context)) continue;
			matches.push({
				path,
				line: index + 1,
				context: context.trim(),
				...classifyRetiredReference(path, context),
			});
		}
	}

	return matches.sort(
		(a, b) => a.path.localeCompare(b.path) || a.line - b.line,
	);
}
