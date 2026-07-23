import { useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { markdown } from "@codemirror/lang-markdown";
import { LanguageDescription } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { githubDark } from "@uiw/codemirror-theme-github";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdownSyntax from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import {
  Bold,
  Code2,
  Copy,
  Download,
  Heading2,
  ImageDown,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Minus,
  Strikethrough,
  Underline,
  X,
} from "lucide-react";
import type { Question } from "../lib/algotop";
import { makeNoteImageFilename, type QuestionNote } from "../lib/notes";

type NoteEditorDialogProps = {
  question: Question;
  note?: QuestionNote;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onExport: () => void;
};

const LANGUAGE_ALIASES: Record<string, string> = {
  c: "cpp",
  "c++": "cpp",
  js: "javascript",
  jsx: "javascript",
  md: "markdown",
  sh: "bash",
  shell: "bash",
  ts: "typescript",
  tsx: "typescript",
  zsh: "bash",
};

const CODE_LANGUAGES = [
  LanguageDescription.of({
    name: "JavaScript",
    alias: ["js", "jsx"],
    load: () =>
      import("@codemirror/lang-javascript").then(({ javascript }) =>
        javascript({ jsx: true }),
      ),
  }),
  LanguageDescription.of({
    name: "TypeScript",
    alias: ["ts", "tsx"],
    load: () =>
      import("@codemirror/lang-javascript").then(({ javascript }) =>
        javascript({ jsx: true, typescript: true }),
      ),
  }),
  LanguageDescription.of({
    name: "C++",
    alias: ["c", "cpp"],
    load: () => import("@codemirror/lang-cpp").then(({ cpp }) => cpp()),
  }),
  LanguageDescription.of({
    name: "Java",
    load: () => import("@codemirror/lang-java").then(({ java }) => java()),
  }),
  LanguageDescription.of({
    name: "Python",
    alias: ["py"],
    load: () => import("@codemirror/lang-python").then(({ python }) => python()),
  }),
  LanguageDescription.of({
    name: "Go",
    alias: ["golang"],
    load: () => import("@codemirror/lang-go").then(({ go }) => go()),
  }),
  LanguageDescription.of({
    name: "Rust",
    alias: ["rs"],
    load: () => import("@codemirror/lang-rust").then(({ rust }) => rust()),
  }),
  LanguageDescription.of({
    name: "SQL",
    load: () => import("@codemirror/lang-sql").then(({ sql }) => sql()),
  }),
  LanguageDescription.of({
    name: "JSON",
    load: () => import("@codemirror/lang-json").then(({ json }) => json()),
  }),
];

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("css", css);
hljs.registerLanguage("go", go);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdownSyntax);
hljs.registerLanguage("python", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);

