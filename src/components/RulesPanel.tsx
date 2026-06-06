import { useState, useEffect, useRef } from 'react';
import {
  Gauge,
  RotateCcw,
  Save,
  AlertTriangle,
  Thermometer,
  Clock,
  ShieldAlert,
  Download,
  Upload,
  X,
  Check,
  FileJson,
  Info,
} from 'lucide-react';
import { useAppStore } from '@/store';
import {
  DEFAULT_REVIEW_RULES,
  REVIEW_RULES_LABELS,
  REVIEW_RULES_RANGES,
  type ReviewRules,
} from '@/types';
import type { FC } from 'react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

interface RuleFieldProps {
  label: string;
  description: string;
  unit: string;
  value: number;
  defaultValue: number;
  icon: FC<{ className?: string }>;
  iconColor: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}

const RuleField: FC<RuleFieldProps> = ({
  label,
  description,
  unit,
  value,
  defaultValue,
  icon: Icon,
  iconColor,
  min = 0,
  max = 9999,
  step = 1,
  onChange,
}) => {
  const isDefault = value === defaultValue;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className={cn('h-3.5 w-3.5', iconColor)} />
          <span className="text-[11.5px] font-medium text-slate-200">{label}</span>
          {!isDefault && (
            <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1 py-0.5 text-[9.5px] text-amber-300">
              <AlertTriangle className="h-2.5 w-2.5" />
              已修改
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-500">
          默认 {defaultValue}
          {unit}
        </span>
      </div>
      <p className="text-[10px] leading-tight text-slate-500">{description}</p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
          }}
          className="h-8 w-24 rounded-md border border-slate-600 bg-slate-900/60 px-2 text-xs text-slate-100 focus:border-sky-500/60 focus:outline-none focus:ring-1 focus:ring-sky-500/30"
        />
        <span className="text-[11px] text-slate-400">{unit}</span>
      </div>
    </div>
  );
};

const ISSUE_TYPE_COLOR: Record<string, string> = {
  missing_field: 'border-red-500/30 bg-red-500/10 text-red-300',
  non_numeric: 'border-red-500/30 bg-red-500/10 text-red-300',
  out_of_range: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  version_incompatible: 'border-red-500/30 bg-red-500/10 text-red-300',
};

const ISSUE_TYPE_LABEL: Record<string, string> = {
  missing_field: '缺字段',
  non_numeric: '非数字',
  out_of_range: '超范围',
  version_incompatible: '版本不兼容',
};

