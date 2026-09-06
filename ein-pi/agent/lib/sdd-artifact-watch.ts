// Child writes do not emit parent tool events. Native recursive file watchers
// can coalesce or miss them, particularly around atomic replacement. Re-read
// the bounded SDD state while the UI session is alive; the overlay deduplicates
// unchanged output. No project files are written and no dependency tree is read.
export function watchSddArtifacts(changed: () => void): () => void {
	const timer = setInterval(changed, 500);
	timer.unref?.();
	return () => clearInterval(timer);
}
