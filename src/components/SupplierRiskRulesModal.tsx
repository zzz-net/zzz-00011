import { useState, useEffect } from 'react';
import {
  X,
  Save,
  RotateCcw,
  AlertTriangle,
  Info,
  Clock,
  BarChart3,
  ThermometerSun,
  FileWarning,
  HelpCircle,
  Swords,
  ClipboardList,
  TrendingUp,
} from 'lucide-react';
import { useAppStore } from '@/store';
import type { FC } from 'react';
import type {
  SupplierRiskLevelRule,
  SupplierRiskRules,
} from '@/types';
import {
  DEFAULT_SUPPLIER_RISK_RULES,
  SUPPLIER_RISK_LEVEL_LABELS,
} from '@/types';
import {
  SUPPLIER_RISK_COLOR,
} from '@/services/supplierRiskService';
import { cn } from '@/lib/utils';

interface SupplierRiskRulesModalProps {
  open: boolean;
  onClose: () => void;
}

const CONDITION_FIELDS: {
  key: keyof SupplierRiskLevelRule['conditions'];
  label: string;
  icon: FC<{ className?: string }>;
  iconColor: string;
}[] = [
  { key: 'minTotalAnomalies', label: '最少异常总数', icon: BarChart3, iconColor: 'text-slate-300' },
  { key: 'minDangerAnomalies', label: '最少严重异常数', icon: AlertTriangle, iconColor: 'text-red-300' },
  { key: 'minOvertempCount', label: '最少超温次数', icon: ThermometerSun, iconColor: 'text-orange-300' },
  { key: 'minMissingLogCount', label: '最少缺日志次数', icon: FileWarning, iconColor: 'text-yellow-300' },
  { key: 'minUnregisteredCount', label: '最少未登记次数', icon: HelpCircle, iconColor: 'text-sky-300' },
  { key: 'minReviewConflictCount', label: '最少复核冲突数', icon: Swords, iconColor: 'text-rose-300' },
  { key: 'minPendingHandovers', label: '最少待交接数', icon: ClipboardList, iconColor: 'text-amber-300' },
  { key: 'minTrendIncrease', label: '趋势增长阈值', icon: TrendingUp, iconColor: 'text-red-300' },
];

