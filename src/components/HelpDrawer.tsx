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
            数据完全存储于浏览器 localStorage（key：<code className="rounded bg-slate-900/60 px-1 py-0.5 text-sky-100">cold-chain-dashboard-v2</code>），刷新页面不会丢失。
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
            <h3 className="text-sm font-semibold text-slate-100">规则配置包使用说明</h3>
            <div className="mt-3 space-y-3 text-[11px] text-slate-400">
              <p className="leading-relaxed">
                规则配置包用于将当前的复核规则阈值导出为 JSON 文件，方便在不同浏览器、不同人员之间复用和共享一致的判定标准。
              </p>
              <div>
                <p className="mb-1 font-medium text-slate-300">导出规则包：</p>
                <p>在「复核规则配置」面板右上角点击「导出规则包」，系统将下载一个 <code className="rounded bg-slate-900/60 px-1 py-0.5 font-mono text-slate-300">review-rules-*.json</code> 文件，包含当前所有阈值、版本号、导出时间和导出人。</p>
              </div>
              <div>
                <p className="mb-1 font-medium text-slate-300">导入规则包：</p>
                <p>点击「导入规则包」选择 JSON 文件，系统会先进行预览：</p>
                <ul className="ml-4 mt-1 list-disc space-y-0.5">
                  <li>显示文件版本、导出时间、导出人等元信息</li>
                  <li>以表格对比「当前值」和「导入值」，高亮差异项</li>
                  <li>检测到缺字段、非数字、超出合理范围或版本不兼容时，「应用」按钮将禁用并给出原因</li>
                  <li>若与当前规则存在冲突（至少一个阈值不同），按钮变为橙色「确认变更并应用」，必须明确确认才会覆盖</li>
                </ul>
              </div>
              <div>
                <p className="mb-1 font-medium text-slate-300">规则包 JSON 结构示例：</p>
                <pre className="overflow-auto rounded-md border border-slate-700/60 bg-slate-950/60 p-2.5 font-mono text-[10px] leading-relaxed text-slate-300">{`{
  "packageType": "review-rules",
  "version": 1,
  "exportedAt": "2026-06-06T10:00:00.000Z",
  "exportedBy": "质控员",
  "rules": {
    "overtempThreshold": 0,
    "missingLogIntervalMin": 30,
    "overtempDurationDangerMin": 30,
    "overtempDeltaDanger": 5,
    "missingLogGapDangerMin": 120
  }
}`}</pre>
              </div>
              <div>
                <p className="mb-1 font-medium text-slate-300">字段合理范围：</p>
                <ul className="ml-4 list-disc space-y-0.5 font-mono text-[10.5px]">
                  <li>overtempThreshold: [0, 20] °C</li>
                  <li>missingLogIntervalMin: [1, 600] 分钟</li>
                  <li>overtempDurationDangerMin: [1, 600] 分钟</li>
                  <li>overtempDeltaDanger: [0.5, 50] °C</li>
                  <li>missingLogGapDangerMin: [5, 1440] 分钟</li>
                </ul>
              </div>
              <p className="leading-relaxed text-sky-300">
                <strong className="text-sky-300">提示：</strong>导入成功后系统会立即重新计算所有异常列表、指标卡和筛选结果，并在审计日志中记录操作者、来源文件以及变更前后的完整阈值快照。预览结果即使刷新页面也不会丢失。
              </p>
            </div>
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

          <div className="mt-6 rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
            <h3 className="text-sm font-semibold text-slate-100">字段映射预览功能说明</h3>
            <div className="mt-3 space-y-3 text-[11px] text-slate-400">
              <p className="leading-relaxed">
                导入到货清单、温度日志、人工复核记录前，系统会先弹出「字段映射预览」面板，支持中文表头、大小写和空格差异自动识别，无需手动修改 CSV 文件。
              </p>

              <div>
                <p className="mb-1 font-medium text-slate-300">1. 自动匹配规则：</p>
                <ul className="ml-4 list-disc space-y-0.5">
                  <li>三级匹配策略：精确别名匹配 → 归一化别名匹配（trim、小写、去空格/下划线/连字符）→ 模糊包含匹配</li>
                  <li>常见中文表头自动识别（如「批次号」「产品名称」「采集时间」「温度」「复核人」「结论」等）</li>
                  <li>大小写不敏感：BatchId / batchid / BATCHID 均可识别</li>
                  <li>空格/下划线/连字符不敏感：product_name / productName / product name / product-name 均可识别</li>
                </ul>
              </div>

              <div>
                <p className="mb-1 font-medium text-slate-300">2. 手动选列：</p>
                <ul className="ml-4 list-disc space-y-0.5">
                  <li>自动匹配结果可在下拉菜单中手动修改或清空</li>
                  <li>未匹配的字段显示黄色警告，必填字段缺失会阻断导入</li>
                  <li>可点击「自动匹配」按钮重新根据当前表头执行匹配</li>
                </ul>
              </div>

              <div>
                <p className="mb-1 font-medium text-slate-300">3. 校验规则：</p>
                <ul className="ml-4 list-disc space-y-0.5">
                  <li>必填字段缺失：红色背景 + 具体说明，「确认导入」按钮禁用</li>
                  <li>列映射冲突：同一 CSV 列映射到多个目标字段时，橙色警告行提示，「确认导入」按钮禁用，不静默覆盖</li>
                  <li>非必填字段缺失：黄色提示，不阻断导入</li>
                </ul>
              </div>

              <div>
                <p className="mb-1 font-medium text-slate-300">4. 本地持久化：</p>
                <ul className="ml-4 list-disc space-y-0.5">
                  <li>确认后的映射按文件类型独立保存到 localStorage（key: <code className="rounded bg-slate-900/60 px-1 py-0.5 font-mono text-purple-200">cold-chain-field-mappings-v1</code>）</li>
                  <li>刷新页面或重启浏览器后映射仍然可用，可点击「恢复上次映射」快速载入</li>
                  <li>下次导入 CSV 表头发生变化时，自动提示失效的映射项并允许重新选择</li>
                </ul>
              </div>

              <div>
                <p className="mb-1 font-medium text-slate-300">5. 审计与导出：</p>
                <ul className="ml-4 list-disc space-y-0.5">
                  <li>导入成功、阻断（必填缺失/冲突）、映射变更均会写入审计日志</li>
                  <li>导出 JSON 时自动附带字段映射快照，便于追溯数据来源的列对应关系</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-slate-700/60 bg-slate-800/30 p-4">
            <h3 className="text-sm font-semibold text-slate-100">复核交接班功能使用说明</h3>
            <div className="mt-3 space-y-3 text-[11px] text-slate-400">
              <p className="leading-relaxed">
                复核交接班用于质控人员之间将待处理异常整理成清单进行交接，确保异常处理链路完整可追溯。
              </p>

              <div>
                <p className="mb-1 font-medium text-slate-300">1. 创建交接清单：</p>
                <ul className="ml-4 list-disc space-y-0.5">
                  <li>点击顶部「创建交接」按钮打开创建弹窗</li>
                  <li>左侧按批次号、异常类型（超温/缺日志/未登记/复核冲突）、严重级别（警告/严重）、复核状态（未复核/放行/隔离/忽略）筛选异常</li>
                  <li>勾选需要交接的异常条目，可点击箭头展开查看原始行号、原复核人、原备注等详情</li>
                  <li>右侧填写交接标题、接收人（*必填）、截止时间（*必填）和交接备注</li>
                  <li>每条交接条目会自动保存原始异常摘要、当前复核规则快照（阈值等）</li>
                </ul>
              </div>

              <div>
                <p className="mb-1 font-medium text-slate-300">2. 个人待办队列：</p>
                <ul className="ml-4 list-disc space-y-0.5">
                  <li>「复核交接管理」面板默认展示「我的待办」：当前登录人作为接收人的所有待接收/处理中/被退回任务</li>
                  <li>可切换「全部」查看所有交接，或「我创建的」查看自己发起的交接</li>
                  <li>顶部按钮可一键导出筛选结果为 JSON/CSV，导出包含交接记录本身及所有异常条目的规则快照</li>
                </ul>
              </div>

              <div>
                <p className="mb-1 font-medium text-slate-300">3. 接收、退回和完成：</p>
                <ul className="ml-4 list-disc space-y-0.5">
                  <li><strong>接收：</strong>状态为「待接收」或「已退回」时，可点击「接收」进入处理</li>
                  <li><strong>处理：</strong>接收后点击「处理」打开复核弹窗，逐条选择结论（放行/隔离/忽略）并填写备注</li>
                  <li><strong>退回：</strong>如交接信息不完整或需要补充，可填写原因退回给交接人，任务回到「待接收」状态</li>
                  <li><strong>完成：</strong>所有异常复核完毕后点击「提交完成」，系统将复核结论写入批次并自动生成审计日志</li>
                </ul>
              </div>

              <div>
                <p className="mb-1 font-medium text-slate-300">4. 多人同时处理冲突检测：</p>
                <ul className="ml-4 list-disc space-y-0.5">
                  <li>点击编辑交接条目时系统自动加锁，锁定人显示在「锁定状态」列</li>
                  <li>若另一位质控人员同时点击同一条目，会收到红色冲突提示：「该条目正在被 XX 处理」</li>
                  <li>冲突事件会写入审计日志（操作类型：交接处理冲突），记录尝试人、被占用人、时间戳</li>
                  <li>若强制提交，系统弹出二次确认并明确提示「可能覆盖他人结论」，不会静默覆盖</li>
                </ul>
              </div>

              <div>
                <p className="mb-1 font-medium text-slate-300">5. 持久化与刷新保留：</p>
                <ul className="ml-4 list-disc space-y-0.5">
                  <li>交接记录（含状态流转历史、版本号）、条目锁定、筛选条件均已加入 localStorage 持久化（key: <code className="rounded bg-slate-900/60 px-1 py-0.5 font-mono text-sky-100">cold-chain-dashboard-v2</code>）</li>
                  <li>刷新页面或重启浏览器后，交接状态、锁定状态、筛选条件全部保留</li>
                  <li>交接详情中展示创建时间、接收时间、退回时间、完成时间等完整时间轴</li>
                </ul>
              </div>

              <p className="leading-relaxed text-sky-300">
                <strong>快速上手：</strong>先点击「加载样例数据」→ 点击「创建交接」→ 勾选几条异常 → 接收人填自己 → 创建 → 回到交接面板「我的待办」→「接收」→「处理」→ 选择结论 →「提交完成」，即可体验完整链路。
              </p>
            </div>
          </div>

          <div className="h-8" />
        </div>
      </div>
    </div>
  );
};

export default HelpDrawer;
