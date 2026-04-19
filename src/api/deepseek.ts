import type { AiMultimodalOutput, PersistedImage } from "../types/classNote";
import { splitMarkdownIntoRowChunks } from "../utils/markdownMindmap";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

/** 用户 Prompt：逐行精修 + refined_by_row_id 回填 */
export const ACADEMIC_ASSISTANT_USER_PROMPT = `你是一名顶级学术助教。下方「rows」数组是康奈尔笔记左栏每一行的原始速记（每行有稳定 id），另有「各图 OCR」与「图与行对应」表。请通读之后，对**每一行单独**做精修美化（补足漏字、理清结构），但须尊重原意。

图片与 OCR：凡「图与行对应」中标明某图属于某行 id 时，你必须阅读该图对应 OCR，将与该行主题相关、且速记中未写全的要点**自然并入该行**的精修正文（写成连贯句子，勿整段机械粘贴 OCR）。若 OCR 与该行无关可略。无图或无 OCR 时勿编造。

格式要求（针对每一行精修字符串）：使用 Markdown。# 为大标题，## 为子标题。
术语标记：仅对真正的学术专有名词使用 << >> 包裹（例如：结构、子系统、边界、三角关系）；每个片段**至多 12 个字符**（约 2～6 个词），禁止对短语以上长度或整句使用 << >>。严禁在以「-」「·」「*」或数字序号等列表引导符开头的行里，把引导符本身或紧跟其后的连接词用 << >> 标出。
若需强调非专有名词，可用 **短片段**（同样至多约 12 字），禁止整句加粗；超长内容不要加标记。

输出约束：请仅返回一个 JSON 对象，字段如下（不要输出 JSON 以外的任何文字）：
- refined_by_row_id：对象类型。键（key）必须**逐字等于**输入 rows 里每一行的 id 字符串，不能增删键；值为该行精修后的 Markdown 字符串。某行若无内容可输出空字符串 ""。
- questions：字符串数组，恰好 3 条课后思考题。

严禁合并或拆分行：输出中的键集合必须与输入 rows 的 id 集合完全一致。`;

export type FetchClassAiResult =
  | { ok: true; result: AiMultimodalOutput }
  | { ok: false; errorMessage: string };

function extractJsonObject(text: string): string {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return text;
  return text.slice(first, last + 1);
}

/** 将 API 返回规范为 id → 精修字符串；支持误返回数组 [{id, refined}] */
function normalizeRefinedByRowId(
  raw: unknown,
  expectedIds: string[]
): Record<string, string> {
  const empty = (): Record<string, string> =>
    Object.fromEntries(expectedIds.map((id) => [id, ""]));

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const out = empty();
    for (const id of expectedIds) {
      const v = o[id];
      out[id] = typeof v === "string" ? v : v != null ? String(v) : "";
    }
    return out;
  }

  if (Array.isArray(raw)) {
    const out = empty();
    for (const item of raw) {
      if (
        item &&
        typeof item === "object" &&
        "id" in item &&
        "refined" in item
      ) {
        const id = String((item as { id: unknown }).id);
        const refined = String((item as { refined: unknown }).refined);
        if (expectedIds.includes(id)) out[id] = refined;
      }
    }
    return out;
  }

  return empty();
}

function joinMarkdownFromRows(
  rows: Array<{ id: string; note: string }>,
  refined: Record<string, string>
): string {
  return rows.map((r) => refined[r.id]?.trim() ?? "").join("\n");
}

/** 主文本：rows JSON + 每图 OCR，不含 Base64 */
function buildPayloadText(
  courseTitle: string,
  classDate: string,
  rows: Array<{ id: string; note: string }>,
  images: PersistedImage[],
  visionThumbCount: number
): string {
  const ocrBlock =
    images.length === 0
      ? "（无图片）"
      : images
          .map(
            (img, i) =>
              `--- 图 ${i + 1}（${img.filename}）id=${img.id}${img.rowId ? `，所属行 id=${img.rowId}` : ""} ---\n${img.ocrText?.trim() || "（无 OCR 文本）"}`
          )
          .join("\n\n");

  const imageRowMap =
    images.length === 0
      ? []
      : images.map((img, i) => ({
          imageIndex: i + 1,
          imageId: img.id,
          rowId: img.rowId ?? null,
        }));

  const visionHint =
    visionThumbCount > 0
      ? `\n【说明】随后附有 ${visionThumbCount} 张讲义缩略图（长边≤1024px JPEG），请结合上文 OCR 与图像一并理解。第 ${visionThumbCount + 1} 张及以后的图片仅提供 OCR，未附像素图以控制请求体积。`
      : "";

  return [
    ACADEMIC_ASSISTANT_USER_PROMPT,
    "",
    `【课程】${courseTitle || "未命名"}  【日期】${classDate}`,
    "",
    "【rows】左栏每行速记（JSON 数组，每项含 id 与 note）",
    JSON.stringify(rows, null, 2),
    "",
    "【图与行对应】（将各图 OCR 并入对应行 id 的精修时优先参考）",
    JSON.stringify(imageRowMap, null, 2),
    "",
    "【各图 OCR 全文】",
    ocrBlock,
    visionHint,
  ].join("\n");
}

