export type ParsedSddCloseArgs = {
	change?: string;
	force: boolean;
	reason?: string;
	reconciliationProfile?: string;
	reconciliationEvidencePath?: string;
};

function tokenize(raw: string): string[] {
	const tokens: string[] = [];
	let token = "";
	let quote: "'" | '"' | undefined;
	for (const char of raw.trim()) {
		if (quote) {
			if (char === quote) quote = undefined;
			else token += char;
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
		} else if (/\s/.test(char)) {
			if (token) {
				tokens.push(token);
				token = "";
			}
		} else {
			token += char;
		}
	}
	if (token) tokens.push(token);
	return tokens;
}

function optionValue(tokens: string[], index: number): string | undefined {
	const candidate = tokens[index + 1];
	return candidate && !candidate.startsWith("--") ? candidate : undefined;
}

export function parseSddCloseArgs(args: string | string[]): ParsedSddCloseArgs {
	const tokens = typeof args === "string" ? tokenize(args) : args.map((token) => token.trim()).filter(Boolean);
	const positional: string[] = [];
	let force = false;
	let reason: string | undefined;
	let reconciliationProfile: string | undefined;
	let reconciliationEvidencePath: string | undefined;

	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index]!;
		if (token === "--force") {
			force = true;
			continue;
		}
		const value = optionValue(tokens, index);
		if (token === "--reason") reason = value;
		else if (token === "--reconciliation-profile") reconciliationProfile = value;
		else if (token === "--reconciliation-evidence") reconciliationEvidencePath = value;
		else {
			positional.push(token);
			continue;
		}
		if (value !== undefined) index += 1;
	}

	return {
		change: positional[0],
		force,
		reason,
		reconciliationProfile,
		reconciliationEvidencePath,
	};
}
