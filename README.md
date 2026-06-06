# 冷链到货温控复核看板

本地纯前端应用，用于冷链到货批次的温度异常识别与人工复核。所有数据存储于浏览器 localStorage，不依赖任何外部服务。

---

## 快速启动

```bash
# 安装依赖（首次）
npm install

# 启动开发服务器
npm run dev
# 浏览器打开 http://localhost:5173

# 类型检查
npm run check

# 代码质量检查
npm run lint

# 生产构建
npm run build
```

页面打开后，点击顶部 **「加载样例数据」** 即可快速体验完整流程。

---

## 三类 CSV 文件说明

所有 CSV 必须使用 **UTF-8 编码**。

### 1. 到货清单（arrival）

导入面板左侧第一张卡片「到货清单」。

| 列名 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `batchId` | string | ✅ | 批次号，全局唯一 |
| `productName` | string | ✅ | 产品名称 |
| `arrivalTime` | string | ✅ | 到货时间，格式 `YYYY-MM-DD HH:mm:ss` |
| `requiredTempMin` | number | ✅ | 要求最低温度（°C） |
| `requiredTempMax` | number | ✅ | 要求最高温度（°C） |
| `supplier` | string | ❌ | 供应商 |
| `quantity` | number | ❌ | 数量 |

**示例：**
```csv
batchId,productName,arrivalTime,requiredTempMin,requiredTempMax,supplier,quantity
BATCH-TEST-001,冷藏疫苗 A,2026-06-06 08:30:00,2,8,供应商甲,500
BATCH-TEST-002,冷冻生鲜 B,2026-06-06 09:15:00,-20,-15,供应商乙,200
```

### 2. 运输温度日志（log）

导入面板中间卡片「运输温度日志」。

| 列名 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `batchId` | string | ✅ | 批次号，对应到货清单 |
| `timestamp` | string | ✅ | 记录时间，格式 `YYYY-MM-DD HH:mm:ss` |
| `temperature` | number | ✅ | 温度值（°C） |

**示例：**
```csv
batchId,timestamp,temperature
BATCH-TEST-001,2026-06-06 06:00:00,4.5
BATCH-TEST-001,2026-06-06 06:05:00,4.6
BATCH-TEST-001,2026-06-06 06:10:00,11.0
BATCH-TEST-001,2026-06-06 06:15:00,11.2
BATCH-TEST-001,2026-06-06 06:20:00,4.7
```

### 3. 人工复核记录（review）

导入面板右侧卡片「人工复核记录」。

| 列名 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `batchId` | string | ✅ | 批次号 |
| `reviewer` | string | ✅ | 复核人姓名 |
| `conclusion` | string | ✅ | 复核结论，取值：`release`（放行）/ `quarantine`（隔离）/ `ignore`（忽略） |
| `remark` | string | ❌ | 备注 |
| `reviewTime` | string | ❌ | 复核时间，格式 `YYYY-MM-DD HH:mm:ss` |

**示例：**
```csv
batchId,reviewer,conclusion,remark,reviewTime
BATCH-TEST-001,张三,release,超温时间短，产品合格,2026-06-06 16:00:00
BATCH-TEST-002,李四,quarantine,超温严重待评估,2026-06-06 16:20:00
```

---

## 导入顺序建议

```
到货清单 → 运输温度日志 → 人工复核记录
```

三类数据导入不分先后，系统自动按 `batchId` 关联。

---

## 四类异常手工复现步骤

### 异常一：超温区间

**触发条件**：某批次存在连续 ≥3 条温度日志超出 `[requiredTempMin, requiredTempMax]` 范围。

**复现步骤：**

1. 新建 `arrival_overtemp.csv`：
```csv
batchId,productName,arrivalTime,requiredTempMin,requiredTempMax,supplier,quantity
BATCH-OT-001,冷藏疫苗,2026-06-06 10:00:00,2,8,测试供应商,100
```

