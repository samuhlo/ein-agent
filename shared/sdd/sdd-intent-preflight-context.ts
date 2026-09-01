/** Minimal runtime-neutral input needed to resolve one SDD intent. */
export type SddIntentPreflightContext = Readonly<{
	cwd: string;
	sessionKey: string;
	notify?: (message: string) => void;
}>;
