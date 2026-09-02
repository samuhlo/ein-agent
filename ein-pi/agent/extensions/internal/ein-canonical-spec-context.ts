// =============================================================================
// EIN CANONICAL SPEC CONTEXT
// Selects a bounded, hash-addressed OpenSpec context for scope and design
// prompts. It never globs domains or truncates an oversized selection.
// =============================================================================

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	DOMAIN_ID_PATTERN,
	sha256,
} from "../../lib/openspec-spec-contract.ts";
import { resolveChangesDir } from "../../lib/sdd-router.ts";

const CANONICAL_SPEC_MAX_FILES = 3;
const CANONICAL_SPEC_MAX_BYTES = 32 * 1024;

type CanonicalSpecReference = {
	path: string;
	sha256: string;
	bytes: number;
};

type CanonicalSpecContext = {
	status: "ok" | "blocked";
	references: CanonicalSpecReference[];
	message?: string;
};

function domainHints(text: string): string[] {
	const hints = [...text.matchAll(/(?:canonical_spec_domains|domain hints?)\s*:\s*([^\n]+)/gi)]
		.flatMap((match) => match[1].split(","))
		.map((value) => value.trim())
		.filter((value) => DOMAIN_ID_PATTERN.test(value));
	return [...new Set(hints)].sort((left, right) => left.localeCompare(right, "en"));
}

function scopeSpecReferences(scope: string): CanonicalSpecReference[] {
	const references = [...scope.matchAll(/- path: (openspec\/specs\/([a-z0-9]+(?:-[a-z0-9]+)*)\/spec\.md); sha256: ([a-f0-9]{64}); bytes: (\d+)/g)]
		.map((match) => ({
			path: match[1],
			domain: match[2],
			sha256: match[3],
			bytes: Number(match[4]),
		}))
		.filter((reference) =>
			DOMAIN_ID_PATTERN.test(reference.domain) &&
			Number.isSafeInteger(reference.bytes) &&
			reference.bytes >= 0
		)
		.map(({ path, sha256: digest, bytes }) => ({ path, sha256: digest, bytes }));
	return [...new Map(references.map((reference) => [reference.path, reference])).values()]
		.sort((left, right) => left.path.localeCompare(right.path, "en"));
}

export function resolveCanonicalSpecContext(
	cwd: string,
	hints: readonly string[],
): CanonicalSpecContext {
	const domains = [...new Set(hints.filter((hint) => DOMAIN_ID_PATTERN.test(hint)))]
		.sort((left, right) => left.localeCompare(right, "en"));
	if (domains.length > CANONICAL_SPEC_MAX_FILES) {
		return {
			status: "blocked",
			references: [],
			message: "Canonical spec context exceeds 3 files; request a narrower canonical spec selection.",
		};
	}

	const references: CanonicalSpecReference[] = [];
	let totalBytes = 0;
	for (const domain of domains) {
		const path = `openspec/specs/${domain}/spec.md`;
		const absolutePath = join(cwd, path);
		if (!existsSync(absolutePath)) continue;
		const bytes = readFileSync(absolutePath);
		totalBytes += bytes.length;
		if (totalBytes > CANONICAL_SPEC_MAX_BYTES) {
			return {
				status: "blocked",
				references: [],
				message: "Canonical spec context exceeds 32 KiB; request a narrower canonical spec selection.",
			};
		}
		references.push({ path, sha256: sha256(bytes), bytes: bytes.length });
	}
	return { status: "ok", references };
}

export function canonicalSpecPrompt(
	cwd: string,
	agent: "sdd-scope" | "sdd-design",
	task: string,
	change?: string,
): string {
	const changeDir = change ? join(resolveChangesDir(cwd), change) : undefined;
	const scope = agent === "sdd-design" && changeDir && existsSync(join(changeDir, "scope.md"))
		? readFileSync(join(changeDir, "scope.md"), "utf8")
		: "";
	const reused = scopeSpecReferences(scope);
	const mappedHints = agent === "sdd-design" && changeDir && existsSync(join(changeDir, "map.md"))
		? domainHints(readFileSync(join(changeDir, "map.md"), "utf8"))
		: [];
	const hints = agent === "sdd-design"
		? [...reused.map((reference) => reference.path.split("/")[2]), ...mappedHints]
		: domainHints(task);
	const context = resolveCanonicalSpecContext(cwd, hints);
	if (context.status === "blocked") {
		return `\n\n## Canonical OpenSpec context\nBLOCKED: ${context.message} Do not truncate or glob specs; request explicit narrower domain hints.`;
	}
	const referenceLines = context.references.map(
		(reference) => `- path: ${reference.path}; sha256: ${reference.sha256}; bytes: ${reference.bytes}`,
	);
	return `\n\n## Canonical OpenSpec context\nDomain hints: ${hints.join(", ") || "none"}\nRead only these exact canonical paths when needed; never glob domains or read .sdd specs. Record these references in ${agent === "sdd-scope" ? "scope.md" : "design.md"}:\n${referenceLines.join("\n") || "- none"}\nShared hard limit: ${CANONICAL_SPEC_MAX_FILES} files and ${CANONICAL_SPEC_MAX_BYTES} UTF-8 bytes per phase. If a requested selection exceeds it, block and request narrower explicit domain hints; never truncate.`;
}
