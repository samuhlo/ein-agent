// =============================================================================
// INSTALL JOURNAL PERSISTENCE
// Compone el codec de dominio con el almacén atómico y traduce sus resultados
// al vocabulario estable que consumen el CLI y la ejecución.
// =============================================================================

import {
  encodeInstallJournal,
  parseInstallJournal,
  validateInstallJournal,
} from "./install-journal-codec.ts";
import {
  InstallJournalError,
  type InstallExecutionJournalV1,
} from "./install-journal-contract.ts";
import {
  inspectStoredInstallJournal,
  productionInstallJournalFs,
  publishStoredInstallJournal,
  type InstallJournalFs,
} from "./install-journal-store.ts";

export type InstallJournalInspection =
  | { status: "missing" }
  | { status: "valid"; journal: InstallExecutionJournalV1 }
  | { status: "invalid" };

export function inspectInstallJournal(
  home: string,
  fs: InstallJournalFs = productionInstallJournalFs,
): InstallJournalInspection {
  const stored = inspectStoredInstallJournal(home, fs);
  if (stored.status !== "available") return stored;
  try {
    return { status: "valid", journal: parseInstallJournal(stored.bytes) };
  } catch {
    return { status: "invalid" };
  }
}

export function publishInstallJournal(
  home: string,
  journal: InstallExecutionJournalV1,
  fs: InstallJournalFs,
): void {
  validateInstallJournal(journal);
  try {
    const bytes = encodeInstallJournal(journal);
    publishStoredInstallJournal(home, journal.transactionId, bytes, fs);
  } catch {
    throw new InstallJournalError("journal-write-failed");
  }
}