function buildMultimodalUserParts(
  payloadText: string,
  thumbnailDataUrls: string[]
): Array<
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
> {
  const parts: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: payloadText }];
  for (const url of thumbnailDataUrls) {
    const u = url?.trim();
    if (!u) continue;
    parts.push({
      type: "image_url",
      image_url: { url: u },
    });
  }
  return parts;
}

function buildTextOnlyUserContent(
  courseTitle: string,
  classDate: string,
  rows: Array<{ id: string; note: string }>,
  images: PersistedImage[]
): string {
  return [
    ACADEMIC_ASSISTANT_USER_PROMPT,
    "",
    JSON.stringify(
      {
        meta: { courseTitle, classDate },
        rows,
        images: images.map((img, i) => ({
          index: i + 1,
          id: img.id,
          filename: img.filename,
          rowId: img.rowId ?? null,
          ocrText: img.ocrText ?? "",
        })),
      },
      null,
      2
    ),
  ].join("\n");
}

function parseAiResult(
  parsed: Record<string, unknown>,
  rows: Array<{ id: string; note: string }>
): AiMultimodalOutput {
  const expectedIds = rows.map((r) => r.id);
  let refined = normalizeRefinedByRowId(
    parsed.refined_by_row_id,
    expectedIds
  );

  const anyFilled = expectedIds.some((id) => refined[id]?.trim());
  if (!anyFilled) {
    const md =
      typeof parsed.markdown_content === "string"
        ? parsed.markdown_content.trim()
        : "";
    if (md) {
      const chunks = splitMarkdownIntoRowChunks(md, expectedIds.length);
      refined = Object.fromEntries(
        expectedIds.map((id, i) => [id, chunks[i] ?? ""])
      ) as Record<string, string>;
    }
  }

  let qs = Array.isArray(parsed.questions)
    ? parsed.questions.map((q) => String(q).trim())
    : [];
  while (qs.length < 3) qs.push("（请结合笔记自行追问）");
  qs = qs.slice(0, 3);

  const markdown_content = joinMarkdownFromRows(rows, refined);

  return {
    refined_by_row_id: refined,
    questions: qs as [string, string, string],
    markdown_content,
  };
}

export async function fetchClassAiResult(args: {
  apiKey: string | undefined;
  courseTitle: string;
  classDate: string;
  /** 左栏每行 id + 原文，与 UI 行一一对应 */
  rows: Array<{ id: string; note: string }>;
  images: PersistedImage[];
  visionThumbnailDataUrls: string[];
}): Promise<FetchClassAiResult> {
  const key = args.apiKey?.trim();
  if (!key) {
    return { ok: false, errorMessage: "请先点击齿轮配置 API Key。" };
  }

  const thumbs = args.visionThumbnailDataUrls.slice(0, 6);
  const payloadText = buildPayloadText(
    args.courseTitle,
    args.classDate,
    args.rows,
    args.images,
    thumbs.length
  );

  const tryMultimodal = async () => {
    const parts = buildMultimodalUserParts(payloadText, thumbs);
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content:
              "你是 API 调用后端。你必须严格遵守用户要求的 JSON 输出格式，不要输出任何 JSON 以外的文字。",
          },
          {
            role: "user",
            content:
              parts.length === 1 && parts[0].type === "text"
                ? parts[0].text
                : parts,
          },
        ],
        temperature: 0.35,
      }),
    });
    return res;
  };

  const tryTextOnly = async () => {
    const textBody = buildTextOnlyUserContent(
      args.courseTitle,
      args.classDate,
      args.rows,
      args.images
    );
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content:
              "你是 API 调用后端。你必须严格遵守用户要求的 JSON 输出格式，不要输出任何 JSON 以外的文字。",
          },
          { role: "user", content: textBody },
        ],
        temperature: 0.35,
      }),
    });
    return res;
  };

  try {
    let res = await tryMultimodal();
    if (!res.ok) {
      res = await tryTextOnly();
    }
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || `HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      throw new Error("响应无正文");
    }

    const jsonText = extractJsonObject(raw);
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const result = parseAiResult(parsed, args.rows);

    return {
      ok: true,
      result,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      errorMessage: msg.length > 180 ? `${msg.slice(0, 180)}…` : msg,
    };
  }
}
