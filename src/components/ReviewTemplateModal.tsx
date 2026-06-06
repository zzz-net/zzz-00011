import { useEffect, useState } from 'react';
import { X, Plus, Trash2, Save, Check } from 'lucide-react';
import { useAppStore } from '@/store';
import { cn } from '@/lib/utils';
import type { FC } from 'react';
import type {
  ReviewNodeType,
  ReviewSeverityLevel,
  ReviewTemplate,
  ReviewTemplateNodeConfig,
} from '@/types';
import {
  DEFAULT_REVIEW_TEMPLATES,
  REVIEW_NODE_TYPE_LABEL,
  REVIEW_SEVERITY_LABEL,
} from '@/types';

interface ReviewTemplateModalProps {
  open: boolean;
  onClose: () => void;
}

const ALL_NODE_TYPES: ReviewNodeType[] = [
  'arrival',
  'temperature',
  'anomaly_detect',
  'manual_review',
  'handover',
  'supplier_risk',
  'disposition',
];

const SEVERITY_OPTIONS: ReviewSeverityLevel[] = ['minor', 'moderate', 'major', 'critical'];

const SEVERITY_COLOR: Record<ReviewSeverityLevel, string> = {
  minor: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  moderate: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  major: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  critical: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
};

const ReviewTemplateModal: FC<ReviewTemplateModalProps> = ({ open, onClose }) => {
  const { reviewTemplates, saveReviewTemplate, deleteReviewTemplate } = useAppStore();
  const [selectedId, setSelectedId] = useState<string>('tpl-default');
  const [draft, setDraft] = useState<ReviewTemplate>(DEFAULT_REVIEW_TEMPLATES[0]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const tpl = reviewTemplates.find((t) => t.id === selectedId) || reviewTemplates[0];
    if (tpl) {
      setDraft(JSON.parse(JSON.stringify(tpl)));
      setDirty(false);
    }
  }, [selectedId, open, reviewTemplates]);

  if (!open) return null;

  const updateField = <K extends keyof ReviewTemplate>(key: K, value: ReviewTemplate[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  };

  const updateNode = (idx: number, patch: Partial<ReviewTemplateNodeConfig>) => {
    setDraft((d) => ({
      ...d,
      nodes: d.nodes.map((n, i) => (i === idx ? { ...n, ...patch } : n)),
    }));
    setDirty(true);
  };

  const addNode = (type: ReviewNodeType) => {
    if (draft.nodes.some((n) => n.nodeType === type)) return;
    setDraft((d) => ({
      ...d,
      nodes: [...d.nodes, { nodeType: type, required: false, defaultResponsible: '' }],
    }));
    setDirty(true);
  };

  const removeNode = (idx: number) => {
    setDraft((d) => ({ ...d, nodes: d.nodes.filter((_, i) => i !== idx) }));
    setDirty(true);
  };

  const handleSave = () => {
    saveReviewTemplate(draft);
    setDirty(false);
  };

  const handleNew = () => {
    const newTpl: ReviewTemplate = {
      id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: '新建模板',
      description: '',
      defaultSeverity: 'moderate',
      nodes: [
        { nodeType: 'arrival', required: true, defaultResponsible: '仓储组' },
        { nodeType: 'temperature', required: true, defaultResponsible: '冷链运输' },
        { nodeType: 'anomaly_detect', required: true, defaultResponsible: '质控员' },
        { nodeType: 'disposition', required: true, defaultResponsible: '质量负责人' },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setDraft(newTpl);
    setSelectedId(newTpl.id);
    setDirty(true);
  };

  const handleDelete = () => {
    if (draft.id === 'tpl-default') return;
    if (!confirm(`确定删除模板 "${draft.name}" 吗？`)) return;
    deleteReviewTemplate(draft.id);
    setSelectedId('tpl-default');
  };

  const availableTypes = ALL_NODE_TYPES.filter((t) => !draft.nodes.some((n) => n.nodeType === t));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-slate-100">复盘模板配置</h3>
            {dirty && (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
                未保存
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleNew}
              className="flex items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/10 px-2.5 py-1.5 text-xs text-sky-300 hover:bg-sky-500/20"
            >
              <Plus size={14} /> 新建模板
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <aside className="w-52 shrink-0 border-r border-slate-800 overflow-y-auto p-3 space-y-1.5">
            <p className="px-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">
              模板列表
            </p>
            {reviewTemplates.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={cn(
                  'w-full rounded-md border px-3 py-2 text-left text-xs transition',
                  selectedId === t.id
                    ? 'border-sky-500/60 bg-sky-500/10 text-sky-200'
                    : 'border-transparent text-slate-300 hover:bg-slate-800/60',
                )}
              >
                <div className="font-medium truncate">{t.name}</div>
                <div className="mt-0.5 text-[10px] text-slate-500">
                  {t.nodes.length} 个节点
                </div>
              </button>
            ))}
          </aside>

          <main className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">模板名称</label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  默认严重级别
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {SEVERITY_OPTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => updateField('defaultSeverity', s)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs transition',
                        SEVERITY_COLOR[s],
                        draft.defaultSeverity === s
                          ? 'ring-2 ring-offset-1 ring-offset-slate-900 ring-white/30'
                          : 'opacity-60 hover:opacity-100',
                      )}
                    >
                      {REVIEW_SEVERITY_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">描述（可选）</label>
                <textarea
                  value={draft.description ?? ''}
                  onChange={(e) => updateField('description', e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none resize-none"
                  placeholder="简要说明模板适用场景..."
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-slate-400">
                  复盘节点配置（按时间顺序排列）
                </label>
                {availableTypes.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-500">添加节点：</span>
                    {availableTypes.map((t) => (
                      <button
                        key={t}
                        onClick={() => addNode(t)}
                        className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 hover:border-sky-500 hover:text-sky-300"
                      >
                        + {REVIEW_NODE_TYPE_LABEL[t]}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {draft.nodes.map((node, idx) => (
                  <div
                    key={node.nodeType}
                    className="rounded-lg border border-slate-800 bg-slate-900/60 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 flex items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-500 w-5">
                          {idx + 1}
                        </span>
                        <span className="text-sm font-medium text-slate-200">
                          {REVIEW_NODE_TYPE_LABEL[node.nodeType]}
                        </span>
                        <label className="flex items-center gap-1 text-[11px] text-slate-400 ml-3">
                          <input
                            type="checkbox"
                            checked={node.required}
                            onChange={(e) => updateNode(idx, { required: e.target.checked })}
                            className="rounded border-slate-600 bg-slate-900"
                          />
                          必填
                        </label>
                      </div>
                      <button
                        onClick={() => removeNode(idx)}
                        disabled={draft.id === 'tpl-default' && node.nodeType === 'disposition'}
                        className="rounded p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-30"
                        title="移除节点"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="mt-2 ml-8">
                      <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                        默认负责人
                      </label>
                      <input
                        type="text"
                        value={node.defaultResponsible ?? ''}
                        onChange={(e) => updateNode(idx, { defaultResponsible: e.target.value })}
                        placeholder="如：质控主管"
                        className="w-full rounded border border-slate-700 bg-slate-950/50 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </main>
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 px-5 py-3">
          <button
            onClick={handleDelete}
            disabled={draft.id === 'tpl-default'}
            className="flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20 disabled:opacity-30"
          >
            <Trash2 size={14} /> 删除此模板
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              关闭
            </button>
            <button
              onClick={handleSave}
              disabled={!dirty}
              className="flex items-center gap-1 rounded-md bg-sky-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-400 disabled:opacity-40"
            >
              <Save size={14} /> 保存模板
            </button>
            {dirty && (
              <span className="text-[10px] text-amber-300 flex items-center gap-1">
                <Check size={12} /> 保存后立即生效
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReviewTemplateModal;