2. 新建 `log_overtemp.csv`（中间 3 条超温）：
```csv
batchId,timestamp,temperature
BATCH-OT-001,2026-06-06 08:00:00,4.5
BATCH-OT-001,2026-06-06 08:05:00,4.6
BATCH-OT-001,2026-06-06 08:10:00,10.0
BATCH-OT-001,2026-06-06 08:15:00,11.2
BATCH-OT-001,2026-06-06 08:20:00,10.8
BATCH-OT-001,2026-06-06 08:25:00,4.7
BATCH-OT-001,2026-06-06 08:30:00,4.5
```

3. 在看板依次导入 `arrival_overtemp.csv` → `log_overtemp.csv`
4. **预期结果**：
   - 汇总指标「超温批次」从 0 → 1
   - 异常明细表新增一条，类型标签为红色「超温」
   - 点击左侧展开箭头 → 显示「超温区间明细」表格和温度时间线柱状图，红色柱对应超温点

---

### 异常二：缺日志

**触发条件**：同一批次相邻两条有效温度日志的时间间隔 > 30 分钟。

**复现步骤：**

1. 新建 `arrival_missing.csv`：
```csv
batchId,productName,arrivalTime,requiredTempMin,requiredTempMax,supplier,quantity
BATCH-ML-001,冷藏试剂,2026-06-06 12:00:00,2,8,测试供应商,50
```

2. 新建 `log_missing.csv`（第 1、2 条间隔 60 分钟）：
```csv
batchId,timestamp,temperature
BATCH-ML-001,2026-06-06 10:00:00,4.5
BATCH-ML-001,2026-06-06 11:00:00,4.6
BATCH-ML-001,2026-06-06 11:10:00,4.7
```

3. 在看板依次导入 `arrival_missing.csv` → `log_missing.csv`
4. **预期结果**：
   - 汇总指标「缺日志批次」从 0 → 1
   - 异常明细表新增一条，类型标签为黄色「缺日志」
   - 展开后可见缺失段明细表，显示「上一条 10:00 → 下一条 11:00，间隔 60 分钟」

---

### 异常三：到货未登记

**触发条件**：温度日志或人工复核记录中出现的 `batchId` 在到货清单中不存在。

**复现步骤：**

1. **不要导入任何到货清单**（或导入不含该批次的到货清单）
2. 新建 `log_unregistered.csv`：
```csv
batchId,timestamp,temperature
BATCH-UR-001,2026-06-06 09:00:00,5.0
BATCH-UR-001,2026-06-06 09:05:00,5.1
```

3. 在看板导入 `log_unregistered.csv`
4. **预期结果**：
   - 汇总指标「未登记批次」从 0 → 1
   - 异常明细表新增一条，产品名称显示为「（未登记到货）」
   - 展开后可见关联的温度日志列表

---

### 异常四：复核冲突

**触发条件**：同一批次在人工复核记录中出现不同 `conclusion` 值，或导入的复核记录与页面人工标记结论不一致。

**复现步骤：**

1. 新建 `arrival_conflict.csv`：
```csv
batchId,productName,arrivalTime,requiredTempMin,requiredTempMax,supplier,quantity
BATCH-RC-001,冷藏样品,2026-06-06 14:00:00,2,8,测试供应商,30
```

2. 新建 `review_conflict.csv`（同一批次两条冲突结论）：
```csv
batchId,reviewer,conclusion,remark,reviewTime
BATCH-RC-001,张三,release,初检合格,2026-06-06 15:00:00
BATCH-RC-001,李四,quarantine,怀疑超标,2026-06-06 15:30:00
```

3. 在看板依次导入 `arrival_conflict.csv` → `review_conflict.csv`
4. **预期结果**：
   - 汇总指标「复核冲突」从 0 → 1
   - 异常明细表新增一条，类型标签为玫红色「复核冲突」
   - 展开后可见所有复核记录对比表（张三「放行」 vs 李四「隔离」）

---

## 失败路径复现

### 场景 1：缺必填列

新建 `bad_missing_column.csv`（故意漏掉 `temperature` 列）：
```csv
batchId,timestamp
BATCH-XXX,2026-06-06 08:00:00
```
导入运输温度日志卡片 → **预期**：红色错误提示「缺少必填列: temperature」，已有数据不受影响。

### 场景 2：坏时间戳