const SupplierRiskRulesModal: FC<SupplierRiskRulesModalProps> = ({ open, onClose }) => {
  const { supplierRiskRules, setSupplierRiskRules, resetSupplierRiskRules } = useAppStore();
  const [local, setLocal] = useState<SupplierRiskRules>(supplierRiskRules);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setLocal(supplierRiskRules);
    setDirty(false);
  }, [supplierRiskRules, open]);

  if (!open) return null;

  const updateLevel = (levelIdx: number, condKey: keyof SupplierRiskLevelRule['conditions'], value: number | undefined) => {
    setLocal((prev) => {
      const next = { ...prev, levels: prev.levels.map((l) => ({ ...l, conditions: { ...l.conditions } })) };
      if (value === undefined || isNaN(value) || value < 0) {
        delete next.levels[levelIdx].conditions[condKey];
      } else {
        next.levels[levelIdx].conditions[condKey] = value;
      }
      return next;
    });
    setDirty(true);
  };

  const updateTrendWindow = (v: number) => {
    setLocal((prev) => ({ ...prev, trendWindowDays: Math.max(1, Math.min(90, v)) }));
    setDirty(true);
  };

  const handleSave = () => {
    setSupplierRiskRules(local.levels);
    setSupplierRiskRules({ trendWindowDays: local.trendWindowDays });
    setDirty(false);
  };

  const handleReset = () => {
    resetSupplierRiskRules();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 mx-4 w-full max-w-5xl max-h-[85vh] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-700/60 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-violet-500/40 bg-violet-500/10">
              <BarChart3 className="h-4 w-4 text-violet-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">供应商风险等级规则配置</h3>
              <p className="mt-0.5 text-[11px] text-slate-400">
                规则按优先级从高到低匹配，所有条件全部满足时触发对应等级
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex items-center gap-3 rounded-md border border-slate-700/50 bg-slate-800/30 px-3 py-2.5">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[11px] text-slate-300">趋势统计窗口：</span>
            <input
              type="number"
              min={1}
              max={90}
              value={local.trendWindowDays}
              onChange={(e) => updateTrendWindow(Number(e.target.value))}
              className="h-7 w-20 rounded-md border border-slate-600 bg-slate-900/60 px-2 text-[11px] text-slate-100 focus:border-sky-500/60 focus:outline-none"
            />
            <span className="text-[11px] text-slate-400">天</span>
            <span className="ml-auto text-[10px] text-slate-500">
              用于计算近 N 天异常数的变化趋势
            </span>
          </div>

          <div className="rounded-md border border-sky-500/20 bg-sky-500/5 px-3 py-2">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" />
              <div className="text-[10.5px] text-sky-200/90 leading-relaxed">
                条件留空表示不启用该条件。匹配顺序：严重 → 高风险 → 中风险 → 低风险 → 正常。
                某等级的<strong>所有启用条件</strong>同时满足时触发该等级，否则继续向下匹配。
              </div>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-3">
            {local.levels.map((level, levelIdx) => (
              <div key={level.level} className="rounded-lg border border-slate-700/60 bg-slate-800/40 overflow-hidden">
                <div className={cn('px-3 py-2 border-b border-slate-700/40', SUPPLIER_RISK_COLOR[level.level])}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11.5px] font-medium">
                      {SUPPLIER_RISK_LEVEL_LABELS[level.level]}
                    </span>
                    <span className="text-[9.5px] opacity-80">
                      优先级 {5 - levelIdx}
                    </span>
                  </div>
                </div>
                <div className="space-y-2 p-2.5">
                  {CONDITION_FIELDS.map((cf) => {
                    const val = level.conditions[cf.key];
                    const Icon = cf.icon;
                    return (
                      <div key={cf.key} className="space-y-0.5">
                        <div className="flex items-center gap-1">
                          <Icon className={cn('h-2.5 w-2.5', cf.iconColor)} />
                          <span className="text-[10px] text-slate-400">{cf.label}</span>
                        </div>
                        <input
                          type="number"
                          min={0}
                          placeholder="留空=不启用"
                          value={val ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                              updateLevel(levelIdx, cf.key, undefined);
                            } else {
                              updateLevel(levelIdx, cf.key, Math.max(0, Number(raw)));
                            }
                          }}
                          className="h-6 w-full rounded-md border border-slate-600 bg-slate-900/60 px-1.5 text-[10.5px] text-slate-100 placeholder:text-slate-600 focus:border-sky-500/60 focus:outline-none"
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-slate-700/40 bg-slate-900/30 px-2.5 py-1.5">
                  <div className="flex flex-wrap gap-1 text-[9.5px] text-slate-500">
                    {Object.entries(level.conditions).length === 0 ? (
                      <span>（无条件，始终匹配）</span>
                    ) : (
                      Object.entries(level.conditions).map(([k, v]) => (
                        <span key={k} className="rounded bg-slate-800 px-1 py-0.5">
                          {k}: ≥{v}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-md border border-slate-700/50 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-200">
              <AlertTriangle className="h-3 w-3 text-amber-400" />
              默认规则对照
            </div>
            <div className="grid grid-cols-5 gap-2 text-[10px] text-slate-400">
              {DEFAULT_SUPPLIER_RISK_RULES.levels.map((l) => (
                <div key={l.level} className="space-y-0.5">
                  <div className={cn('inline-flex rounded border px-1.5 py-0.5', SUPPLIER_RISK_COLOR[l.level])}>
                    {SUPPLIER_RISK_LEVEL_LABELS[l.level]}
                  </div>
                  <div className="leading-tight">
                    {Object.entries(l.conditions).map(([k, v]) => (
                      <div key={k}>
                        {k} ≥ {v}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-700/60 bg-slate-800/30 px-5 py-3">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-[11.5px] text-slate-300 transition hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-300"
          >
            <RotateCcw className="h-3 w-3" />
            恢复默认
          </button>
          <button
            onClick={onClose}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-[11.5px] text-slate-300 transition hover:border-slate-500 hover:text-slate-200"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty}
            className="flex items-center gap-1.5 rounded-md bg-sky-500 px-3.5 py-1.5 text-[11.5px] font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
          >
            <Save className="h-3 w-3" />
            保存规则
          </button>
        </div>
      </div>
    </div>
  );
};

export default SupplierRiskRulesModal;
