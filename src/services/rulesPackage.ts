import {
  DEFAULT_REVIEW_RULES,
  REVIEW_RULES_RANGES,
  RULES_PACKAGE_VERSION,
  type ReviewRules,
  type RuleDiffItem,
  type RuleValidationIssue,
  type RulesPackage,
  type RulesPackagePreviewResult,
  type RulesPackagePreviewState,
} from '@/types';
import { downloadFile } from '@/services/csvService';

const RULES_FIELDS: (keyof ReviewRules)[] = [
  'overtempThreshold',
  'missingLogIntervalMin',
  'overtempDurationDangerMin',
  'overtempDeltaDanger',
  'missingLogGapDangerMin',
];

export function buildRulesPackage(
  rules: ReviewRules,
  exportedBy?: string,
  description?: string,
): RulesPackage {
  return {
    packageType: 'review-rules',
    version: RULES_PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy,
    rules: { ...rules },
    description,
  };
}

export function exportRulesPackageFile(
  rules: ReviewRules,
  exportedBy?: string,
  description?: string,
): void {
  const pkg = buildRulesPackage(rules, exportedBy, description);
  const content = JSON.stringify(pkg, null, 2);
  const ts = pkg.exportedAt.replace(/[:.]/g, '-').slice(0, 19);
  downloadFile(content, `review-rules-${ts}.json`, 'application/json');
}

export function validateRulesPackageVersion(version: number): RuleValidationIssue | null {
  if (typeof version !== 'number' || isNaN(version)) {
    return {
      type: 'version_incompatible',
      message: `规则包版本号无效：${version}`,
    };
  }
  if (version > RULES_PACKAGE_VERSION) {
    return {
      type: 'version_incompatible',
      message: `规则包版本 v${version} 高于当前系统支持的 v${RULES_PACKAGE_VERSION}，请升级系统后重试`,
    };
  }
  if (version < 1) {
    return {
      type: 'version_incompatible',
      message: `规则包版本 v${version} 过低，不再支持`,
    };
  }
  return null;
}

export function validateRulesFields(rules: Record<string, unknown>): {
  validRules: Partial<ReviewRules>;
  issues: RuleValidationIssue[];
} {
  const issues: RuleValidationIssue[] = [];
  const validRules: Partial<ReviewRules> = {};

  for (const field of RULES_FIELDS) {
    if (!(field in rules)) {
      issues.push({
        field,
        type: 'missing_field',
        message: `缺少必填字段：${field}`,
      });
      continue;
    }

    const rawValue = rules[field];
    const numValue = Number(rawValue);

    if (typeof rawValue !== 'number' && typeof rawValue !== 'string') {
      issues.push({
        field,
        type: 'non_numeric',
        message: `字段 ${field} 类型错误（期望数字，实际 ${typeof rawValue}）`,
      });
      continue;
    }

    if (isNaN(numValue)) {
      issues.push({
        field,
        type: 'non_numeric',
        message: `字段 ${field} 不是有效数字：${rawValue}`,
      });
      continue;
    }

    const range = REVIEW_RULES_RANGES[field];
    if (numValue < range.min || numValue > range.max) {
      issues.push({
        field,
        type: 'out_of_range',
        message: `字段 ${field} 值 ${numValue} 超出合理范围 [${range.min}, ${range.max}]`,
      });
      continue;
    }

    (validRules as Record<string, number>)[field] = numValue;
  }

  return { validRules, issues };
}

export function computeRuleDiffs(
  currentRules: ReviewRules,
  importedRules: ReviewRules,
): RuleDiffItem[] {
  const diffs: RuleDiffItem[] = [];
  for (const field of RULES_FIELDS) {
    if (currentRules[field] !== importedRules[field]) {
      diffs.push({
        field,
        currentValue: currentRules[field],
        importedValue: importedRules[field],
        range: REVIEW_RULES_RANGES[field],
      });
    }
  }
  return diffs;
}

export async function parseRulesPackageFile(file: File): Promise<{
  success: boolean;
  message: string;
  pkg?: RulesPackage;
  issues?: RuleValidationIssue[];
}> {
  try {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        success: false,
        message: '文件不是合法的 JSON 格式',
      };
    }

    if (!parsed || typeof parsed !== 'object') {
      return {
        success: false,
        message: '规则包格式错误：根节点必须是对象',
      };
    }

    const obj = parsed as Record<string, unknown>;

    if (obj.packageType !== 'review-rules') {
      return {
        success: false,
        message: `规则包类型错误：期望 review-rules，实际 ${obj.packageType ?? '(缺失)'}`,
      };
    }

    const versionIssue = validateRulesPackageVersion(Number(obj.version));
    if (versionIssue) {
      return {
        success: false,
        message: versionIssue.message,
        issues: [versionIssue],
      };
    }

    if (!obj.rules || typeof obj.rules !== 'object') {
      return {
        success: false,
        message: '规则包缺少 rules 字段或格式错误',
      };
    }

    const rulesObj = obj.rules as Record<string, unknown>;
    const { validRules, issues } = validateRulesFields(rulesObj);

    if (issues.some((i) => i.type === 'missing_field' || i.type === 'non_numeric' || i.type === 'out_of_range')) {
      return {
        success: false,
        message: `规则校验失败：共 ${issues.length} 处问题`,
        issues,
      };
    }

    const mergedRules: ReviewRules = { ...DEFAULT_REVIEW_RULES, ...validRules } as ReviewRules;

    const pkg: RulesPackage = {
      packageType: 'review-rules',
      version: Number(obj.version),
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
      exportedBy: typeof obj.exportedBy === 'string' ? obj.exportedBy : undefined,
      rules: mergedRules,
      description: typeof obj.description === 'string' ? obj.description : undefined,
    };

    return {
      success: true,
      message: '规则包解析成功',
      pkg,
      issues: issues.length > 0 ? issues : undefined,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : '解析规则包时发生未知错误',
    };
  }
}

export async function previewRulesPackage(
  file: File,
  currentRules: ReviewRules,
): Promise<RulesPackagePreviewResult> {
  const parseResult = await parseRulesPackageFile(file);

  if (!parseResult.success || !parseResult.pkg) {
    return {
      success: false,
      message: parseResult.message,
      issues: parseResult.issues,
    };
  }

  const pkg = parseResult.pkg;
  const diffs = computeRuleDiffs(currentRules, pkg.rules);
  const hasConflicts = diffs.length > 0;
  const blockingIssues =
    parseResult.issues?.filter(
      (i) => i.type === 'missing_field' || i.type === 'non_numeric' || i.type === 'out_of_range' || i.type === 'version_incompatible',
    ) ?? [];
  const canApply = blockingIssues.length === 0;

  const preview: RulesPackagePreviewState = {
    fileName: file.name,
    packageData: pkg,
    diffs,
    issues: parseResult.issues ?? [],
    hasConflicts,
    canApply,
    timestamp: new Date().toISOString(),
  };

  return {
    success: true,
    message: hasConflicts
      ? `检测到 ${diffs.length} 处与当前规则不同，请确认后应用`
      : '规则与当前配置完全一致，无需变更',
    preview,
  };
}