function formatUpdatedAt(value?: string) {
  if (!value) return "新笔记";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "新笔记";

  return window.Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isBlockStart(line: string) {
  const trimmed = line.trim();

  return (
    trimmed.startsWith("```") ||
    /^-{3,}$/.test(trimmed) ||
    /^#{1,3}\s+/.test(line) ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    /^>\s?/.test(line)
  );
}

function highlightCode(code: string, language?: string) {
  const languageName = (language ?? "").trim().toLowerCase();
  const normalizedLanguage = LANGUAGE_ALIASES[languageName] ?? languageName;

  if (normalizedLanguage && hljs.getLanguage(normalizedLanguage)) {
    return hljs.highlight(code, {
      language: normalizedLanguage,
      ignoreIllegals: true,
    }).value;
  }

  return hljs.highlightAuto(code).value;
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function renderInlineMarkdown(text: string) {
  const nodes: ReactNode[] = [];
  const pattern =
    /(`[^`]+`|\*\*[^*]+\*\*|~~[^~]+~~|<u>[^<]+<\/u>|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }

    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(<code key={`${match.index}-code`}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={`${match.index}-strong`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("~~")) {
      nodes.push(<del key={`${match.index}-delete`}>{token.slice(2, -2)}</del>);
    } else if (token.startsWith("<u>")) {
      nodes.push(<u key={`${match.index}-underline`}>{token.slice(3, -4)}</u>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (link) {
        nodes.push(
          <a
            href={link[2]}
            key={`${match.index}-link`}
            target="_blank"
            rel="noreferrer"
          >
            {link[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    }

    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes.length > 0 ? nodes : text;
}

function MarkdownPreview({
  content,
  previewRef,
}: {
  content: string;
  previewRef: RefObject<HTMLDivElement>;
}) {
  const blocks: ReactNode[] = [];
  const lines = content.split(/\r?\n/);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const codeLines: string[] = [];
      const language = trimmed.replace(/^```/, "").trim().split(/\s+/)[0];
      index += 1;

      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }

      blocks.push(
        <pre className="code-block" key={`code-${index}`}>
          <code
            className={language ? `language-${language}` : undefined}
            dangerouslySetInnerHTML={{
              __html: highlightCode(codeLines.join("\n"), language),
            }}
          />
        </pre>,
      );
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const text = renderInlineMarkdown(heading[2]);
      const key = `heading-${index}`;

      if (heading[1].length === 1) {
        blocks.push(<h3 key={key}>{text}</h3>);
      } else if (heading[1].length === 2) {
        blocks.push(<h4 key={key}>{text}</h4>);
      } else {
        blocks.push(<h5 key={key}>{text}</h5>);
      }

      index += 1;
      continue;
    }

    if (/^-{3,}$/.test(trimmed)) {
      blocks.push(<hr key={`hr-${index}`} />);
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: ReactNode[] = [];

      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(
          <li key={`item-${index}`}>
            {renderInlineMarkdown(lines[index].replace(/^[-*]\s+/, ""))}
          </li>,
        );
        index += 1;
      }

      blocks.push(<ul key={`list-${index}`}>{items}</ul>);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: ReactNode[] = [];

      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(
          <li key={`ordered-item-${index}`}>
            {renderInlineMarkdown(lines[index].replace(/^\d+\.\s+/, ""))}
          </li>,
        );
        index += 1;
      }

      blocks.push(<ol key={`ordered-list-${index}`}>{items}</ol>);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];

      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }

      blocks.push(
        <blockquote key={`quote-${index}`}>
          {renderInlineMarkdown(quoteLines.join(" "))}
        </blockquote>,
      );
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;

    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }

    blocks.push(
      <p key={`paragraph-${index}`}>{renderInlineMarkdown(paragraph.join(" "))}</p>,
    );
  }

  return (
    <div className="markdown-preview" ref={previewRef}>
      {blocks.length > 0 ? blocks : <p className="note-preview-empty">暂无笔记</p>}
    </div>
  );
}

