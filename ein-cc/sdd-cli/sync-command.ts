import { existsSync } from "node:fs";
import { join } from "node:path";
import { isSafeChangeName, synchronizeOpenSpecFilesystem } from "../../shared/ports/sdd.ts";

export type SyncCliOutcome = "synchronized" | "conflict" | "malformed" | "operational_failure" | "usage";
export type SyncCliResponse = {
	command: "sync";
	change: string | null;
	ok: boolean;
	outcome: SyncCliOutcome;
	canonicalChanged: boolean;
	domains: string[];
	report: string | null;
	code: string | null;
	message: string | null;
};

export type SyncCommandResult = {
	response: SyncCliResponse;
	exitCode: number;
};

function response(value: Omit<SyncCliResponse, "command">): SyncCliResponse {
	return { command: "sync", ...value };
}

function normalizedDiagnostic(directory: string, error: unknown): string {
	const raw = error instanceof Error ? error.message : String(error);
	const root = directory.replaceAll("\\", "/");
	const repositoryRoot = root.endsWith("/") ? root.slice(0, -1) : root;
	return raw
		.replaceAll("\\", "/")
		.replaceAll(repositoryRoot, ".")
		.replace(/\s+/g, " ")
		.trim() || "OpenSpec synchronization failed";
}

const OPEN_SPEC_PARSE_CODES = [
	"invalid-header",
	"invalid-format",
	"invalid-domain",
	"unexpected-blank-line",
	"invalid-scenario-id",
	"invalid-scenario-field",
	"duplicate-scenario-id",
	"invalid-operation",
	"invalid-operation-order",
	"invalid-removal-reason",
	"unexpected-content",
	"empty-operation",
	"invalid-requirement",
] as const;

function isMalformedDiagnostic(diagnostic: string): boolean {
	return OPEN_SPEC_PARSE_CODES.some((code) => diagnostic.includes(code)) ||
		/invalid delta path|duplicate (?:delta|base) domain|domain does not match canonical path/.test(diagnostic);
}

function failure(directory: string, change: string, error: unknown): SyncCommandResult {
	if (!isSafeChangeName(change)) {
		return {
			response: response({
				change,
				ok: false,
				outcome: "malformed",
				canonicalChanged: false,
				domains: [],
				report: null,
				code: "UNSAFE_CHANGE_NAME",
				message: "change name must be a safe repository-relative segment",
			}),
			exitCode: 3,
		};
	}
	if (!existsSync(join(directory, "openspec", "changes", change))) {
		return {
			response: response({
				change,
				ok: false,
				outcome: "malformed",
				canonicalChanged: false,
				domains: [],
				report: null,
				code: "CHANGE_NOT_FOUND",
				message: `change '${change}' was not found in openspec/changes`,
			}),
			exitCode: 3,
		};
	}

	const diagnostic = normalizedDiagnostic(directory, error);
	const malformed = isMalformedDiagnostic(diagnostic);
	return {
		response: response({
			change,
			ok: false,
			outcome: malformed ? "malformed" : "operational_failure",
			canonicalChanged: false,
			domains: [],
			report: null,
			code: malformed ? "MALFORMED_OPENSPEC" : "OPERATIONAL_ERROR",
			message: malformed ? `malformed OpenSpec input: ${diagnostic}` : diagnostic,
		}),
		exitCode: malformed ? 3 : 4,
	};
}

export async function runSyncCommand(directory: string, args: readonly string[]): Promise<SyncCommandResult> {
	if (args.length !== 1) {
		return {
			response: response({
				change: null,
				ok: false,
				outcome: "usage",
				canonicalChanged: false,
				domains: [],
				report: null,
				code: "USAGE",
				message: "usage: ein-cc-sdd sync <change>",
			}),
			exitCode: 64,
		};
	}

	const change = args[0]!;
	try {
		const result = await synchronizeOpenSpecFilesystem(directory, change);
		const domains = result.plan.domains
			.map((domain) => domain.domain)
			.sort((left, right) => left.localeCompare(right, "en"));
		const synchronized = !result.changed || result.plan.state === "synchronized";
		const canonicalChanged = result.changed && result.plan.state === "synchronized" &&
			result.plan.domains.some((domain) => domain.before !== domain.after);
		if (!synchronized) {
			return {
				response: response({
					change,
					ok: false,
					outcome: "conflict",
					canonicalChanged: false,
					domains,
					report: `openspec/changes/${change}/sync-report.md`,
					code: "OPENSPEC_CONFLICT",
					message: "canonical OpenSpec bytes were not changed",
				}),
				exitCode: 2,
			};
		}
		return {
			response: response({
				change,
				ok: true,
				outcome: "synchronized",
				canonicalChanged,
				domains,
				report: `openspec/changes/${change}/sync-report.md`,
				code: null,
				message: null,
			}),
			exitCode: 0,
		};
	} catch (error) {
		return failure(directory, change, error);
	}
}
