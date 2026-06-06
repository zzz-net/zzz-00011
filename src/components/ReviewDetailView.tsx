import { useState } from 'react';
import {
  ArrowLeft,
  Undo2,
  FileSpreadsheet,
  FileJson,
  Clock,
  User,
  FileText,
  Paperclip,
  CheckSquare,
  AlertTriangle,
  CheckCircle2,
  Hash,
  GripVertical,
  Edit3,
  Save,
  X,
} from 'lucide-react';
import { useAppStore } from '@/store';
import {
  REVIEW_NODE_TYPE_LABEL,
  REVIEW_NODE_TYPE_COLOR,
  REVIEW_SEVERITY_LABEL,
  REVIEW_SEVERITY_COLOR,
  REVIEW_STATUS_LABEL,
  REVIEW_STATUS_COLOR,
} from '@/types';
import type {
  ReviewRecord,
  ReviewNode,
  ReviewLogEntry,
  ReviewNodeEvidence,
} from '@/types';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import type { FC } from 'react';

interface ReviewDetailViewProps {
  review: ReviewRecord;
  onBack: () => void;
}

function fmtDateTime(iso: string): string {
  try {
    return format(parseISO(iso), 'yyyy-MM-dd HH:mm:ss');
  } catch {
    return iso;
  }
}

function fmtDate(iso: string): string {
  try {
    return format(parseISO(iso), 'yyyy-MM-dd HH:mm');
  } catch {
    return iso;
  }
}

