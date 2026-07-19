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

export function makeDefaultNoteContent(question: Question) {
  const title = `${question.displayId}. ${question.title}`
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");

  return [
    `## [${title}](${buildQuestionUrl(question)})`,
    "",
    "```",
    "// 代码写在这里",
    "```",
  ].join("\n");
}

export function isDefaultNoteContent(question: Question, content: string) {
  return content.trim() === makeDefaultNoteContent(question).trim();
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
  const content = note.content.trim();
  if (/^#{1,6}\s/.test(content)) return `${content}\n`;

  const lines = [
    `# ${question.displayId}. ${question.title}`,
    "",
    content,
    "",
    `[题目链接](${buildQuestionUrl(question)})`,
    "",
  ];

  return lines.join("\n");
}

function makeDetachedNoteMarkdown(id: string | undefined, note: QuestionNote) {
  const content = note.content.trim();
  if (/^#{1,6}\s/.test(content)) return `${content}\n`;

  return [`# 题目 ${id || ""}`.trim(), "", content, ""].join("\n");
}

export function makeAllNotesMarkdown(
  items: Array<{ question?: Question; note: QuestionNote; id?: string }>,
) {
  const lines = [
    "# AlgoTop Notes",
    "",
    `导出时间：${new Date().toLocaleString("zh-CN")}`,
    `笔记数量：${items.length}`,
    "",
  ];

  items.forEach(({ id, question, note }, index) => {
    if (index > 0) {
      lines.push("", "---", "");
    }

    lines.push(
      (question
        ? makeNoteMarkdown(question, note)
        : makeDetachedNoteMarkdown(id, note)
      ).trim(),
    );
  });

  return `${lines.join("\n")}\n`;
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
