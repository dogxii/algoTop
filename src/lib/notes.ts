import { buildQuestionUrl, type Question } from "./algotop";

export const NOTE_STORAGE_KEY = "algotop:notes:v1";

export type QuestionNote = {
  content: string;
  updatedAt: string;
};

export type UserNotes = Record<string, QuestionNote>;

export function hasQuestionNote(note?: QuestionNote) {
  return Boolean(note?.content.trim());
}

export function readStoredNotes(): UserNotes {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(NOTE_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Record<string, unknown>;

    return Object.entries(parsed).reduce<UserNotes>((items, [id, value]) => {
      if (!value || typeof value !== "object") return items;

      const note = value as Record<string, unknown>;
      if (typeof note.content !== "string" || note.content.length === 0) {
        return items;
      }

      items[id] = {
        content: note.content,
        updatedAt:
          typeof note.updatedAt === "string"
            ? note.updatedAt
            : "1970-01-01T00:00:00.000Z",
      };

      return items;
    }, {});
  } catch {
    return {};
  }
}

export function writeStoredNotes(notes: UserNotes) {
  if (typeof window === "undefined") return;

  if (Object.keys(notes).length === 0) {
    window.localStorage.removeItem(NOTE_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(NOTE_STORAGE_KEY, JSON.stringify(notes));
}

export function makeNoteMarkdown(question: Question, note: QuestionNote) {
  const lines = [
    `# ${question.displayId}. ${question.title}`,
    "",
    note.content.trim(),
    "",
    `[题目链接](${buildQuestionUrl(question)})`,
    "",
  ];

  return lines.join("\n");
}

export function makeNoteFilename(question: Question) {
  const rawName = `${question.displayId}-${question.slug || question.title}`;
  const safeName = rawName
    .replace(/[\\/:*?"<>|#\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `${safeName || "algotop-note"}.md`;
}

export function makeNoteImageFilename(question: Question) {
  return makeNoteFilename(question).replace(/\.md$/i, ".png");
}