新建 `bad_timestamp.csv`：
```csv
batchId,timestamp,temperature
BATCH-BAD,not-a-date,5.0
BATCH-BAD,2026-06-06 08:00:00,4.8
BATCH-BAD,2026-06-06 08:05:00,4.9
```
导入 → **预期**：
- 导入面板显示黄色警告：「成功 2 条，无效 1 条」
- 展开详情可见「行 2：时间格式错误」
- 第 3、4 行有效数据正常入库，不会被清除

### 场景 3：非数字温度

新建 `bad_temp.csv`：
```csv
batchId,timestamp,temperature
BATCH-BAD2,2026-06-06 08:00:00,abc
BATCH-BAD2,2026-06-06 08:05:00,N/A
BATCH-BAD2,2026-06-06 08:10:00,4.5
```
导入 → **预期**：前 2 行标记为无效（温度非数字），第 3 行正常入库。

### 场景 4：重复导入

任意 CSV 文件导入两次 → **预期**：第二次导入显示灰色提示「该文件已导入，已跳过」，数据不会重复，已有复核标记不受影响。

---

## 人工复核与导出检查

### 复核操作

1. 在异常明细行，点击「放行」/「隔离」/「忽略」可快速标记
2. 点击铅笔图标打开复核弹窗，可填写备注
3. 复核人姓名可在顶部编辑（默认「质控员」），所有复核决策自动记录复核人与时间戳

### 刷新保留验证

1. 对任意异常点击「放行」
2. 观察「已复核」指标 +1，该行状态变为绿色「放行」
3. **按 F5 刷新页面**
4. **预期**：
   - 顶部复核人姓名保留
   - 所有批次、日志、复核记录完整保留
   - 「已复核」指标和各行状态与刷新前完全一致
   - 备注、复核人、更新时间均不变

### 筛选 → 导出一致性验证

1. 加载样例数据或导入若干 CSV
2. 在筛选栏：
   - 搜索框输入批次号（如 `001`）
   - 勾选「超温」异常类型
   - 勾选「未复核」状态
3. 记录「显示 X / Y 条异常」中的 X 值
4. 点击「导出 CSV」和「导出 JSON」
5. **预期**：
   - 下载的 CSV/JSON 中异常条数 = X（与筛选结果完全一致）
   - CSV 每行包含：批次号、产品名、异常类型、严重级别、描述、原始行号、复核状态、复核人、备注、更新时间
   - JSON 包含：导出时间戳、筛选条件、异常列表、关联批次/日志/复核记录

---

## 数据持久化

- 所有数据存储在浏览器 `localStorage`，key：`cold-chain-dashboard-v2`（代码常量见 `src/types/index.ts` 的 `PERSIST_STORAGE_KEY`）
- 包含：到货清单、温度日志、人工复核记录、异常检测结果、复核决策、复核历史、审计日志、复核规则、导入记录、复核人、异常筛选条件、审计筛选条件
- 点击「清空所有数据」按钮可重置（需二次确认）

### 版本迁移边界（v1 → v2）

- **v1**：早期版本使用 key `cold-chain-dashboard-v1`，仅保存基础业务数据（到货/日志/复核/异常/决策/导入记录/复核人/筛选）
- **v2**（当前）：key 升级为 `cold-chain-dashboard-v2`，新增持久化字段：`reviewHistory`、`auditLogs`、`reviewRules`、`auditLogFilter`
- **自动迁移**：系统**未实现** v1 → v2 的自动迁移逻辑。升级后旧 key 下的数据仍保留在浏览器中，但不会被自动读取
- **手动迁移建议**：升级前在 v1 页面执行「导出 JSON」备份，升级到 v2 后如需恢复历史数据，可通过导入 CSV 的方式重新载入

---

## 异常汇总指标说明

| 指标 | 说明 |
|------|------|
| 总批次数 | 到货清单 + 日志/复核中出现的全部唯一 batchId |
| 超温批次 | 检测到超温区间的批次数 |
| 缺日志批次 | 存在相邻日志间隔 >30 分钟的批次数 |
| 未登记批次 | 有日志或复核但无到货登记的批次数 |
| 复核冲突 | 存在多个不一致结论的批次数 |
| 已复核 | 已被人工标记（放行/隔离/忽略）的批次数 |
