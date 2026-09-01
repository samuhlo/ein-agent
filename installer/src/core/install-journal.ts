// =============================================================================
// INSTALL JOURNAL
// Fachada pública estable del diario de instalación.
// =============================================================================

export { validateInstallJournal } from "./install-journal-codec.ts";
export {
  installJournalMatchesPlan,
  installPlanDigest,
  InstallJournalError,
  type InstallExecutionJournalV1,
  type InstallJournalEntryState,
  type InstallJournalState,
} from "./install-journal-contract.ts";
export { executeInstallPlanJournaled } from "./install-journal-execution.ts";
export type { InstallJournalLifecycle } from "./install-journal-execution.ts";
export { inspectInstallJournal } from "./install-journal-persistence.ts";
export { installJournalPath } from "./install-journal-store.ts";
export type { InstallJournalFs } from "./install-journal-store.ts";
