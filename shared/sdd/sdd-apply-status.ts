export type DeclaredApplyStatus = "complete" | "partial" | "blocked";

export function collectDeclaredApplyStatuses(content: string): DeclaredApplyStatus[] {
	const statuses: DeclaredApplyStatus[] = [];
	let fence = "";
	for (const line of content.split(/\r?\n/)) {
		const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
		if (marker) {
			if (!fence) fence = marker;
			else if (marker[0] === fence[0] && marker.length >= fence.length) fence = "";
			continue;
		}
		if (fence) continue;
		const match = /^status:\s*(complete|partial|blocked)\s*(?:#.*)?$/i.exec(line);
		if (match) statuses.push(match[1]!.toLowerCase() as DeclaredApplyStatus);
	}
	return statuses;
}
