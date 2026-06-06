import { useState } from 'react';
import Header from '@/components/Header';
import ImportPanel from '@/components/ImportPanel';
import MetricCards from '@/components/MetricCards';
import FilterBar from '@/components/FilterBar';
import AnomalyTable from '@/components/AnomalyTable';
import ReviewModal from '@/components/ReviewModal';
import HelpDrawer from '@/components/HelpDrawer';
import RulesPanel from '@/components/RulesPanel';
import AuditLogPanel from '@/components/AuditLogPanel';
import HandoverPanel from '@/components/HandoverPanel';
import HandoverCreateModal from '@/components/HandoverCreateModal';
import SupplierRiskPanel from '@/components/SupplierRiskPanel';

export default function Home() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [reviewModal, setReviewModal] = useState<{ open: boolean; batchId: string }>({
    open: false,
    batchId: '',
  });
  const [handoverCreateOpen, setHandoverCreateOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(56,189,248,0.08),transparent)]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.02]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
        aria-hidden
      />

      <div className="relative">
        <Header onOpenHelp={() => setHelpOpen(true)} onCreateHandover={() => setHandoverCreateOpen(true)} />

        <main className="mx-auto max-w-[1600px] space-y-5 px-6 py-6">
          <ImportPanel />
          <RulesPanel />
          <MetricCards />
          <FilterBar />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-wide text-slate-200">异常明细</h2>
              <span className="text-[11px] text-slate-500">
                点击左侧箭头展开查看异常详情与原始行定位
              </span>
            </div>
            <AnomalyTable onOpenReview={(bid) => setReviewModal({ open: true, batchId: bid })} />
          </div>

          <SupplierRiskPanel />

          <HandoverPanel />

          <AuditLogPanel />

          <footer className="border-t border-slate-800/60 pt-4 pb-8 text-center text-[10.5px] text-slate-500">
            <p>冷链到货温控复核看板 · 数据完全存储于本地浏览器 · 不依赖外部系统</p>
            <p className="mt-1">
              所有复核决策 / 规则配置 / 审计日志 / 交接记录在页面刷新后自动保留 · 点击右上角 <span className="text-sky-400">?</span> 查看异常复现文档
            </p>
          </footer>
        </main>
      </div>

      <ReviewModal
        open={reviewModal.open}
        batchId={reviewModal.batchId}
        onClose={() => setReviewModal({ open: false, batchId: '' })}
      />
      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
      <HandoverCreateModal
        open={handoverCreateOpen}
        onClose={() => setHandoverCreateOpen(false)}
      />
    </div>
  );
}
