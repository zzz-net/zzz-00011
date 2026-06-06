import { useState } from 'react';
import { ScrollText, Search, X, RotateCcw, ChevronDown, ChevronRight, User, Calendar, Info } from 'lucide-react';
import { useAppStore, applyAuditLogFilters } from '@/store';
import { AUDIT_ACTION_LABEL } from '@/services/anomalyEngine';
import type { AuditAction, AuditLog } from '@/types';
import type { FC } from 'react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

const ALL_ACTIONS: AuditAction[] = [
  'import_arrival',
  'import_log',
  'import_review',
  'load_sample',
  'change_rules',
  'review_decision',
  'undo_review',
  'clear_all',
  'export_data',
  'export_rules_package',
  'import_rules_package',
];

function fmtDateTime(iso: string): string {
  try {
    return format(parseISO(iso), 'yyyy-MM-dd HH:mm:ss');
  } catch {
    return iso;
  }
}

const ACTION_COLOR: Record<AuditAction, string> = {
  import_arrival: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  import_log: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  import_review: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  load_sample: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  change_rules: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
  review_decision: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  undo_review: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  clear_all: 'bg-red-500/15 text-red-300 border-red-500/30',
  export_data: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  export_rules_package: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  import_rules_package: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
};

const AuditLogPanel: FC = () => {
  const { auditLogs, auditLogFilter, setAuditLogFilter } = useAppStore();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const filtered = applyAuditLogFilters(auditLogs, auditLogFilter);

  const toggleAction = (a: AuditAction) => {
    const list = auditLogFilter.actions.includes(a)
      ? auditLogFilter.actions.filter((x) => x !== a)
      : [...auditLogFilter.actions, a];
    setAuditLogFilter({ actions: list });
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const resetFilter = () => {
    setAuditLogFilter({ actions: [], operator: '' });
  };

  const hasActiveFilter =
    auditLogFilter.actions.length > 0 || auditLogFilter.operator.length > 0;

  const renderMetadata = (log: AuditLog) => {
    if (!log.metadata) return null;
    const entries = Object.entries(log.metadata);
    if (entries.length === 0) return null;
    return (
      <div className="mt-2 rounded border border-slate-700/40 bg-slate-950/40 p-2 text-[10.5px]">
        <div className="mb-1 flex items-center gap-1 text-slate-400">
          <Info className="h-3 w-3" />
          <span>元数据</span>
        </div>
        <div className="grid grid-cols-2 gap-1 font-mono">
          {entries.map(([k, v]) => (
            <div key={k} className="flex gap-1.5">
              <span className="text-slate-500">{k}:</span>
              <span className="text-slate-300">
                {typeof v === 'object' ? JSON.stringify(v) : String(v)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3 rounded-lg border border-slate-700/60 bg-slate-800/40 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="absolute inset-0 rounded-md bg-slate-500/30 blur-md" />
            <div className="relative flex h-8 w-8 items-center justify-center rounded-md border border-slate-500/40 bg-slate-500/10">
              <ScrollText className="h-4 w-4 text-slate-300" />
            </div>
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-slate-200">审计日志</h2>
            <p className="text-[11px] text-slate-500">
              显示 {filtered.length} / {auditLogs.length} 条操作记录，筛选后的日志将随异常一起导出
            </p>
          </div>
        </div>

        {hasActiveFilter && (
          <button
            onClick={resetFilter}
            className="ml-auto flex items-center gap-1 rounded-md border border-slate-600 bg-slate-900/40 px-2.5 py-1 text-[11px] text-slate-400 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
          >
            <RotateCcw className="h-3 w-3" />
            重置筛选
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={auditLogFilter.operator}
            onChange={(e) => setAuditLogFilter({ operator: e.target.value })}
            placeholder="按操作人搜索..."
            className="h-8 w-48 rounded-md border border-slate-600 bg-slate-900/50 pl-8 pr-7 text-xs text-slate-200 placeholder:text-slate-500 focus:border-sky-500/60 focus:outline-none focus:ring-1 focus:ring-sky-500/30"
          />
          {auditLogFilter.operator && (
            <button
              onClick={() => setAuditLogFilter({ operator: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-slate-400">操作类型：</span>
          <div className="flex flex-wrap gap-1.5">
            {ALL_ACTIONS.map((a) => {
              const active = auditLogFilter.actions.includes(a);
              return (
                <button
                  key={a}
                  onClick={() => toggleAction(a)}
                  className={cn(
                    'rounded-md border px-2 py-1 text-[10.5px] transition',
                    active
                      ? ACTION_COLOR[a]
                      : 'border-slate-600 bg-slate-900/40 text-slate-400 hover:border-slate-500 hover:text-slate-200',
                  )}
                >
                  {AUDIT_ACTION_LABEL[a] ?? a}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-slate-700/60">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            {auditLogs.length === 0
              ? '暂无操作记录，导入数据或进行操作后将在此处显示'
              : '当前筛选条件下无匹配的审计日志'}
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <div className="divide-y divide-slate-700/40">
              {filtered.map((log) => {
                const isExpanded = expanded.has(log.id);
                return (
                  <div key={log.id} className="group">
                    <div
                      onClick={() => toggleExpand(log.id)}
                      className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-[11px] transition hover:bg-slate-700/20"
                    >
                      <button className="flex h-4 w-4 items-center justify-center rounded text-slate-500 hover:bg-slate-700 hover:text-slate-200">
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                      </button>
                      <span className={cn('inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px]', ACTION_COLOR[log.action])}>
                        {AUDIT_ACTION_LABEL[log.action] ?? log.action}
                      </span>
                      <span className="flex-1 truncate text-slate-300">{log.details}</span>
                      <span className="flex shrink-0 items-center gap-1 text-[10px] text-slate-400">
                        <User className="h-2.5 w-2.5 text-slate-500" />
                        {log.operator}
                      </span>
                      <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-slate-500">
                        <Calendar className="h-2.5 w-2.5" />
                        {fmtDateTime(log.timestamp)}
                      </span>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-slate-700/30 bg-slate-900/40 px-10 py-2.5">
                        {renderMetadata(log)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogPanel;
