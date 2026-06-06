import type { ArrivalBatch, TemperatureLog, ManualReviewRecord } from '@/types';

const iso = (d: string) => new Date(d).toISOString();

const addMinutes = (base: Date, minutes: number) => {
  const d = new Date(base.getTime());
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
};

export const sampleArrivals: ArrivalBatch[] = [
  {
    batchId: 'BATCH-2026-001',
    productName: '冷藏疫苗 A',
    arrivalTime: iso('2026-06-01T08:30:00'),
    requiredTempMin: 2,
    requiredTempMax: 8,
    supplier: '供应商甲',
    quantity: 500,
    sourceRow: 2,
    sourceFile: 'sample_arrivals.csv',
  },
  {
    batchId: 'BATCH-2026-002',
    productName: '冷冻生鲜 B',
    arrivalTime: iso('2026-06-01T09:15:00'),
    requiredTempMin: -20,
    requiredTempMax: -15,
    supplier: '供应商乙',
    quantity: 200,
    sourceRow: 3,
    sourceFile: 'sample_arrivals.csv',
  },
  {
    batchId: 'BATCH-2026-003',
    productName: '冷藏试剂 C',
    arrivalTime: iso('2026-06-01T10:00:00'),
    requiredTempMin: 2,
    requiredTempMax: 8,
    supplier: '供应商丙',
    quantity: 120,
    sourceRow: 4,
    sourceFile: 'sample_arrivals.csv',
  },
  {
    batchId: 'BATCH-2026-004',
    productName: '冷冻样本 D',
    arrivalTime: iso('2026-06-01T11:30:00'),
    requiredTempMin: -80,
    requiredTempMax: -60,
    supplier: '供应商丁',
    quantity: 50,
    sourceRow: 5,
    sourceFile: 'sample_arrivals.csv',
  },
  {
    batchId: 'BATCH-2026-005',
    productName: '冷藏药品 E',
    arrivalTime: iso('2026-06-01T14:00:00'),
    requiredTempMin: 2,
    requiredTempMax: 8,
    supplier: '供应商戊',
    quantity: 300,
    sourceRow: 6,
    sourceFile: 'sample_arrivals.csv',
  },
];

const batch001Base = new Date('2026-06-01T06:00:00');
const batch002Base = new Date('2026-06-01T07:00:00');
const batch003Base = new Date('2026-06-01T08:00:00');
const batch005Base = new Date('2026-06-01T12:00:00');
const batch006Base = new Date('2026-06-01T13:00:00');

export const sampleLogs: TemperatureLog[] = [
  // BATCH-001: 正常但中间有 15 分钟超温
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `log-001-${i}`,
    batchId: 'BATCH-2026-001',
    timestamp: addMinutes(batch001Base, i * 5),
    temperature: i >= 8 && i <= 10 ? 10.2 + i * 0.1 : 4.5 + (Math.random() - 0.5) * 0.8,
    rawValue: '',
    sourceRow: i + 2,
    sourceFile: 'sample_logs.csv',
    isValid: true,
  })),
  // BATCH-002: 严重超温
  ...Array.from({ length: 15 }, (_, i) => ({
    id: `log-002-${i}`,
    batchId: 'BATCH-2026-002',
    timestamp: addMinutes(batch002Base, i * 6),
    temperature: i >= 3 && i <= 12 ? -5 + (Math.random() - 0.5) * 2 : -17 + (Math.random() - 0.5) * 1,
    rawValue: '',
    sourceRow: i + 22,
    sourceFile: 'sample_logs.csv',
    isValid: true,
  })),
  // BATCH-003: 缺日志（数据稀疏）
  ...[0, 60, 360, 420, 480].map((mins, idx) => ({
    id: `log-003-${idx}`,
    batchId: 'BATCH-2026-003',
    timestamp: addMinutes(batch003Base, mins),
    temperature: 5,
    rawValue: '',
    sourceRow: idx + 37,
    sourceFile: 'sample_logs.csv',
    isValid: true,
  })),
  // BATCH-005: 含坏数据
  {
    id: 'log-005-bad-1',
    batchId: 'BATCH-2026-005',
    timestamp: 'not-a-date',
    temperature: NaN,
    rawValue: 'not-a-date,abc',
    sourceRow: 50,
    sourceFile: 'sample_logs.csv',
    isValid: false,
    invalidReason: '时间格式错误且温度非数字',
  },
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `log-005-${i}`,
    batchId: 'BATCH-2026-005',
    timestamp: addMinutes(batch005Base, i * 10),
    temperature: i === 5 ? NaN : 4.2 + (Math.random() - 0.5) * 0.5,
    rawValue: i === 5 ? 'N/A' : '',
    sourceRow: i + 51,
    sourceFile: 'sample_logs.csv',
    isValid: i !== 5,
    invalidReason: i === 5 ? '温度非数字' : undefined,
  })),
  // BATCH-006: 到货未登记
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `log-006-${i}`,
    batchId: 'BATCH-2026-006',
    timestamp: addMinutes(batch006Base, i * 5),
    temperature: 5.5,
    rawValue: '',
    sourceRow: i + 62,
    sourceFile: 'sample_logs.csv',
    isValid: true,
  })),
];