const ReviewDetailView: FC<ReviewDetailViewProps> = ({ review, onBack }) => {
  const {
    reviewRecords,
    reviewUndoStack,
    updateReviewNode,
    undoLastReviewNodeEdit,
    exportReviewData,
  } = useAppStore();

  const current = reviewRecords.find((r) => r.id === review.id) || review;
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [draftRemark, setDraftRemark] = useState('');
  const [draftAttachment, setDraftAttachment] = useState('');
  const [draftConclusion, setDraftConclusion] = useState('');
  const [draftResponsible, setDraftResponsible] = useState('');

  const undoCount = reviewUndoStack.filter((u) => u.reviewId === current.id).length;
  const dispositionNode = current.nodes.find((n) => n.nodeType === 'disposition');
  const anomalyNodes = current.nodes.filter((n) => n.nodeType === 'anomaly_detect');
  const requiredMissing = current.nodes.filter((n) => n.required && !n.conclusion);

  const startEdit = (node: ReviewNode) => {
    setEditingNodeId(node.id);
    setDraftRemark(node.remark ?? '');
    setDraftAttachment(node.attachmentName ?? '');
    setDraftConclusion(node.conclusion ?? '');
    setDraftResponsible(node.responsible ?? '');
  };

  const cancelEdit = () => {
    setEditingNodeId(null);
  };

  const saveEdit = () => {
    if (!editingNodeId) return;
    updateReviewNode(current.id, editingNodeId, {
      remark: draftRemark,
      attachmentName: draftAttachment,
      conclusion: draftConclusion,
      responsible: draftResponsible,
    });
    setEditingNodeId(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(56,189,248,0.08),transparent)]" />
      <div className="relative mx-auto max-w-[1600px] px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex items-center gap-1 rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              <ArrowLeft size={14} /> 返回列表
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">{current.title}</h1>
                <span className={cn('rounded-full border px-1.5 py-0.5 text-[10px]', REVIEW_SEVERITY_COLOR[current.severity])}>
                  {REVIEW_SEVERITY_LABEL[current.severity]}
                </span>
                <span className={cn('rounded-full border px-1.5 py-0.5 text-[10px]', REVIEW_STATUS_COLOR[current.status])}>
                  {REVIEW_STATUS_LABEL[current.status]}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-3 text-[11px] text-slate-500">
                <span className="font-mono">{current.id}</span>
                <span>创建：{current.createdBy} @ {fmtDate(current.createdAt)}</span>
                <span>更新：{fmtDate(current.updatedAt)}</span>
                {current.supplierName && <span>供应商：{current.supplierName}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => undoLastReviewNodeEdit(current.id)}
              disabled={undoCount === 0}
              className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-30"
              title={undoCount > 0 ? `可撤销 ${undoCount} 步` : '暂无可撤销操作'}
            >
              <Undo2 size={14} /> 撤销
              {undoCount > 0 && <span className="text-[10px] text-slate-400">({undoCount})</span>}
            </button>
            <button
              onClick={() => exportReviewData('csv', [current.id])}
              className="flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/20"
            >
              <FileSpreadsheet size={14} /> 导出 CSV
            </button>
            <button
              onClick={() => exportReviewData('json', [current.id])}
              className="flex items-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-300 hover:bg-violet-500/20"
            >
              <FileJson size={14} /> 导出 JSON
            </button>
          </div>
        </div>

        {requiredMissing.length > 0 && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200">
            <AlertTriangle size={14} />
            <span>
              有 <b>{requiredMissing.length}</b> 个必填节点尚未填写处置结论：
              {requiredMissing.map((n) => REVIEW_NODE_TYPE_LABEL[n.nodeType]).join('、')}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[11px] text-slate-500">关联批次：</span>
          {current.batchIds.map((bid) => (
            <span
              key={bid}
              className="rounded border border-slate-700 bg-slate-800/60 px-2 py-0.5 font-mono text-[11px] text-slate-300"
            >
              {bid}
            </span>
          ))}
          {current.templateId && (
            <>
              <span className="text-[11px] text-slate-500 ml-3">模板：</span>
              <span className="rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-300">
                {current.templateId}
              </span>
            </>
          )}
        </div>

        <div className="grid grid-cols-3 gap-5">
          <div className="col-span-2 space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold tracking-wide text-slate-200 flex items-center gap-1.5">
                  <Clock size={15} className="text-sky-400" /> 复盘时间线
                </h2>
                <span className="text-[11px] text-slate-500">共 {current.nodes.length} 个节点</span>
              </div>
              <div className="relative pl-6">
                <div className="absolute left-2 top-2 bottom-2 w-px bg-slate-700" />
                {current.nodes.map((node, idx) => (
                  <NodeItem
                    key={node.id}
                    node={node}
                    index={idx}
                    isEditing={editingNodeId === node.id}
                    draftRemark={draftRemark}
                    draftAttachment={draftAttachment}
                    draftConclusion={draftConclusion}
                    draftResponsible={draftResponsible}
                    onRemarkChange={setDraftRemark}
                    onAttachmentChange={setDraftAttachment}
                    onConclusionChange={setDraftConclusion}
                    onResponsibleChange={setDraftResponsible}
                    onStartEdit={() => startEdit(node)}
                    onCancel={cancelEdit}
                    onSave={saveEdit}
                  />
                ))}
              </div>
            </div>

            {dispositionNode && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <h2 className="text-sm font-semibold tracking-wide text-slate-200 mb-3 flex items-center gap-1.5">
                  <CheckSquare size={15} className="text-emerald-400" /> 总体处置结论
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">结论</label>
                    <div className="text-sm text-slate-200">
                      {dispositionNode.conclusion || <span className="text-slate-500">—</span>}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">责任人</label>
                    <div className="flex items-center gap-1 text-sm text-slate-200">
                      <User size={13} className="text-slate-500" />
                      {dispositionNode.responsible || <span className="text-slate-500">未分配</span>}
                    </div>
                  </div>
                  {dispositionNode.remark && (
                    <div className="col-span-2">
                      <label className="block text-[11px] text-slate-500 mb-1">备注</label>
                      <div className="rounded-md bg-slate-950/40 p-2 text-xs text-slate-300 whitespace-pre-wrap">
                        {dispositionNode.remark}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <h2 className="text-sm font-semibold tracking-wide text-slate-200 mb-3 flex items-center gap-1.5">
                <Hash size={15} className="text-rose-400" /> 规则命中
              </h2>
              {anomalyNodes.length === 0 ? (
                <p className="text-xs text-slate-500">无异常命中记录</p>
              ) : (
                <div className="space-y-2">
                  {anomalyNodes.map((node) => (
                    <div key={node.id} className="rounded border border-rose-500/30 bg-rose-500/5 p-2.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <AlertTriangle size={12} className="text-rose-400" />
                        <span className="text-xs font-medium text-rose-200 truncate">
                          {node.title}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {node.ruleHits?.map((r, i) => (
                          <span
                            key={i}
                            className="rounded bg-rose-500/15 px-1.5 py-0.5 font-mono text-[10px] text-rose-300"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        数据源行号：
                        {node.evidences
                          ?.flatMap((e) => e.sourceRowNumbers ?? [])
                          .filter(Boolean)
                          .join(', ') || '—'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <h2 className="text-sm font-semibold tracking-wide text-slate-200 mb-3 flex items-center gap-1.5">
                <Paperclip size={15} className="text-amber-400" /> 证据清单
              </h2>
              {current.nodes.every((n) => !n.evidences || n.evidences.length === 0) ? (
                <p className="text-xs text-slate-500">暂无证据记录</p>
              ) : (
                <div className="space-y-1.5">
                  {current.nodes.flatMap((node) =>
                    (node.evidences ?? []).map((ev, i) => (
                      <EvidenceItem key={`${node.id}-${i}`} node={node} evidence={ev} />
                    )),
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <h2 className="text-sm font-semibold tracking-wide text-slate-200 mb-3 flex items-center gap-1.5">
                <FileText size={15} className="text-slate-400" /> 操作日志
              </h2>
              {current.logs.length === 0 ? (
                <p className="text-xs text-slate-500">暂无操作记录</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {current.logs.map((log) => (
                    <LogItem key={log.id} log={log} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface NodeItemProps {
  node: ReviewNode;
  index: number;
  isEditing: boolean;
  draftRemark: string;
  draftAttachment: string;
  draftConclusion: string;
  draftResponsible: string;
  onRemarkChange: (v: string) => void;
  onAttachmentChange: (v: string) => void;
  onConclusionChange: (v: string) => void;
  onResponsibleChange: (v: string) => void;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}

const NodeItem: FC<NodeItemProps> = ({
  node,
  index,
  isEditing,
  draftRemark,
  draftAttachment,
  draftConclusion,
  draftResponsible,
  onRemarkChange,
  onAttachmentChange,
  onConclusionChange,
  onResponsibleChange,
  onStartEdit,
  onCancel,
  onSave,
}) => {
  const hasConclusion = !!node.conclusion;
  const severityColor = node.severity ? REVIEW_SEVERITY_COLOR[node.severity] : '';

  return (
    <div className="relative pb-5 last:pb-0">
      <div className="absolute -left-4 top-1.5 flex items-center justify-center">
        <div
          className={cn(
            'w-3 h-3 rounded-full border-2 ring-2 ring-offset-1 ring-offset-slate-950',
            node.required && !hasConclusion
              ? 'border-amber-400 bg-amber-400 ring-amber-400/30'
              : hasConclusion
                ? 'border-emerald-400 bg-emerald-400 ring-emerald-400/30'
                : 'border-slate-500 bg-slate-700 ring-slate-500/20',
          )}
        />
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800/60">
          <GripVertical size={12} className="text-slate-600" />
          <span className="font-mono text-[10px] text-slate-500">#{index + 1}</span>
          <span className={cn('rounded px-1.5 py-0.5 text-[10px] border', REVIEW_NODE_TYPE_COLOR[node.nodeType])}>
            {REVIEW_NODE_TYPE_LABEL[node.nodeType]}
          </span>
          <span className="text-sm font-medium text-slate-100 truncate flex-1">{node.title}</span>
          {node.required && !hasConclusion && (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
              必填
            </span>
          )}
          {node.severity && (
            <span className={cn('rounded-full border px-1.5 py-0.5 text-[10px]', severityColor)}>
              {REVIEW_SEVERITY_LABEL[node.severity]}
            </span>
          )}
          {hasConclusion && <CheckCircle2 size={14} className="text-emerald-400" />}
          {!isEditing && (
            <button
              onClick={onStartEdit}
              className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-sky-400"
              title="编辑节点"
            >
              <Edit3 size={13} />
            </button>
          )}
        </div>
        <div className="px-3 py-2.5 space-y-2">
          {node.description && (
            <p className="text-xs text-slate-400">{node.description}</p>
          )}
          <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
            {node.timestamp && (
              <span className="flex items-center gap-1">
                <Clock size={11} /> {fmtDateTime(node.timestamp)}
              </span>
            )}
            {node.responsible && !isEditing && (
              <span className="flex items-center gap-1">
                <User size={11} /> {node.responsible}
              </span>
            )}
            {node.ruleHits && node.ruleHits.length > 0 && (
              <div className="flex items-center gap-1">
                <Hash size={11} />
                <div className="flex flex-wrap gap-1">
                  {node.ruleHits.map((r, i) => (
                    <span
                      key={i}
                      className="rounded bg-violet-500/15 px-1 py-0.5 font-mono text-[10px] text-violet-300"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!isEditing ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-500">负责人：</span>
                  <span className="text-slate-200">{node.responsible || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-500">结论：</span>
                  <span className={cn(node.conclusion ? 'text-emerald-300' : 'text-slate-500')}>
                    {node.conclusion || '未填写'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">附件：</span>
                  <span className="text-slate-200">{node.attachmentName || '-'}</span>
                </div>
              </div>
              {node.remark && (
                <div className="rounded bg-slate-950/40 p-2 text-[11px] text-slate-300 whitespace-pre-wrap border border-slate-800">
                  {node.remark}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2 pt-1 border-t border-slate-800">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">负责人</label>
                  <input
                    type="text"
                    value={draftResponsible}
                    onChange={(e) => onResponsibleChange(e.target.value)}
                    placeholder="姓名/部门"
                    className="w-full rounded border border-slate-700 bg-slate-950/50 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">处置结论</label>
                  <input
                    type="text"
                    value={draftConclusion}
                    onChange={(e) => onConclusionChange(e.target.value)}
                    placeholder="如：放行 / 销毁 / 退货"
                    className="w-full rounded border border-slate-700 bg-slate-950/50 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">附件文件名</label>
                <input
                  type="text"
                  value={draftAttachment}
                  onChange={(e) => onAttachmentChange(e.target.value)}
                  placeholder="如：异常照片_20250115.jpg"
                  className="w-full rounded border border-slate-700 bg-slate-950/50 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">备注</label>
                <textarea
                  value={draftRemark}
                  onChange={(e) => onRemarkChange(e.target.value)}
                  rows={2}
                  placeholder="补充说明、现场情况等..."
                  className="w-full rounded border border-slate-700 bg-slate-950/50 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none resize-none"
                />
              </div>
              <div className="flex items-center justify-end gap-1.5">
                <button
                  onClick={onCancel}
                  className="flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                >
                  <X size={12} /> 取消
                </button>
                <button
                  onClick={onSave}
                  className="flex items-center gap-1 rounded bg-sky-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-sky-400"
                >
                  <Save size={12} /> 保存
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const EvidenceItem: FC<{ node: ReviewNode; evidence: ReviewNodeEvidence }> = ({
  node,
  evidence,
}) => {
  return (
    <div className="rounded border border-slate-800 bg-slate-950/40 p-2">
      <div className="flex items-center gap-2">
        <Paperclip size={11} className="text-amber-400" />
        <span className="text-[11px] font-medium text-slate-200 truncate">
          {evidence.fileName || evidence.dataType}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
        <span>类型：{evidence.dataType}</span>
        {evidence.batchId && <span>批次：{evidence.batchId}</span>}
        {evidence.sourceRowNumbers && evidence.sourceRowNumbers.length > 0 && (
          <span className="font-mono">行号：{evidence.sourceRowNumbers.join(', ')}</span>
        )}
        {evidence.rawValue && <span className="truncate">值：{String(evidence.rawValue)}</span>}
      </div>
      <div className="mt-0.5 text-[10px] text-slate-600">
        来源节点：{REVIEW_NODE_TYPE_LABEL[node.nodeType]}
      </div>
    </div>
  );
};

const LogItem: FC<{ log: ReviewLogEntry }> = ({ log }) => {
  const colorByAction: Record<string, string> = {
    create: 'text-sky-300',
    node_edit: 'text-amber-300',
    status_change: 'text-violet-300',
    conflict_resolve: 'text-rose-300',
    merge: 'text-orange-300',
    export: 'text-emerald-300',
    undo: 'text-cyan-300',
    complete: 'text-emerald-400',
    archive: 'text-slate-500',
  };
  return (
    <div className="rounded border border-slate-800 bg-slate-950/30 px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <span className={cn('text-[10px] font-medium', colorByAction[log.action] || 'text-slate-300')}>
          {log.action.toUpperCase()}
        </span>
        <span className="text-[11px] text-slate-200 flex-1 truncate">{log.summary}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-3 text-[10px] text-slate-500">
        <span>{fmtDateTime(log.timestamp)}</span>
        <span className="flex items-center gap-0.5"><User size={10} /> {log.operator}</span>
      </div>
    </div>
  );
};

export default ReviewDetailView;
