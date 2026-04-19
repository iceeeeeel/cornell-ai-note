import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchClassAiResult } from "./api/deepseek";
import { IconGear } from "./components/icons";
import { MindMapPanel } from "./components/MindMapPanel";
import { SettingsModal } from "./components/SettingsModal";
import { WorkspaceRows } from "./components/WorkspaceRows";
import { getInitialApiKey, persistApiKey } from "./state/apiKeyStorage";
import { createEmptyDraft, loadDraft, saveDraft } from "./state/noteStorage";
import type { NoteDraft, RowBlock } from "./types/classNote";
import { markdownHeadingsToMindmap } from "./utils/markdownMindmap";
import { prepareAiInput } from "./utils/prepareAiInput";
import { flattenDraftForApi, rowsWithIdsForApi } from "./utils/draftFlatten";
import { exportElementToPdf } from "./utils/exportPdf";

/** 与 index.css `.ws-rows` 中 --body-size × --body-lh（14 × 1.5）一致 */
const LINE_STEP_PX = 14 * 1.5;

export default function App() {
  const [apiKey, setApiKey] = useState(() => getInitialApiKey());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<NoteDraft>(() => loadDraft());
  const [status, setStatus] = useState<string>("已载入本地草稿。");
  const [warn, setWarn] = useState(false);
  const [busyAi, setBusyAi] = useState(false);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  /** 有精修时：false 左栏逐行精修；true 全局切回速记呈现 */
  const [rawCanvasVisible, setRawCanvasVisible] = useState(false);

  const exportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => saveDraft(draft), 250);
    return () => window.clearTimeout(t);
  }, [draft]);

  useEffect(() => {
    persistApiKey(apiKey);
  }, [apiKey]);

  useEffect(() => {
    if (!activeRowId && draft.rows[0]) setActiveRowId(draft.rows[0].id);
  }, [activeRowId, draft.rows]);

  useEffect(() => {
    if (!draft.aiMarkdownContent?.trim()) setRawCanvasVisible(false);
  }, [draft.aiMarkdownContent]);

  const canAi = useMemo(() => {
    const { leftText, images } = flattenDraftForApi(draft);
    return leftText.trim().length > 0 || images.length > 0;
  }, [draft]);

  const setRows = useCallback((updater: (prev: RowBlock[]) => RowBlock[]) => {
    setDraft((d) => ({ ...d, rows: updater(d.rows) }));
  }, []);

  const runAi = useCallback(async () => {
    setBusyAi(true);
    setWarn(false);
    setStatus("准备整理…");
    try {
      const prepared = await prepareAiInput(draft, (msg) => setStatus(msg));
      setDraft(prepared.nextDraft);
      setStatus("正在请求 AI…");
      const r = await fetchClassAiResult({
        apiKey,
        courseTitle: prepared.nextDraft.courseTitle,
        classDate: prepared.nextDraft.classDate,
        rows: rowsWithIdsForApi(prepared.nextDraft),
        images: prepared.persistedImages,
        visionThumbnailDataUrls: prepared.visionThumbnailDataUrls,
      });
      if (!r.ok) {
        setWarn(true);
        setStatus(r.errorMessage);
        return;
      }
      const md = r.result.markdown_content?.trim() ?? "";
      const refinedMap = r.result.refined_by_row_id;
      const mind = markdownHeadingsToMindmap(md);
      const qs = [...r.result.questions];
      while (qs.length < 3) qs.push("（请结合笔记自行追问）");
      const q3 = qs.slice(0, 3) as [string, string, string];
      setDraft((d) => ({
        ...d,
        aiMarkdownContent: md || null,
        aiMindmap: mind,
        aiQuestions: q3,
        rows: d.rows.map((row) => {
          const refined = refinedMap[row.id];
          const text =
            typeof refined === "string" ? refined.trim() : "";
          return {
            ...row,
            aiRefinedNote: text ? text : null,
          };
        }),
      }));
      setRawCanvasVisible(false);
      setStatus(md ? "魔法整理完成。" : "整理完成，但未返回正文。");
    } finally {
      setBusyAi(false);
    }
  }, [apiKey, draft]);

  const clearAll = useCallback(() => {
    if (
      !window.confirm(
        "确定清除全部内容？将删除所有行、图片、AI 导图与思考题，并恢复为一行空白；课程名与日期也会重置。"
      )
    ) {
      return;
    }
    const next = createEmptyDraft();
    setDraft(next);
    setActiveRowId(next.rows[0].id);
    setHoveredRowId(null);
    setWarn(false);
    setStatus("已清空。");
  }, []);

  const handleMindmapJump = useCallback((rowId: string) => {
    setActiveRowId(rowId);
    queueMicrotask(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-row-id="${rowId}"]`
      );
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const exportPdf = useCallback(async () => {
    if (!exportRef.current) return;
    setExporting(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const title = (draft.courseTitle || "课堂笔记").trim().slice(0, 32);
      const date = draft.classDate || new Date().toISOString().slice(0, 10);
      await exportElementToPdf(exportRef.current, `${date}-${title}.pdf`);
    } finally {
      setExporting(false);
    }
  }, [draft.classDate, draft.courseTitle]);

  const configured = Boolean(apiKey.trim());

  return (
    <div className="app-shell">
      <header className="lux-header">
        <div className="lux-brand font-serif">课堂笔记</div>
        <div className="lux-header__mid">
          <input
            className="lux-input"
            type="text"
            placeholder="课程名称"
            value={draft.courseTitle}
            onChange={(e) => setDraft((d) => ({ ...d, courseTitle: e.target.value }))}
            aria-label="课程"
          />
          <span className="lux-dot" />
          <input
            className="lux-input lux-input--date"
            type="text"
            placeholder="日期"
            value={draft.classDate}
            onChange={(e) => setDraft((d) => ({ ...d, classDate: e.target.value }))}
            aria-label="日期"
          />
        </div>
        <div className="lux-header__actions">
          <button type="button" className="btn-pill btn-pill--muted" onClick={clearAll}>
            清除全文
          </button>
          <button type="button" className="btn-pill" onClick={() => void exportPdf()}>
            导出 PDF
          </button>
          {draft.aiMarkdownContent?.trim() ? (
            <button
              type="button"
              className="lux-icon-btn"
              title={rawCanvasVisible ? "查看精修" : "查看速记"}
              aria-label={rawCanvasVisible ? "查看精修" : "查看速记"}
              onClick={() => setRawCanvasVisible((v) => !v)}
            >
              {rawCanvasVisible ? "✨" : "👁"}
            </button>
          ) : null}
          <button
            type="button"
            className="btn-pill btn-pill--primary"
            disabled={busyAi || !canAi || !configured}
            onClick={() => void runAi()}
          >
            {busyAi ? "整理中…" : "魔法整理"}
          </button>
          <button
            type="button"
            className="lux-gear"
            title="AI 大脑配置"
            aria-label="打开设置"
            onClick={() => setSettingsOpen(true)}
          >
            <IconGear />
          </button>
        </div>
      </header>

      <div className="lux-main-pad">
        <div
          className={`lux-workspace rounded-3xl lux-workspace--shadow${exporting ? " lux-workspace--exporting" : ""}`}
          ref={exportRef}
        >
          <MindMapPanel
            mindmap={draft.aiMindmap}
            rows={draft.rows}
            onJumpToRow={handleMindmapJump}
          />
          <div className="lux-canvas">
            <WorkspaceRows
              rows={draft.rows}
              onRowsChange={setRows}
              lineStepPx={LINE_STEP_PX}
              activeRowId={activeRowId}
              onActiveRow={setActiveRowId}
              hoveredRowId={hoveredRowId}
              onHoverRow={setHoveredRowId}
              globalRawDraft={rawCanvasVisible}
            />
          </div>
        </div>

        {draft.aiQuestions && draft.aiQuestions.length > 0 ? (
          <div className="lux-reflection rounded-3xl lux-workspace--shadow">
            <h2 className="lux-reflection__head">课后反思</h2>
            <div className="lux-bento">
              {draft.aiQuestions.slice(0, 3).map((q, i) => (
                <div key={i} className="lux-bento__card">
                  <span className="lux-bento__idx">问题 {i + 1}</span>
                  <div>{q}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <footer className={warn ? "status-bar status-bar--warn" : "status-bar"}>
        {status}
        {configured ? (
          <span className="status-bar__key"> · API 已配置</span>
        ) : (
          <span className="status-bar__key"> · 点击齿轮配置 API</span>
        )}
      </footer>

      <SettingsModal
        open={settingsOpen}
        apiKey={apiKey}
        onClose={() => setSettingsOpen(false)}
        onChangeKey={setApiKey}
      />
    </div>
  );
}