const RulesPackagePreviewModal: FC = () => {
  const {
    rulesPackagePreview,
    clearRulesPackagePreview,
    applyRulesPackage,
  } = useAppStore();
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!rulesPackagePreview) return null;

  const preview = rulesPackagePreview;
  const { packageData, diffs, issues, hasConflicts, canApply } = preview;

  const handleApply = async () => {
    setApplying(true);
    setResult(null);
    try {
      const r = applyRulesPackage(hasConflicts);
      setResult({ success: r.success, message: r.message });
      if (r.success) {
        setTimeout(() => clearRulesPackagePreview(), 800);
      }
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : '应用失败',
      });
    } finally {
      setApplying(false);
    }
  };

  const fmtTime = (iso: string) => {
    try {
      return format(parseISO(iso), 'yyyy-MM-dd HH:mm:ss');
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !applying && clearRulesPackagePreview()} />
      <div className="relative z-10 mx-4 w-full max-w-2xl overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700/60 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-violet-500/40 bg-violet-500/10">
              <FileJson className="h-4 w-4 text-violet-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">规则配置包导入预览</h3>
              <p className="mt-0.5 text-[11px] text-slate-400">
                文件：{preview.fileName}
              </p>
            </div>
          </div>
          <button
            onClick={() => !applying && clearRulesPackagePreview()}
            disabled={applying}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">
          <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-slate-700/50 bg-slate-800/30 p-3 text-[11px]">
            <div>
              <span className="text-slate-500">规则包版本：</span>
              <span className="text-slate-200">v{packageData.version}</span>
            </div>
            <div>
              <span className="text-slate-500">导出时间：</span>
              <span className="text-slate-200">{fmtTime(packageData.exportedAt)}</span>
            </div>
            <div>
              <span className="text-slate-500">导出人：</span>
              <span className="text-slate-200">{packageData.exportedBy ?? '（未记录）'}</span>
            </div>
            <div>
              <span className="text-slate-500">预览时间：</span>
              <span className="text-slate-200">{fmtTime(preview.timestamp)}</span>
            </div>
            {packageData.description && (
              <div className="col-span-2">
                <span className="text-slate-500">描述：</span>
                <span className="text-slate-200">{packageData.description}</span>
              </div>
            )}
          </div>

          {issues.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[12px] font-medium text-slate-200">
                  校验问题（{issues.length}）
                </span>
              </div>
              <div className="space-y-1.5">
                {issues.map((issue, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex items-start gap-2 rounded-md border px-2.5 py-2 text-[11px]',
                      ISSUE_TYPE_COLOR[issue.type] ?? 'border-slate-600 bg-slate-800/50 text-slate-300',
                    )}
                  >
                    <span className="mt-0.5 inline-flex shrink-0 items-center rounded border border-current/30 bg-current/10 px-1 py-0.5 text-[9.5px]">
                      {ISSUE_TYPE_LABEL[issue.type] ?? issue.type}
                    </span>
                    <span className="flex-1">{issue.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {diffs.length > 0 ? (
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-sky-400" />
                <span className="text-[12px] font-medium text-slate-200">
                  差异项对比（{diffs.length} 处变更）
                </span>
              </div>
              <div className="overflow-hidden rounded-md border border-slate-700/50">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-800/60">
                    <tr className="text-slate-400">
                      <th className="px-3 py-2 text-left font-medium">字段</th>
                      <th className="px-3 py-2 text-right font-medium">当前值</th>
                      <th className="px-3 py-2 text-center font-medium"></th>
                      <th className="px-3 py-2 text-right font-medium">导入值</th>
                      <th className="px-3 py-2 text-right font-medium">合理范围</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/40">
                    {diffs.map((diff) => (
                      <tr key={diff.field} className="bg-slate-900/30">
                        <td className="px-3 py-2 text-slate-200">
                          {REVIEW_RULES_LABELS[diff.field] ?? diff.field}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-400 line-through">
                          {diff.currentValue}
                        </td>
                        <td className="px-3 py-2 text-center text-slate-500">→</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-300">
                          {diff.importedValue}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-500">
                          [{diff.range.min}, {diff.range.max}]
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : canApply ? (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-[11px] text-emerald-300">
              <Check className="h-3.5 w-3.5" />
              规则包中所有阈值与当前配置完全一致，无需变更。
            </div>
          ) : null}

          {result && (
            <div
              className={cn(
                'mt-4 flex items-start gap-2 rounded-md border px-3 py-2.5 text-[11px]',
                result.success
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-red-500/30 bg-red-500/10 text-red-300',
              )}
            >
              {result.success ? <Check className="mt-0.5 h-3.5 w-3.5" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />}
              <span className="flex-1">{result.message}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-700/60 bg-slate-800/30 px-5 py-3">
          <button
            onClick={clearRulesPackagePreview}
            disabled={applying}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-[11.5px] text-slate-300 transition hover:border-slate-500 hover:text-slate-200 disabled:opacity-40"
          >
            取消
          </button>
          <button
            onClick={handleApply}
            disabled={!canApply || applying}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[11.5px] font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-40',
              hasConflicts
                ? 'bg-amber-500 hover:bg-amber-400'
                : 'bg-sky-500 hover:bg-sky-400',
            )}
          >
            {applying && <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/50 border-t-white" />}
            {hasConflicts ? '确认变更并应用' : '应用规则包'}
          </button>
        </div>
      </div>
    </div>
  );
};

const RulesPanel: FC = () => {
  const {
    reviewRules,
    setReviewRules,
    resetReviewRules,
    exportRulesPackage,
    previewRulesPackage,
  } = useAppStore();
  const [local, setLocal] = useState<ReviewRules>(reviewRules);
  const [dirty, setDirty] = useState(false);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocal(reviewRules);
    setDirty(false);
  }, [reviewRules]);

  useEffect(() => {
    if (importMessage) {
      const t = setTimeout(() => setImportMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [importMessage]);

  const update = <K extends keyof ReviewRules>(key: K, value: ReviewRules[K]) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = () => {
    const patch: Partial<ReviewRules> = {};
    for (const k of Object.keys(local) as (keyof ReviewRules)[]) {
      if (local[k] !== reviewRules[k]) patch[k] = local[k];
    }
    if (Object.keys(patch).length > 0) {
      setReviewRules(patch);
    }
  };

  const handleReset = () => {
    setLocal({ ...DEFAULT_REVIEW_RULES });
    resetReviewRules();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMessage(null);
    try {
      const result = await previewRulesPackage(file);
      if (result.success && result.preview) {
        setImportMessage({ type: 'info', text: result.message });
      } else {
        setImportMessage({ type: 'error', text: result.message });
      }
    } catch (err) {
      setImportMessage({
        type: 'error',
        text: err instanceof Error ? err.message : '导入预览失败',
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <div className="space-y-3 rounded-lg border border-slate-700/60 bg-slate-800/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="absolute inset-0 rounded-md bg-violet-500/30 blur-md" />
              <div className="relative flex h-8 w-8 items-center justify-center rounded-md border border-violet-500/40 bg-violet-500/10">
                <Gauge className="h-4 w-4 text-violet-300" />
              </div>
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-wide text-slate-200">复核规则配置</h2>
              <p className="text-[11px] text-slate-500">调整阈值后异常列表与统计卡片将自动重新计算</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={handleImportClick}
              className="group flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800/80 px-2.5 py-1.5 text-[11px] text-slate-300 transition hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-violet-300"
            >
              <Upload className="h-3 w-3" />
              导入规则包
            </button>
            <button
              onClick={exportRulesPackage}
              className="group flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800/80 px-2.5 py-1.5 text-[11px] text-slate-300 transition hover:border-sky-500/40 hover:bg-sky-500/10 hover:text-sky-300"
            >
              <Download className="h-3 w-3" />
              导出规则包
            </button>
            <button
              onClick={handleReset}
              className="group flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800/80 px-2.5 py-1.5 text-[11px] text-slate-300 transition hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-300"
            >
              <RotateCcw className="h-3 w-3 transition group-hover:rotate-[-60deg]" />
              恢复默认
            </button>
            <button
              onClick={handleSave}
              disabled={!dirty}
              className="group flex items-center gap-1.5 rounded-md bg-sky-500 px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
            >
              <Save className="h-3 w-3" />
              保存规则
            </button>
          </div>
        </div>

        {importMessage && (
          <div
            className={cn(
              'flex items-start gap-2 rounded-md border px-3 py-2 text-[11px]',
              importMessage.type === 'success' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
              importMessage.type === 'error' && 'border-red-500/30 bg-red-500/10 text-red-300',
              importMessage.type === 'info' && 'border-sky-500/30 bg-sky-500/10 text-sky-300',
            )}
          >
            {importMessage.type === 'success' ? (
              <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            ) : importMessage.type === 'error' ? (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            ) : (
              <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            )}
            <span className="flex-1">{importMessage.text}</span>
            <button onClick={() => setImportMessage(null)} className="text-current/60 hover:text-current">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          <RuleField
            label="超温判定阈值"
            description="允许温度超出要求范围的偏移量，0 表示严格按范围判定"
            unit="°C"
            value={local.overtempThreshold}
            defaultValue={DEFAULT_REVIEW_RULES.overtempThreshold}
            icon={Thermometer}
            iconColor="text-orange-300"
            min={REVIEW_RULES_RANGES.overtempThreshold.min}
            max={REVIEW_RULES_RANGES.overtempThreshold.max}
            step={0.5}
            onChange={(v) => update('overtempThreshold', v)}
          />
          <RuleField
            label="日志缺失间隔"
            description="相邻两条日志时间差超过该值即判定为缺失"
            unit="分钟"
            value={local.missingLogIntervalMin}
            defaultValue={DEFAULT_REVIEW_RULES.missingLogIntervalMin}
            icon={Clock}
            iconColor="text-yellow-300"
            min={REVIEW_RULES_RANGES.missingLogIntervalMin.min}
            max={REVIEW_RULES_RANGES.missingLogIntervalMin.max}
            step={5}
            onChange={(v) => update('missingLogIntervalMin', v)}
          />
          <RuleField
            label="超温时长严重边界"
            description="单段超温累计时长超过则判定为严重级别"
            unit="分钟"
            value={local.overtempDurationDangerMin}
            defaultValue={DEFAULT_REVIEW_RULES.overtempDurationDangerMin}
            icon={ShieldAlert}
            iconColor="text-red-300"
            min={REVIEW_RULES_RANGES.overtempDurationDangerMin.min}
            max={REVIEW_RULES_RANGES.overtempDurationDangerMin.max}
            step={5}
            onChange={(v) => update('overtempDurationDangerMin', v)}
          />
          <RuleField
            label="超温偏差严重边界"
            description="峰值温度偏差超过则直接判定为严重级别"
            unit="°C"
            value={local.overtempDeltaDanger}
            defaultValue={DEFAULT_REVIEW_RULES.overtempDeltaDanger}
            icon={ShieldAlert}
            iconColor="text-red-300"
            min={REVIEW_RULES_RANGES.overtempDeltaDanger.min}
            max={REVIEW_RULES_RANGES.overtempDeltaDanger.max}
            step={0.5}
            onChange={(v) => update('overtempDeltaDanger', v)}
          />
          <RuleField
            label="缺日志严重边界"
            description="单次缺失间隔超过则判定为严重级别"
            unit="分钟"
            value={local.missingLogGapDangerMin}
            defaultValue={DEFAULT_REVIEW_RULES.missingLogGapDangerMin}
            icon={ShieldAlert}
            iconColor="text-red-300"
            min={REVIEW_RULES_RANGES.missingLogGapDangerMin.min}
            max={REVIEW_RULES_RANGES.missingLogGapDangerMin.max}
            step={10}
            onChange={(v) => update('missingLogGapDangerMin', v)}
          />
        </div>
      </div>

      <RulesPackagePreviewModal />
    </>
  );
};

export default RulesPanel;
