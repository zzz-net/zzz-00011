import { X, AlertTriangle, Play, FileCode, FileText, Clock } from 'lucide-react';
import type { FC } from 'react';
import { cn } from '@/lib/utils';

interface HelpDrawerProps {
  open: boolean;
  onClose: () => void;
}

interface ReproStep {
  title: string;
  type: string;
  severity: 'danger' | 'warning';
  icon: FC<{ className?: string }>;
  steps: string[];
  code?: string;
}

const reproCases: ReproStep[] = [
  {
    title: '超温异常复现',
    type: 'overtemp',
    severity: 'danger',
    icon: AlertTriangle,
    steps: [
      '准备到货清单 CSV，包含批次 BATCH-TEST-001，要求温度范围 2~8°C',
      '准备温度日志 CSV，该批次包含至少连续 3 条温度 > 8°C 的记录',
      '依次导入到货清单和温度日志',
      '系统自动识别超温区间，在"超温批次"指标和异常表中可见',
      '点击展开行可查看具体超温时间段、峰值温度和原始行号',
    ],
    code: `到货清单行：
BATCH-TEST-001,测试疫苗,2026-06-06 10:00:00,2,8

温度日志行（连续超温）：
BATCH-TEST-001,2026-06-06 09:30:00,4.5
BATCH-TEST-001,2026-06-06 09:35:00,11.0
BATCH-TEST-001,2026-06-06 09:40:00,11.5
BATCH-TEST-001,2026-06-06 09:45:00,4.8`,
  },
  {
    title: '缺日志异常复现',
    type: 'missing_log',
    severity: 'warning',
    icon: Clock,
    steps: [
      '准备到货清单 CSV，批次 BATCH-TEST-002，到货时间 10:00',
      '准备温度日志 CSV，该批次记录仅包含 08:00 和 14:00 两条（间隔>30分钟）',
      '依次导入到货清单和温度日志',
      '系统识别到相邻记录间隔 > 30 分钟，标记为"缺日志"异常',
      '异常详情展示缺失的时间段和间隔分钟数',
    ],
    code: `到货清单：
BATCH-TEST-002,测试试剂,2026-06-06 10:00:00,2,8

温度日志（稀疏）：
BATCH-TEST-002,2026-06-06 08:00:00,5.0
BATCH-TEST-002,2026-06-06 09:00:00,5.1
BATCH-TEST-002,2026-06-06 14:00:00,5.2`,
  },
  {
    title: '坏时间戳与非数字温度复现',
    type: 'bad_data',
    severity: 'warning',
    icon: FileCode,
    steps: [
      '准备温度日志 CSV，包含如下坏数据行',
      '导入该 CSV 文件',
      '系统不会拒绝整个文件，而是将坏数据标记为 isValid=false',
      '导入结果面板展示无效行统计和具体原因（行号+原因）',
      '已有有效数据不会被清除或覆盖',
    ],
    code: `batchId,timestamp,temperature
GOOD-001,2026-06-06 08:00:00,4.5
BAD-DATE,not-a-date,5.0
BAD-TEMP,2026-06-06 09:00:00,N/A
BAD-BOTH,invalid-time,abc
GOOD-002,2026-06-06 10:00:00,4.2`,
  },
  {
    title: '复核冲突异常复现',
    type: 'review_conflict',
    severity: 'danger',
    icon: AlertTriangle,
    steps: [
      '准备人工复核 CSV，同一批次出现两条不同结论',
      '例如 BATCH-TEST-003 先标记"放行"后标记"隔离"',
      '导入人工复核 CSV',
      '系统检测到同一批次多个不同结论，触发"复核冲突"异常',
      '异常详情展示冲突双方的复核人、结论、时间和原始行号',
    ],
    code: `batchId,reviewer,conclusion,remark,reviewTime
BATCH-TEST-003,张三,release,产品合格,2026-06-06 14:00:00
BATCH-TEST-003,李四,quarantine,需二次检测,2026-06-06 15:00:00`,
  },
  {
    title: '到货未登记异常复现',
    type: 'unregistered',
    severity: 'warning',
    icon: FileText,
    steps: [
      '仅导入温度日志或人工复核 CSV，其中包含某批次 BATCH-TEST-004',
      '不导入该批次的到货清单',
      '系统识别到有温度日志或复核记录但无到货登记',
      '触发"到货未登记"异常，产品名称显示为"（未登记）"',
    ],
    code: `温度日志（到货清单中无此批次）：
BATCH-TEST-004,2026-06-06 08:00:00,4.5
BATCH-TEST-004,2026-06-06 09:00:00,4.3`,
  },
];

