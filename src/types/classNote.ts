/** 引用：行号从 1 起；图片用前端生成的 id */
export type EvidenceRef =
  | { type: "line"; line: number }
  | { type: "image"; imageId: string };

export type OutlineItem = { text: string; evidence: EvidenceRef[] };
export type ConceptItem = {
  term: string;
  oneLiner?: string;
  evidence: EvidenceRef[];
};
export type QuestionItem = {
  question: string;
  angle?: string;
  helps_with?: string;
  evidence: EvidenceRef[];
};

export type MindmapNode = { label: string; children?: MindmapNode[] };

/** 多模态整理 API 返回（JSON）；精修按 Row ID 映射，顺序无关、合并稳定 */
export type AiMultimodalOutput = {
  /** 按行 id 的精修 Markdown；键必须与请求中的 row.id 一致 */
  refined_by_row_id: Record<string, string>;
  questions: [string, string, string];
  /** 由各行精修按顺序拼接，用于导图；可与 API 返回的 markdown_content 二选一 */
  markdown_content: string;
};

/** @deprecated 旧版结构化输出，仅兼容历史数据 */
export type AiClassOutput = {
  integrated_notes: string;
  outline: OutlineItem[];
  concepts: ConceptItem[];
  questions: QuestionItem[];
  mindmap: MindmapNode;
};

/** 行块内图片 */
export type BlockImage = {
  id: string;
  filename: string;
  dataUrl: string;
  ocrText: string;
};

/** 一行：中间速记 + 右侧感悟 */
export type RowBlock = {
  id: string;
  /** 中间主画布（Markdown 源，原始速记） */
  note: string;
  /** 右侧感悟区 */
  cue: string;
  images: BlockImage[];
  /** AI 精修后对应本行的展示片段（与 note 同源拆分） */
  aiRefinedNote?: string | null;
};

/** API 请求用 */
export type PersistedImage = {
  id: string;
  filename: string;
  dataUrl: string;
  ocrText: string;
  ocrStatus: "idle" | "running" | "done" | "error";
  ocrError?: string;
  /** 该图所在左栏行 id（压平 API 时写入，便于模型将 OCR 并入对应行） */
  rowId?: string;
};

export type NoteDraft = {
  courseTitle: string;
  classDate: string;
  rows: RowBlock[];
  /** 完整精修 Markdown（导图与备份） */
  aiMarkdownContent: string | null;
  /** 上次 AI 返回的导图（由 # / ## 从 aiMarkdownContent 提取） */
  aiMindmap: MindmapNode | null;
  /** 课后反思三问（纯文案） */
  aiQuestions: string[] | null;
};

/** v1 / v2 本地草稿（迁移用） */
export type LegacyNoteDraft = {
  courseTitle?: string;
  classDate?: string;
  leftText?: string;
  rightText?: string;
  images?: PersistedImage[];
  aiResult?: AiClassOutput | null;
};
