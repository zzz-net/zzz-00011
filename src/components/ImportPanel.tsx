import { useState, useRef, useMemo } from 'react';
import { Upload, FileText, Check, AlertTriangle, X, Package, Thermometer, ClipboardList } from 'lucide-react';
import { useAppStore } from '@/store';
import type { FC, ChangeEvent, DragEvent } from 'react';
import type { FileType, ImportResult } from '@/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface ImportCardProps {
  title: string;
  description: string;
  fileType: FileType;
  icon: FC<{ className?: string }>;
  accentColor: string;
  onImport: (file: File) => Promise<ImportResult>;
  requiredColumns: string[];
}

const ImportCard: FC<ImportCardProps> = ({ title, description, fileType, icon: Icon, accentColor, onImport, requiredColumns }) => {
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const allImportRecords = useAppStore((s) => s.importRecords);
  const importRecords = useMemo(
    () => allImportRecords.filter((r) => r.fileType === fileType),
    [allImportRecords, fileType]
  );

  const handleFile = async (file: File) => {
    setLoading(true);
    setResult(null);
    try {
      const r = await onImport(file);
      setResult(r);
    } catch (err) {
      setResult({ success: false, message: err instanceof Error ? err.message : '未知错误' });
    } finally {
      setLoading(false);
    }
  };

  const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const lastRecord = importRecords[importRecords.length - 1];

  return (
    <div className={cn('relative overflow-hidden rounded-lg border bg-slate-800/40 p-4 transition', dragActive ? 'border-sky-400/60 bg-sky-500/5' : 'border-slate-700/60')}>
      <div className={cn('absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl opacity-20', accentColor)} />

      <div className="relative flex items-start gap-3">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-md border', accentColor?.replace('bg-', 'border-').replace('/30', '/40'), accentColor?.replace('/30', '/15'))}>
          <Icon className={cn('h-5 w-5', accentColor?.includes('sky') ? 'text-sky-300' : accentColor?.includes('emerald') ? 'text-emerald-300' : 'text-amber-300')} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-400">{description}</p>
          <p className="mt-1 text-[11px] text-slate-500">必填列：{requiredColumns.join(', ')}</p>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'group relative mt-3 flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed py-5 transition',
          dragActive ? 'border-sky-400 bg-sky-500/10' : 'border-slate-600/50 hover:border-slate-500 hover:bg-slate-700/30',
        )}
      >
        <input ref={inputRef} type="file" accept=".csv" onChange={handleInput} className="hidden" />
        {loading ? (
          <div className="flex items-center gap-2 text-slate-300">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-sky-400" />
            <span className="text-sm">解析中...</span>
          </div>
        ) : (
          <>
            <Upload className="h-6 w-6 text-slate-400 transition group-hover:translate-y-[-2px] group-hover:text-sky-400" />
            <span className="mt-1 text-sm text-slate-300">
              点击或拖拽 <span className="text-sky-400">.csv</span> 文件到此处
            </span>
          </>
        )}
      </div>

      {result && (
        <div
          className={cn(
            'mt-3 flex items-start gap-2 rounded-md border p-2.5 text-xs',
            result.success
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : result.skipped
              ? 'border-slate-500/30 bg-slate-500/10 text-slate-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300',
          )}
        >
          {result.success ? (
            <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          ) : result.skipped ? (
            <X className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          )}
          <div className="flex-1">
            <p>{result.message}</p>
            {result.record?.invalidDetails && result.record.invalidDetails.length > 0 && (
              <div className="mt-1 max-h-20 overflow-auto rounded bg-black/20 p-1.5 font-mono text-[10px]">
                {result.record.invalidDetails.slice(0, 5).map((d, i) => (
                  <div key={i}>行 {d.row}：{d.reason}</div>
                ))}
                {result.record.invalidDetails.length > 5 && (
                  <div className="text-slate-400">... 另有 {result.record.invalidDetails.length - 5} 条</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {lastRecord && !result && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-slate-700/60 bg-slate-900/50 p-2 text-[11px] text-slate-400">
          <FileText className="h-3.5 w-3.5 text-slate-500" />
          <span className="truncate">上次导入：{lastRecord.fileName}</span>
          <span className="ml-auto text-slate-500">
            {format(new Date(lastRecord.importedAt), 'MM-dd HH:mm')} · {lastRecord.validRows}/{lastRecord.totalRows} 有效
          </span>
        </div>
      )}
    </div>
  );
};

const ImportPanel: FC = () => {
  const { importArrivals, importTemperatureLogs, importManualReviews } = useAppStore();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-slate-200">数据导入</h2>
        <span className="text-[11px] text-slate-500">CSV UTF-8 编码</span>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <ImportCard
          title="到货清单"
          description="批次基础信息与温度要求"
          fileType="arrival"
          icon={Package}
          accentColor="bg-sky-500/30"
          onImport={importArrivals}
          requiredColumns={['batchId', 'productName', 'arrivalTime', 'requiredTempMin', 'requiredTempMax']}
        />
        <ImportCard
          title="运输温度日志"
          description="按批次的时间序列温度记录"
          fileType="log"
          icon={Thermometer}
          accentColor="bg-emerald-500/30"
          onImport={importTemperatureLogs}
          requiredColumns={['batchId', 'timestamp', 'temperature']}
        />
        <ImportCard
          title="人工复核记录"
          description="历史复核结论与备注"
          fileType="review"
          icon={ClipboardList}
          accentColor="bg-amber-500/30"
          onImport={importManualReviews}
          requiredColumns={['batchId', 'reviewer', 'conclusion']}
        />
      </div>
    </div>
  );
};

export default ImportPanel;