const HelpDrawer: FC<HelpDrawerProps> = ({ open, onClose }) => {
  return (
    <div className={cn('fixed inset-0 z-40 transition', open ? 'pointer-events-auto' : 'pointer-events-none')}>
      <div
        className={cn(
          'absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          'absolute right-0 top-0 h-full w-full max-w-xl transform border-l border-slate-700 bg-slate-900 shadow-2xl transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-700/60 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">帮助文档 · 异常复现指南</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              包含 5 类异常场景的完整复现步骤与样例数据
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="h-[calc(100%-65px)] overflow-auto px-5 py-4">
          <div className="mb-5 rounded-md border border-sky-500/20 bg-sky-500/5 p-3 text-[11px] leading-relaxed text-sky-200">
            <strong className="text-sky-300">提示：</strong>
            点击顶部「加载样例数据」可一键加载包含上述所有异常类型的演示数据，快速体验看板功能。
            数据完全存储于浏览器 localStorage，刷新页面不会丢失。
          </div>

          <div className="space-y-5">
            {reproCases.map((c, idx) => (
              <div key={c.type} className="rounded-lg border border-slate-700/60 bg-slate-800/30">
                <div className="flex items-start gap-2.5 border-b border-slate-700/40 px-4 py-3">
                  <div className={cn(
                    'mt-0.5 flex h-7 w-7 items-center justify-center rounded-md border',
                    c.severity === 'danger'
                      ? 'border-red-500/40 bg-red-500/10 text-red-300'
                      : 'border-amber-500/40 bg-amber-500/10 text-amber-300',
                  )}>
                    <c.icon className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">
                      <span className="mr-1.5 text-slate-500">#{idx + 1}</span>
                      {c.title}
                    </h3>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {c.severity === 'danger' ? '严重级别' : '警告级别'}异常
                    </p>
                  </div>
                </div>
                <div className="space-y-3 px-4 py-3">
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
                      <Play className="h-3 w-3 text-emerald-400" />
                      复现步骤
                    </div>
                    <ol className="ml-4 space-y-1 list-decimal text-[11px] leading-relaxed text-slate-400">
                      {c.steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  </div>
                  {c.code && (
                    <div>
                      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
                        <FileCode className="h-3 w-3 text-sky-400" />
                        样例 CSV 数据
                      </div>
                      <pre className="overflow-auto rounded-md border border-slate-700/60 bg-slate-950/60 p-2.5 font-mono text-[10px] leading-relaxed text-slate-300">
                        {c.code}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-lg border border-slate-700/60 bg-slate-800/30 p-4">
            <h3 className="text-sm font-semibold text-slate-100">CSV 文件格式规范</h3>
            <div className="mt-3 space-y-3 text-[11px] text-slate-400">
              <div>
                <p className="mb-1 font-medium text-slate-300">到货清单必填列：</p>
                <code className="rounded bg-slate-900/60 px-1.5 py-0.5 font-mono text-slate-300">
                  batchId, productName, arrivalTime, requiredTempMin, requiredTempMax
                </code>
              </div>
              <div>
                <p className="mb-1 font-medium text-slate-300">温度日志必填列：</p>
                <code className="rounded bg-slate-900/60 px-1.5 py-0.5 font-mono text-slate-300">
                  batchId, timestamp, temperature
                </code>
              </div>
              <div>
                <p className="mb-1 font-medium text-slate-300">人工复核必填列：</p>
                <code className="rounded bg-slate-900/60 px-1.5 py-0.5 font-mono text-slate-300">
                  batchId, reviewer, conclusion
                </code>
                <p className="mt-1 text-slate-500">conclusion 取值：release / quarantine / ignore</p>
              </div>
            </div>
          </div>

          <div className="h-8" />
        </div>
      </div>
    </div>
  );
};

export default HelpDrawer;
