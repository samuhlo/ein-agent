// The optional Pi questionnaire adapter uses the installed plugin's public
// question/result contract; it never imports its TUI or parses rendered prose.
export type IntentQuestion = {
 question: string;
 header: string;
 options: { label: string; description: string }[];
 multiSelect?: boolean;
};

export function validateIntentQuestionnaire(value: IntentQuestion[]): void {
 if (!Array.isArray(value) || !value.length) throw new Error("Intent questionnaire needs questions");
 const questions = new Set<string>();
 for (const q of value) {
  if (!q || typeof q.question !== "string" || !q.question.trim() || questions.has(q.question)
   || typeof q.header !== "string" || !q.header.trim() || q.header.length > 16
   || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4
   || (q.multiSelect !== undefined && typeof q.multiSelect !== "boolean")) throw new Error("Invalid intent question: use a unique question, a header up to 16 characters and 2–4 alternatives");
  questions.add(q.question);
  const labels = new Set<string>();
  for (const o of q.options) {
   if (!o || typeof o.label !== "string" || !o.label.trim() || o.label.length > 60 || labels.has(o.label)
    || ["Other", "Type something.", "Next"].includes(o.label)
    || typeof o.description !== "string" || !o.description.trim()) throw new Error("Invalid intent option");
   labels.add(o.label);
  }
 }
}

export function questionnaireBatch(expected: IntentQuestion[], input: unknown): IntentQuestion[] | undefined {
 const actual = (input as { questions?: IntentQuestion[] })?.questions;
 if (!Array.isArray(actual) || !actual.length || actual.length > 4) return;
 const key = (q: IntentQuestion) => JSON.stringify({ question: q.question, header: q.header, options: q.options, multiSelect: q.multiSelect ?? false });
 try {
  validateIntentQuestionnaire(actual);
  if (actual.every((q) => expected.some((e) => key(e) === key(q)))) return actual;
 } catch { /* An unrelated questionnaire is not an intent answer. */ }
}

export function questionnaireAnswer(questions: IntentQuestion[], details: unknown): string | undefined {
 const result = details as { answers?: unknown[]; cancelled?: boolean; error?: unknown; globalNote?: unknown };
 if (!result || result.cancelled !== false || result.error || !Array.isArray(result.answers)) return;
 const answers: { question: string; answer: unknown; notes?: string }[] = [];
 const seen = new Set<number>();
 for (const item of result.answers) {
  const a = item as { questionIndex: number; question: string; kind: string; answer: unknown; selected?: unknown; notes?: unknown };
  if (!a || !Number.isInteger(a.questionIndex) || seen.has(a.questionIndex)) return;
  const q = questions[a.questionIndex];
  if (!q || q.question !== a.question) return;
  seen.add(a.questionIndex);
  let answer: unknown;
  if (a.kind === "option" && q.options.some((o) => o.label === a.answer)) answer = a.answer;
  else if (a.kind === "custom" && typeof a.answer === "string" && a.answer.trim()) answer = a.answer;
  else if (a.kind === "multi" && q.multiSelect && Array.isArray(a.selected) && a.selected.length && a.selected.every((label) => q.options.some((o) => o.label === label))) answer = a.selected;
  else if (a.kind === "custom" && a.answer === null) continue;
  else return;
  answers.push({ question: q.question, answer, ...(typeof a.notes === "string" && a.notes.trim() ? { notes: a.notes } : {}) });
 }
 const globalNote = typeof result.globalNote === "string" && result.globalNote.trim() ? result.globalNote : undefined;
 if (!answers.length && !globalNote) return;
 return JSON.stringify({ answers, ...(globalNote ? { globalNote } : {}) });
}

/** Una tanda cancelada no debe descartar las respuestas de otras tandas. */
export function retainOtherQuestionnaireAnswers(text: string | undefined, cancelled: IntentQuestion[]): string | undefined {
 if (!text) return;
 const excluded = new Set(cancelled.map((q) => q.question));
 const retained = text.split("\n").flatMap((line) => {
  const reply = JSON.parse(line);
  const answers = reply.answers.filter((a: { question: string }) => !excluded.has(a.question));
  return answers.length || reply.globalNote ? [JSON.stringify({ ...reply, answers })] : [];
 });
 return retained.length ? retained.join("\n") : undefined;
}
