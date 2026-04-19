import { useEffect } from "react";

type SettingsModalProps = {
  open: boolean;
  apiKey: string;
  onClose: () => void;
  onChangeKey: (v: string) => void;
};

export function SettingsModal({
  open,
  apiKey,
  onClose,
  onChangeKey,
}: SettingsModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const configured = Boolean(apiKey.trim());

  return (
    <div className="modal-root" role="presentation" onMouseDown={onClose}>
      <div
        className="modal-panel rounded-3xl shadow-2xl"
        role="dialog"
        aria-labelledby="modal-ai-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="modal-ai-title" className="modal-title font-serif">
            AI 大脑配置
          </h2>
          <span
            className={`status-pulse${configured ? " status-pulse--ok" : ""}`}
          >
            {configured ? "已配置" : "未配置"}
          </span>
        </div>
        <p className="modal-hint">
          💡 推荐使用 DeepSeek 等国内大模型，无需魔法上网，连接更稳定、响应更极速。
        </p>
        <label className="modal-label">
          <span>API Key</span>
          <input
            type="password"
            className="modal-input"
            autoComplete="off"
            placeholder="sk-…"
            value={apiKey}
            onChange={(e) => onChangeKey(e.target.value)}
          />
          <span className="modal-label__hint">
            将保存在本机浏览器，刷新后仍保留；清空并保存即可删除。
          </span>
        </label>
        <div className="modal-actions">
          <button type="button" className="btn-pill btn-pill--primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
