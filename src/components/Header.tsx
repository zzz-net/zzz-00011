import { Snowflake, User, HelpCircle, RotateCcw, DatabaseZap } from 'lucide-react';
import { useAppStore } from '@/store';
import { useState } from 'react';
import type { FC } from 'react';

interface HeaderProps {
  onOpenHelp: () => void;
}

const Header: FC<HeaderProps> = ({ onOpenHelp }) => {
  const { currentReviewer, setCurrentReviewer, loadSampleData, clearAll, arrivalBatches } = useAppStore();
  const [editing, setEditing] = useState(!currentReviewer);
  const [name, setName] = useState(currentReviewer);
  const [confirmClear, setConfirmClear] = useState(false);

  const handleSave = () => {
    const trimmed = name.trim();
    if (trimmed) {
      setCurrentReviewer(trimmed);
      setEditing(false);
    }
  };

  const handleClear = () => {
    if (confirmClear) {
      clearAll();
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-700/60 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 rounded-lg bg-sky-500/30 blur-lg" />
            <div className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-sky-500/40 bg-sky-500/10">
              <Snowflake className="h-5 w-5 text-sky-400" />
            </div>
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-wide text-slate-100" style={{ fontFamily: '"Space Grotesk", system-ui, sans-serif' }}>
              冷链到货温控复核看板
            </h1>
            <p className="text-xs text-slate-400">Cold Chain Temperature Compliance Dashboard</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              loadSampleData();
            }}
            className="group flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-300 transition hover:border-emerald-400/60 hover:bg-emerald-500/20"
          >
            <DatabaseZap className="h-4 w-4 transition group-hover:scale-110" />
            <span>加载样例数据</span>
          </button>

          <button
            onClick={handleClear}
            className={`group flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition ${
              confirmClear
                ? 'border-red-500/60 bg-red-500/20 text-red-200'
                : 'border-slate-600 bg-slate-800/50 text-slate-300 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300'
            }`}
          >
            <RotateCcw className={`h-4 w-4 transition group-hover:rotate-180 ${confirmClear ? 'animate-spin' : ''}`} />
            <span>{confirmClear ? '再次点击确认清空' : '清空所有数据'}</span>
          </button>

          {editing ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800 px-2 py-1">
                <User className="h-4 w-4 text-slate-400" />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  placeholder="输入复核人姓名"
                  className="w-28 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
                  autoFocus
                />
              </div>
              <button
                onClick={handleSave}
                className="rounded-md bg-sky-500 px-3 py-1 text-sm text-white transition hover:bg-sky-400"
              >
                保存
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setName(currentReviewer);
                setEditing(true);
              }}
              className="flex items-center gap-2 rounded-md border border-slate-600 bg-slate-800/50 px-3 py-1.5 text-sm text-slate-200 transition hover:border-sky-500/40 hover:bg-sky-500/10"
            >
              <User className="h-4 w-4 text-sky-400" />
              <span>复核人：</span>
              <span className="font-medium text-sky-300">{currentReviewer || '未设置'}</span>
            </button>
          )}

          <button
            onClick={onOpenHelp}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-600 bg-slate-800/50 text-slate-300 transition hover:border-sky-500/40 hover:bg-sky-500/10 hover:text-sky-300"
            title="帮助 / 异常复现文档"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </div>
      </div>
      {arrivalBatches.length === 0 && (
        <div className="border-t border-amber-500/20 bg-amber-500/5 px-6 py-2 text-center text-xs text-amber-300">
          暂无数据，请点击上方「加载样例数据」或使用下方导入功能上传 CSV 文件
        </div>
      )}
    </header>
  );
};

export default Header;
