import type { RowBlock } from "../types/classNote";

/** 与 markdownHeadingsToMindmap 根节点文案一致 */
export const MINDMAP_ROOT_LABEL = "课程笔记";

/**
 * 按导图节点标题匹配左栏行：在行内查找以 # / ## 开头的标题行，与导图 label 一致则返回该行 id。
 */
export function findRowIdForMindmapHeading(
  rows: RowBlock[],
  label: string
): string | null {
  const want = label.trim();
  if (!want) return null;
  if (want === MINDMAP_ROOT_LABEL) {
    return rows[0]?.id ?? null;
  }
  for (const row of rows) {
    const src = row.aiRefinedNote ?? row.note ?? "";
    for (const line of src.split("\n")) {
      const t = line.trim();
      const m1 = t.match(/^#\s+(.+)$/);
      const m2 = t.match(/^##\s+(.+)$/);
      const title = (m1?.[1] ?? m2?.[1])?.trim();
      if (title === want) return row.id;
    }
  }
  return null;
}
