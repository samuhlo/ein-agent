import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";

import type { VerificationGitEnumeration } from "./sdd-verification-surface.ts";

function git(cwd: string, args: readonly string[]): Buffer {
	return execFileSync("git", ["--no-optional-locks", ...args], {
		cwd,
		encoding: "buffer",
		stdio: ["ignore", "pipe", "pipe"],
		maxBuffer: Number.POSITIVE_INFINITY,
		windowsHide: true,
	});
}

function records(output: Buffer): Buffer[] {
	const result: Buffer[] = [];
	let start = 0;
	for (let index = 0; index < output.length; index += 1) {
		if (output[index] !== 0) continue;
		if (index > start) result.push(output.subarray(start, index));
		start = index + 1;
	}
	if (start !== output.length) throw new Error("Git returned a non-terminated path list");
	return result;
}

function pathText(value: Buffer): string {
	const text = value.toString("utf8");
	if (!Buffer.from(text, "utf8").equals(value)) throw new Error("Git returned a non-UTF-8 path");
	return text;
}

export function enumerateVerificationGit(cwd: string): VerificationGitEnumeration {
	try {
		const rootText = git(cwd, ["rev-parse", "--show-toplevel"]).toString("utf8").trim();
		if (!rootText) return { ok: false, code: "git-root-invalid", reason: "Git returned no repository root" };
		const root = realpathSync(rootText);
		const all = records(git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]));
		const staged = records(git(root, ["ls-files", "--stage", "-z"]));
		const gitlinks = new Set<string>();
		for (const record of staged) {
			const tab = record.indexOf(0x09);
			if (tab < 0) throw new Error("Git returned a malformed stage record");
			const metadata = record.subarray(0, tab).toString("ascii").split(" ");
			if (metadata.length !== 3 || !/^[0-7]{6}$/.test(metadata[0] ?? "") || !/^[0-3]$/.test(metadata[2] ?? "")) throw new Error("Git returned malformed stage metadata");
			if (metadata[2] === "0" && metadata[0] === "160000") gitlinks.add(pathText(record.subarray(tab + 1)));
		}
		const byPath = new Map<string, "file" | "gitlink">();
		for (const value of all) {
			const path = pathText(value);
			byPath.set(path, gitlinks.has(path) ? "gitlink" : "file");
		}
		return {
			ok: true,
			root,
			entries: [...byPath].sort(([left], [right]) => Buffer.from(left).compare(Buffer.from(right))).map(([path, kind]) => ({ path, kind })),
		};
	} catch (error) {
		return { ok: false, code: "git-unavailable", reason: error instanceof Error ? error.message : String(error) };
	}
}
