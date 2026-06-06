import { useState, useEffect } from 'react';
import { Gauge, RotateCcw, Save, AlertTriangle, Thermometer, Clock, ShieldAlert } from 'lucide-react';
import { useAppStore } from '@/store';
import { DEFAULT_REVIEW_RULES, type ReviewRules } from '@/types';
import type { FC } from 'react';
import { cn } from '@/lib/utils';

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
        <span className="text-[10px] text-slate-500">默认 {defaultValue}{unit}</span>
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

const RulesPanel: FC = () => {
  const { reviewRules, setReviewRules, resetReviewRules } = useAppStore();
  const [local, setLocal] = useState<ReviewRules>(reviewRules);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setLocal(reviewRules);
    setDirty(false);
  }, [reviewRules]);

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

  return (
    <div className="space-y-3 rounded-lg border border-slate-700/60 bg-slate-800/40 p-4">
      <div className="flex items-center justify-between">
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
        <div className="flex items-center gap-1.5">
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

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <RuleField
          label="超温判定阈值"
          description="允许温度超出要求范围的偏移量，0 表示严格按范围判定"
          unit="°C"
          value={local.overtempThreshold}
          defaultValue={DEFAULT_REVIEW_RULES.overtempThreshold}
          icon={Thermometer}
          iconColor="text-orange-300"
          min={0}
          max={20}
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
          min={1}
          max={600}
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
          min={1}
          max={600}
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
          min={0.5}
          max={50}
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
          min={5}
          max={1440}
          step={10}
          onChange={(v) => update('missingLogGapDangerMin', v)}
        />
      </div>
    </div>
  );
};

export default RulesPanel;
