import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkCurrentPublication } from "./review-publication-check.ts";
import { composePrArtifact, type PrArtifactInput } from "./pr-artifact.ts";
import type { Lang } from "./lang.ts";

type GhResult = { status: number; stdout: string; stderr: string };
type Ports = {
	check: typeof checkCurrentPublication;
	remoteHead: (cwd: string, branch: string) => string | undefined;
	gh: (cwd: string, args: string[]) => GhResult;
};

const defaults: Ports = {
	check: checkCurrentPublication,
	remoteHead(cwd, branch) {
		const output = execFileSync("git", ["ls-remote", "origin", `refs/heads/${branch}`], { cwd, encoding: "utf8", timeout: 15_000 }).trim();
		return output.split(/\s+/u)[0] || undefined;
	},
	gh(cwd, args) {
		const result = spawnSync("gh", args, { cwd, encoding: "utf8", timeout: 120_000, env: { ...process.env, GH_PROMPT_DISABLED: "1", GH_PAGER: "cat" } });
		return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? String(result.error ?? "") };
	},
};

export type PrPublicationResult = { ok: true; url: string; title: string; label?: string; exception?: { production: number; productionBytes: number } }
	| { ok: false; reason: string; createdUrl?: string };

function typeLabel(head: string, badge?: string): string | undefined {
	const byBadge = ({ FEAT: "type:feature", F5: "type:feature", FIX: "type:bug", REFACTOR: "type:refactor", DOCS: "type:docs", TEST: "type:chore", CHORE: "type:chore" } as Record<string, string>)[badge?.toUpperCase() ?? ""];
	if (byBadge) return byBadge;
	const type = head.split("/")[0];
	return ({ feat: "type:feature", feature: "type:feature", fix: "type:bug", refactor: "type:refactor", docs: "type:docs", chore: "type:chore", test: "type:chore" } as Record<string, string>)[type!];
}

export function publishPr(cwd: string, input: Omit<PrArtifactInput, "exception">, lang: Lang, ports: Ports = defaults): PrPublicationResult {
	if (!/^[a-zA-Z0-9._-]+$/u.test(input.base) || !/^[a-zA-Z0-9._/-]+$/u.test(input.head) || input.head.startsWith("-")) return { ok: false, reason: "invalid PR refs" };
	const measured = ports.check(cwd, `origin/${input.base}`);
	if (!measured.ok) return { ok: false, reason: measured.reason };
	let remote: string | undefined;
	try { remote = ports.remoteHead(cwd, input.head); }
	catch { return { ok: false, reason: "remote branch unavailable" }; }
	if (remote !== measured.headOid) return { ok: false, reason: "remote branch does not match the reviewed commit" };
	const artifact = composePrArtifact({ ...input, ...(measured.exception ? { exception: measured.exception } : {}) }, lang);
	if (!artifact.ok) return artifact;
	const directory = mkdtempSync(join(tmpdir(), "ein-pr-"));
	let createdUrl: string | undefined;
	try {
		const bodyFile = join(directory, "body.md");
		writeFileSync(bodyFile, artifact.body, { mode: 0o600 });
		const created = ports.gh(cwd, ["pr", "create", "--base", input.base, "--head", input.head, "--title", artifact.title, "--body-file", bodyFile]);
		if (created.status !== 0) return { ok: false, reason: `gh pr create failed: ${created.stderr.trim().slice(0, 300)}` };
		createdUrl = created.stdout.trim().split(/\s+/u).find((item) => /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/u.test(item));
		if (!createdUrl) return { ok: false, reason: "PR may have been created but its URL is unavailable; inspect GitHub before retrying" };
		let label: string | undefined;
		const desired = typeLabel(input.head, input.badge);
		if (desired) {
			const available = ports.gh(cwd, ["label", "list", "--limit", "100", "--json", "name"]);
			if (available.status !== 0) return { ok: false, reason: "PR created but labels could not be checked; inspect it before retrying", createdUrl };
			let labels: unknown;
			try { labels = JSON.parse(available.stdout); } catch { return { ok: false, reason: "PR created but label listing is malformed; inspect it before retrying", createdUrl }; }
			if (!Array.isArray(labels)) return { ok: false, reason: "PR created but label listing is unavailable; inspect it before retrying", createdUrl };
			if (labels.some((entry) => entry?.name === desired)) {
				const edited = ports.gh(cwd, ["pr", "edit", createdUrl, "--add-label", desired]);
				if (edited.status !== 0) return { ok: false, reason: `PR created but ${desired} was not applied; inspect it before retrying`, createdUrl };
				label = desired;
			}
		}
		const viewed = ports.gh(cwd, ["pr", "view", createdUrl, "--json", "url,title,body,baseRefName,headRefName,state,labels"]);
		if (viewed.status !== 0) return { ok: false, reason: "PR created but read-back failed; inspect it before retrying", createdUrl };
		let data: any;
		try { data = JSON.parse(viewed.stdout); } catch { return { ok: false, reason: "PR created but read-back is malformed; inspect it before retrying", createdUrl }; }
		if (data.url !== createdUrl || data.title !== artifact.title || String(data.body ?? "").trimEnd() !== artifact.body.trimEnd() || data.baseRefName !== input.base || data.headRefName !== input.head || data.state !== "OPEN" || label && !Array.isArray(data.labels) || label && !data.labels.some((entry: any) => entry?.name === label)) {
			return { ok: false, reason: "PR created but its published fields differ; inspect it before retrying", createdUrl };
		}
		return { ok: true, url: createdUrl, title: artifact.title, ...(label ? { label } : {}), ...(measured.exception ? { exception: measured.exception } : {}) };
	} catch { return { ok: false, reason: "PR publication failed; inspect GitHub before retrying", ...(createdUrl ? { createdUrl } : {}) }; }
	finally { try { rmSync(directory, { recursive: true, force: true }); } catch {} }
}
