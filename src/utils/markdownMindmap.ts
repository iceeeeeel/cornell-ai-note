import type { MindmapNode } from "../types/classNote";
import { MINDMAP_ROOT_LABEL } from "./mindmapJump";

/** 仅从整理稿中提取 # / ## 行构建导图骨架 */
export function markdownHeadingsToMindmap(md: string): MindmapNode | null {
  const lines = md.split("\n");
  let root: MindmapNode = { label: MINDMAP_ROOT_LABEL, children: [] };
  let currentH1: MindmapNode | null = null;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h1 = line.match(/^#\s+(.+)$/);
    const h2 = line.match(/^##\s+(.+)$/);
    if (h1) {
      const node: MindmapNode = { label: h1[1].trim(), children: [] };
      root.children = root.children ?? [];
      root.children.push(node);
      currentH1 = node;
    } else if (h2) {
      const node: MindmapNode = { label: h2[1].trim() };
      if (currentH1) {
        currentH1.children = currentH1.children ?? [];
        currentH1.children.push(node);
      } else {
        root.children = root.children ?? [];
        root.children.push(node);
      }
    }
  }

  const hasKids = root.children && root.children.length > 0;
  if (!hasKids) return null;
  return root;
}

/** 将完整 Markdown 按行均匀拆到多行块，用于与原始行一一对应展示 */
export function splitMarkdownIntoRowChunks(
  markdown: string,
  rowCount: number
): string[] {
  if (rowCount <= 0) return [];
  const trimmed = markdown.trim();
  if (!trimmed) return Array.from({ length: rowCount }, () => "");
  const lines = trimmed.split("\n");
  const n = lines.length;
  const chunks: string[] = [];
  for (let i = 0; i < rowCount; i++) {
    const start = Math.floor((i * n) / rowCount);
    const end = Math.floor(((i + 1) * n) / rowCount);
    chunks.push(lines.slice(start, end).join("\n"));
  }
  return chunks;
}
