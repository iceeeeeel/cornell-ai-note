import type { MindmapNode, RowBlock } from "../types/classNote";
import { findRowIdForMindmapHeading } from "../utils/mindmapJump";

function TreeNode({
  node,
  depth,
  onLabelClick,
}: {
  node: MindmapNode;
  depth: number;
  onLabelClick: (label: string) => void;
}) {
  return (
    <div className="mm-node" style={{ paddingLeft: depth * 12 }}>
      <div className="mm-line">
        <span className="mm-dash" aria-hidden />
        <button
          type="button"
          className="mm-label mm-label--jump"
          title="跳转到笔记对应位置"
          onClick={() => onLabelClick(node.label)}
        >
          {node.label}
        </button>
      </div>
      {node.children?.map((c, i) => (
        <TreeNode
          key={`${depth}-${i}-${c.label}`}
          node={c}
          depth={depth + 1}
          onLabelClick={onLabelClick}
        />
      ))}
    </div>
  );
}

type MindMapPanelProps = {
  mindmap: MindmapNode | null;
  rows: RowBlock[];
  onJumpToRow: (rowId: string) => void;
};

export function MindMapPanel({
  mindmap,
  rows,
  onJumpToRow,
}: MindMapPanelProps) {
  const hasTree = mindmap && (mindmap.label || mindmap.children?.length);

  const handleLabelClick = (label: string) => {
    const id = findRowIdForMindmapHeading(rows, label);
    if (id) onJumpToRow(id);
  };

  return (
    <aside className="mind-panel">
      {!hasTree ? (
        <p className="mind-panel__empty">
          魔法整理后，此处显示由精修标题生成的导图。
        </p>
      ) : (
        <div className="mind-panel__tree-only">
          <div className="mm-tree">
            <TreeNode node={mindmap!} depth={0} onLabelClick={handleLabelClick} />
          </div>
        </div>
      )}
    </aside>
  );
}