export const sampleReviews: ManualReviewRecord[] = [
  {
    id: 'rev-001',
    batchId: 'BATCH-2026-001',
    reviewer: '张三',
    conclusion: 'release' as const,
    remark: '超温时间短，产品合格',
    reviewTime: iso('2026-06-01T16:00:00'),
    sourceRow: 2,
    sourceFile: 'sample_reviews.csv',
  },
  {
    id: 'rev-002',
    batchId: 'BATCH-2026-002',
    reviewer: '李四',
    conclusion: 'quarantine' as const,
    remark: '超温严重，待评估',
    reviewTime: iso('2026-06-01T16:20:00'),
    sourceRow: 3,
    sourceFile: 'sample_reviews.csv',
  },
  // 与 rev-001 冲突
  {
    id: 'rev-003',
    batchId: 'BATCH-2026-001',
    reviewer: '王五',
    conclusion: 'quarantine' as const,
    remark: '需要二次检测',
    reviewTime: iso('2026-06-01T17:00:00'),
    sourceRow: 4,
    sourceFile: 'sample_reviews.csv',
  },
];

export const sampleArrivalsCsv = `batchId,productName,arrivalTime,requiredTempMin,requiredTempMax,supplier,quantity
BATCH-2026-001,冷藏疫苗 A,2026-06-01 08:30:00,2,8,供应商甲,500
BATCH-2026-002,冷冻生鲜 B,2026-06-01 09:15:00,-20,-15,供应商乙,200
BATCH-2026-003,冷藏试剂 C,2026-06-01 10:00:00,2,8,供应商丙,120
BATCH-2026-004,冷冻样本 D,2026-06-01 11:30:00,-80,-60,供应商丁,50
BATCH-2026-005,冷藏药品 E,2026-06-01 14:00:00,2,8,供应商戊,300`;

export const sampleLogsCsv = `batchId,timestamp,temperature
BATCH-2026-001,2026-06-01 06:00:00,4.5
BATCH-2026-001,2026-06-01 06:05:00,4.6
BATCH-2026-001,2026-06-01 06:10:00,4.3
BATCH-2026-001,2026-06-01 06:15:00,4.7
BATCH-2026-001,2026-06-01 06:20:00,4.2
BATCH-2026-001,2026-06-01 06:25:00,4.8
BATCH-2026-001,2026-06-01 06:30:00,4.4
BATCH-2026-001,2026-06-01 06:35:00,4.9
BATCH-2026-001,2026-06-01 06:40:00,11.0
BATCH-2026-001,2026-06-01 06:45:00,11.2
BATCH-2026-001,2026-06-01 06:50:00,11.1
BATCH-2026-001,2026-06-01 06:55:00,4.8
BATCH-2026-002,2026-06-01 07:00:00,-16.5
BATCH-2026-002,2026-06-01 07:06:00,-17.0
BATCH-2026-002,2026-06-01 07:12:00,-16.8
BATCH-2026-002,2026-06-01 07:18:00,-4.2
BATCH-2026-002,2026-06-01 07:24:00,-5.1
BATCH-2026-002,2026-06-01 07:30:00,-4.8
BATCH-2026-003,2026-06-01 08:00:00,5.0
BATCH-2026-003,2026-06-01 09:00:00,5.1
BATCH-2026-003,2026-06-01 14:00:00,5.2
BATCH-2026-005,not-a-date,abc
BATCH-2026-005,2026-06-01 12:00:00,4.2
BATCH-2026-005,2026-06-01 12:10:00,4.3
BATCH-2026-005,2026-06-01 12:50:00,N/A
BATCH-2026-006,2026-06-01 13:00:00,5.5`;

export const sampleReviewsCsv = `batchId,reviewer,conclusion,remark,reviewTime
BATCH-2026-001,张三,release,超温时间短，产品合格,2026-06-01 16:00:00
BATCH-2026-002,李四,quarantine,超温严重待评估,2026-06-01 16:20:00
BATCH-2026-001,王五,quarantine,需要二次检测,2026-06-01 17:00:00`;