export function NoteEditorDialog({
  question,
  note,
  value,
  onChange,
  onClose,
  onExport,
}: NoteEditorDialogProps) {
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const canExport = Boolean(note?.content.trim());
  const editorExtensions = useMemo(
    () => [markdown({ codeLanguages: CODE_LANGUAGES }), EditorView.lineWrapping],
    [],
  );

  function replaceSelection(prefix: string, suffix = "", fallback = "") {
    const view = editorRef.current?.view;
    if (!view) return;

    const selection = view.state.selection.main;
    const selectedText = view.state.sliceDoc(selection.from, selection.to) || fallback;
    const nextText = `${prefix}${selectedText}${suffix}`;
    const anchor = selection.from + prefix.length;
    const head = anchor + selectedText.length;

    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: nextText },
      selection: { anchor, head },
      scrollIntoView: true,
    });
    view.focus();
  }

  function updateUnorderedListSelection() {
    const view = editorRef.current?.view;
    if (!view) return;

    const selection = view.state.selection.main;
    const selectedText = view.state.sliceDoc(selection.from, selection.to) || "要点";
    const nextText = selectedText
      .split("\n")
      .map((line) => (line.startsWith("- ") ? line : `- ${line}`))
      .join("\n");

    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: nextText },
      selection: { anchor: selection.from, head: selection.from + nextText.length },
      scrollIntoView: true,
    });
    view.focus();
  }

  function updateOrderedListSelection() {
    const view = editorRef.current?.view;
    if (!view) return;

    const selection = view.state.selection.main;
    const selectedText = view.state.sliceDoc(selection.from, selection.to) || "步骤";
    const nextText = selectedText
      .split("\n")
      .map((line, index) => (line.match(/^\d+\.\s+/) ? line : `${index + 1}. ${line}`))
      .join("\n");

    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: nextText },
      selection: { anchor: selection.from, head: selection.from + nextText.length },
      scrollIntoView: true,
    });
    view.focus();
  }

  function updateCodeSelection() {
    const view = editorRef.current?.view;
    if (!view) return;

    const selection = view.state.selection.main;
    const selectedText = view.state.sliceDoc(selection.from, selection.to);

    if (selectedText.includes("\n")) {
      replaceSelection("```\n", "\n```", "code");
    } else {
      replaceSelection("`", "`", "code");
    }
  }

  function insertDivider() {
    const view = editorRef.current?.view;
    if (!view) return;

    const selection = view.state.selection.main;
    const previousChar =
      selection.from > 0 ? view.state.sliceDoc(selection.from - 1, selection.from) : "\n";
    const nextChar =
      selection.to < view.state.doc.length
        ? view.state.sliceDoc(selection.to, selection.to + 1)
        : "\n";
    const prefix = previousChar === "\n" ? "" : "\n\n";
    const suffix = nextChar === "\n" ? "\n" : "\n\n";
    const nextText = `${prefix}---${suffix}`;

    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: nextText },
      selection: { anchor: selection.from + nextText.length },
      scrollIntoView: true,
    });
    view.focus();
  }

  async function copyAll() {
    if (!value || isCopying) return;

    setIsCopying(true);
    try {
      await window.navigator.clipboard.writeText(value);
    } finally {
      window.setTimeout(() => setIsCopying(false), 900);
    }
  }

  async function exportPreviewImage() {
    if (!previewRef.current || !canExport || isExportingImage) return;

    const preview = previewRef.current;
    setIsExportingImage(true);

    try {
      const { toPng } = await import("html-to-image");
      const rect = preview.getBoundingClientRect();
      const exportWidth = Math.ceil(Math.max(rect.width, preview.clientWidth));
      const exportHeight = Math.ceil(preview.scrollHeight);
      const dataUrl = await toPng(preview, {
        cacheBust: true,
        pixelRatio: 2,
        width: exportWidth,
        height: exportHeight,
        backgroundColor: window.getComputedStyle(preview).backgroundColor,
        style: {
          width: `${exportWidth}px`,
          height: `${exportHeight}px`,
          maxHeight: "none",
          overflow: "visible",
        },
      });

      downloadDataUrl(dataUrl, makeNoteImageFilename(question));
    } finally {
      setIsExportingImage(false);
    }
  }

  return (
    <section
      className={isFocusMode ? "note-dialog is-focus-mode" : "note-dialog"}
      role="dialog"
      aria-modal="true"
      aria-labelledby="note-dialog-title"
    >
      <header className="note-dialog-head">
        <div>
          <span>{question.displayId}</span>
          <h2 id="note-dialog-title">{question.title}</h2>
        </div>
        <div className="note-window-actions">
          <time>{formatUpdatedAt(note?.updatedAt)}</time>
          <button
            className="editor-icon-button"
            type="button"
            onClick={onClose}
            aria-label="关闭"
            title="关闭"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>
      </header>

      <div className="note-editor-shell">
        <div className="note-editor-bar">
          <div className="note-toolbar-left">
            <div className="note-tools" aria-label="笔记格式">
              <button
                className="editor-icon-button"
                type="button"
                onClick={() => replaceSelection("## ", "", "小标题")}
                aria-label="小标题"
                title="小标题"
              >
                <Heading2 size={16} strokeWidth={1.8} />
              </button>
              <button
                className="editor-icon-button"
                type="button"
                onClick={() => replaceSelection("**", "**", "重点")}
                aria-label="加粗"
                title="加粗"
              >
                <Bold size={16} strokeWidth={1.8} />
              </button>
              <button
                className="editor-icon-button"
                type="button"
                onClick={() => replaceSelection("~~", "~~", "删除线")}
                aria-label="删除线"
                title="删除线"
              >
                <Strikethrough size={16} strokeWidth={1.8} />
              </button>
              <button
                className="editor-icon-button"
                type="button"
                onClick={() => replaceSelection("<u>", "</u>", "下划线")}
                aria-label="下划线"
                title="下划线"
              >
                <Underline size={16} strokeWidth={1.8} />
              </button>
              <button
                className="editor-icon-button"
                type="button"
                onClick={updateUnorderedListSelection}
                aria-label="无序列表"
                title="无序列表"
              >
                <List size={16} strokeWidth={1.8} />
              </button>
              <button
                className="editor-icon-button"
                type="button"
                onClick={updateOrderedListSelection}
                aria-label="有序列表"
                title="有序列表"
              >
                <ListOrdered size={16} strokeWidth={1.8} />
              </button>
              <button
                className="editor-icon-button"
                type="button"
                onClick={insertDivider}
                aria-label="分割线"
                title="分割线"
              >
                <Minus size={16} strokeWidth={1.8} />
              </button>
              <button
                className="editor-icon-button"
                type="button"
                onClick={updateCodeSelection}
                aria-label="代码"
                title="代码"
              >
                <Code2 size={16} strokeWidth={1.8} />
              </button>
            </div>

            <span className="note-tool-separator" aria-hidden="true" />

            <div className="note-tools" aria-label="笔记操作">
              <button
                className="editor-icon-button"
                type="button"
                onClick={copyAll}
                disabled={!value || isCopying}
                aria-label="复制全部"
                title={isCopying ? "已复制" : "复制全部"}
              >
                <Copy size={16} strokeWidth={1.8} />
              </button>
              <button
                className="editor-icon-button"
                type="button"
                onClick={onExport}
                disabled={!canExport}
                aria-label="导出 Markdown"
                title="导出 Markdown"
              >
                <Download size={16} strokeWidth={1.8} />
              </button>
              <button
                className="editor-icon-button"
                type="button"
                onClick={exportPreviewImage}
                disabled={!canExport || isExportingImage}
                aria-label="导出图片"
                title={isExportingImage ? "导出中" : "导出图片"}
              >
                <ImageDown size={16} strokeWidth={1.8} />
              </button>
            </div>
          </div>

          <button
            className="editor-icon-button"
            type="button"
            onClick={() => setIsFocusMode((current) => !current)}
            aria-label={isFocusMode ? "退出全屏" : "全屏写作"}
            title={isFocusMode ? "退出全屏" : "全屏写作"}
          >
            {isFocusMode ? (
              <Minimize2 size={16} strokeWidth={1.8} />
            ) : (
              <Maximize2 size={16} strokeWidth={1.8} />
            )}
          </button>
        </div>

        <div className="note-workspace">
          <section className="note-pane note-pane-editor" aria-label="编辑">
            <CodeMirror
              ref={editorRef}
              className="note-code-editor"
              value={value}
              height="100%"
              theme={githubDark}
              extensions={editorExtensions}
              basicSetup={{
                foldGutter: false,
                highlightActiveLineGutter: false,
              }}
              onChange={onChange}
              placeholder="思路、复杂度、易错点..."
              autoFocus
            />
          </section>
          <section className="note-pane note-pane-preview" aria-label="预览">
            <MarkdownPreview content={value} previewRef={previewRef} />
          </section>
        </div>
      </div>
    </section>
  );
}
