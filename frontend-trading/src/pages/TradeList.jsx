import { useNavigate } from 'react-router-dom';
import './TradeList.css';
import TradeWorkspaceFilterBar from '../features/trading/workspace/TradeWorkspaceFilterBar';
import TradeFillsTable from '../features/trading/workspace/TradeFillsTable';
import TradePositionsTable from '../features/trading/workspace/TradePositionsTable';
import TradeDetailDrawer from '../features/trading/workspace/TradeDetailDrawer';
import TradeImportModal from '../features/trading/workspace/TradeImportModal';
import { useTradeWorkspace } from '../features/trading/workspace/useTradeWorkspace';

// 功能保留，当前仅暂停工作台入口，后续可直接重新开启。
const PASTE_IMPORT_ENABLED = false;

export default function TradeList() {
  const navigate = useNavigate();
  const ws = useTradeWorkspace();

  return (
    <div className="trade-workspace">
      <TradeWorkspaceFilterBar
        viewMode={ws.viewMode}
        setViewMode={ws.setViewMode}
        symbolOptions={ws.symbolOptions}
        onSetDateRange={ws.setDateRange}
        onUpdateFilter={ws.updateFilter}
        onCreateTrade={() => navigate('/trades/new')}
      />

      <div className="trade-table-card">
        {ws.viewMode === 'fills' ? (
          <TradeFillsTable
            rows={ws.trades}
            loading={ws.loading}
            pagination={ws.pagination}
            onPageChange={(page, pageSize) => ws.setPagination((p) => ({ ...p, current: page, pageSize }))}
            onOpenDetail={ws.openTradeDetail}
            onOpenEdit={(id) => navigate(`/trades/${id}/edit`)}
            onDelete={ws.handleDeleteTrade}
          />
        ) : (
          <TradePositionsTable rows={ws.positions} loading={ws.loading} />
        )}
      </div>

      <TradeDetailDrawer
        open={ws.detailOpen}
        tradeId={ws.activeTradeId}
        loading={ws.detailLoading}
        trade={ws.detailTrade}
        riskPointHistory={ws.detailRiskPointHistory}
        review={ws.detailReview}
        reviewExists={ws.detailReviewExists}
        linkedPlans={ws.detailLinkedPlans}
        onClose={() => ws.setDetailOpen(false)}
        onReload={() => ws.activeTradeId && ws.loadTradeDetail(ws.activeTradeId)}
        onOpenEdit={() => ws.activeTradeId && navigate(`/trades/${ws.activeTradeId}/edit`)}
      />

      {PASTE_IMPORT_ENABLED ? (
        <TradeImportModal
          open={ws.importOpen}
          loading={ws.importLoading}
          sourceOptions={ws.sourceOptions}
          broker={ws.importBroker}
          text={ws.importText}
          result={ws.importResult}
          onCancel={() => ws.setImportOpen(false)}
          onConfirm={ws.handleImportTrades}
          onBrokerChange={ws.setImportBroker}
          onTextChange={ws.setImportText}
        />
      ) : null}

    </div>
  );
}
