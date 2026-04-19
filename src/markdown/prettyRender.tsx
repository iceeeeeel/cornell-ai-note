import { createElement, Fragment, type ReactNode } from "react";
import { TERM_HIGHLIGHT_MAX_CHARS } from "./termHighlight";

/** 行首 # 标题：组 2 为正文（不渲染 #） */
const HEADING_LINE_RE = /^(#{1,6})\s+(.*)$/;

/** ** 与 << >> 交替匹配 */
const HL_RE = /\*\*(.+?)\*\*|<<(.+?)>>/g;

/** 去掉未匹配到的 Markdown 噪声符号（不破坏已配对的 ** / << >> 解析） */
function stripStrayMarkers(s: string): string {
  if (!s) return s;
  return s
    .replace(/\*\*/g, "")
    .replace(/<<|>>/g, "")
    .replace(/#/g, "");
}

/** 标题行内：去掉多余 #，保留 ** 与 << >> 供后续解析 */
function stripHeadingInnerNoise(s: string): string {
  if (!s) return s;
  return s.replace(/#/g, "");
}

function applyHighlights(text: string, keyPrefix: string): ReactNode {
  const nodes: ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  HL_RE.lastIndex = 0;
  while ((m = HL_RE.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(stripStrayMarkers(text.slice(last, m.index)));
    }
    const inner = m[1] ?? m[2] ?? "";
    const trimmedLen = inner.trim().length;
    const short = trimmedLen > 0 && trimmedLen <= TERM_HIGHLIGHT_MAX_CHARS;
    const displayInner = stripStrayMarkers(inner);
    nodes.push(
      short ? (
        <mark key={`${keyPrefix}-m${k++}`} className="md-hl md-hl--term">
          {displayInner}
        </mark>
      ) : (
        <span key={`${keyPrefix}-plain${k++}`}>{displayInner}</span>
      )
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    nodes.push(stripStrayMarkers(text.slice(last)));
  }
  return nodes.length ? <Fragment>{nodes}</Fragment> : text;
}

/** 单行：不显示 #、**、<<、>>；标题仅靠字号与字重 */
export function renderPrettyLine(line: string, key: string): ReactNode {
  const hm = HEADING_LINE_RE.exec(line);
  if (hm) {
    const level = Math.min(hm[1].length, 6);
    const innerRaw = hm[2];
    const inner = stripHeadingInnerNoise(innerRaw);
    const tag = `h${level}` as keyof JSX.IntrinsicElements;
    const cls =
      level === 1
        ? "md-title md-h1-paper"
        : level === 2
          ? "md-title md-h2-paper"
          : `md-title md-title--${level}`;
    return createElement(
      tag,
      { className: cls },
      applyHighlights(inner, `${key}-h`)
    );
  }
  if (line.trim() === "") {
    return <span className="md-blank" aria-hidden />;
  }
  return (
    <p className="md-p">{applyPrettyInlines(line, key)}</p>
  );
}

function applyPrettyInlines(text: string, key: string): ReactNode {
  return applyHighlights(text, key);
}

/** 多行笔记块 */
export function renderPrettyBlock(text: string, keyPrefix: string): ReactNode {
  const lines = text.split("\n");
  return (
    <div className="md-block">
      {lines.map((line, i) => (
        <div key={`${keyPrefix}-L${i}`} className="md-line-wrap">
          {renderPrettyLine(line, `${keyPrefix}-${i}`)}
        </div>
      ))}
    </div>
  );
}
