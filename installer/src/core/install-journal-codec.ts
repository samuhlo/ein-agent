// =============================================================================
// INSTALL JOURNAL CODEC
// Traduce entre bytes canónicos y un diario validado. No conoce filesystem,
// handlers, señales ni lifecycle de instalación.
// =============================================================================

import {
  InstallJournalError,
  type InstallExecutionJournalV1,
} from "./install-journal-contract.ts";
import { isInstallJournalStateReachable } from "./install-journal-reachability.ts";
import { isStructurallyValidInstallJournal } from "./install-journal-shape.ts";

function rejectJournal(): never {
  throw new InstallJournalError("recovery-required");
}

export function validateInstallJournal(
  value: unknown,
): asserts value is InstallExecutionJournalV1 {
  if (!isStructurallyValidInstallJournal(value)) rejectJournal();
  const own = Object.getOwnPropertyDescriptors(value);
  if (!isInstallJournalStateReachable(value, {
    pendingEntryId: own.pendingEntryId !== undefined,
    recoveryCode: own.recoveryCode !== undefined,
  })) rejectJournal();
}

export function encodeInstallJournal(
  journal: InstallExecutionJournalV1,
): Uint8Array {
  validateInstallJournal(journal);
  return new TextEncoder().encode(`${JSON.stringify(journal)}\n`);
}

export function parseInstallJournal(bytes: Uint8Array): InstallExecutionJournalV1 {
  try {
    const text = new TextDecoder().decode(bytes);
    const value: unknown = JSON.parse(text);
    validateInstallJournal(value);
    const canonical = new TextDecoder().decode(encodeInstallJournal(value));
    if (text !== canonical) throw new Error("non-canonical journal");
    return value;
  } catch {
    throw new InstallJournalError("recovery-required");
  }
}
