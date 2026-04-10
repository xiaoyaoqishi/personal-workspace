import { useEffect, useState } from 'react';
import { Card, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { tradeApi, tradeReviewApi, tradeSourceApi } from '../api';
import './TradeList.css';
import TradeWorkspaceHeader from '../features/trading/workspace/TradeWorkspaceHeader';
import TradeWorkspaceFilterBar from '../features/trading/workspace/TradeWorkspaceFilterBar';
import TradeFillsTable from '../features/trading/workspace/TradeFillsTable';
import TradePositionsTable from '../features/trading/workspace/TradePositionsTable';
import TradeDetailDrawer from '../features/trading/workspace/TradeDetailDrawer';
import TradeImportModal from '../features/trading/workspace/TradeImportModal';
import TradeBatchEditModal from '../features/trading/workspace/TradeBatchEditModal';
import {
  EMPTY_REVIEW,
  EMPTY_REVIEW_TAXONOMY,
  EMPTY_SOURCE,
  REVIEW_FIELD_KEYS,
  normalizeText,
} from '../features/trading/workspace/constants';

export default function TradeList() {
  const navigate = useNavigate();

  const [trades, setTrades] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [filters, setFilters] = useState({});
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [viewMode, setViewMode] = useState('fills');
  const [sourceOptions, setSourceOptions] = useState([]);

  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [batchEditOpen, setBatchEditOpen] = useState(false);
  const [batchPatch, setBatchPatch] = useState({ status: '', strategy_type: '', is_planned: '', notes: '' });

  const [importOpen, setImportOpen] = useState(false);
  const [importBroker, setImportBroker] = useState('宏源期货');
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState(null);

  const [reviewTaxonomy, setReviewTaxonomy] = useState(EMPTY_REVIEW_TAXONOMY);
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeTradeId, setActiveTradeId] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSavingReview, setDetailSavingReview] = useState(false);
  const [detailSavingSource, setDetailSavingSource] = useState(false);
  const [detailSavingLegacy, setDetailSavingLegacy] = useState(false);
  const [detailTrade, setDetailTrade] = useState(null);
  const [detailReview, setDetailReview] = useState(EMPTY_REVIEW);
  const [detailReviewExists, setDetailReviewExists] = useState(false);
  const [detailSource, setDetailSource] = useState(EMPTY_SOURCE);
  const [detailLegacy, setDetailLegacy] = useState({ review_note: '', notes: '' });

  useEffect(() => {
    if (viewMode === 'fills') loadTrades();
    else loadPositions();
  }, [filters, pagination.current, pagination.pageSize, viewMode]);

  useEffect(() => {
    loadSources();
    loadReviewTaxonomy();
  }, []);

  const loadSources = async () => {
    try {
      const res = await tradeApi.sources();
      const items = res.data?.items || [];
      setSourceOptions(items.map((v) => ({ label: v, value: v })));
    } catch {
      setSourceOptions([]);
    }
  };

  const loadReviewTaxonomy = async () => {
    try {
      const res = await tradeReviewApi.taxonomy();
      setReviewTaxonomy({
        opportunity_structure: res.data?.opportunity_structure || [],
        edge_source: res.data?.edge_source || [],
        failure_type: res.data?.failure_type || [],
        review_conclusion: res.data?.review_conclusion || [],
      });
    } catch {
      setReviewTaxonomy(EMPTY_REVIEW_TAXONOMY);
    }
  };

  const loadTrades = async () => {
    setLoading(true);
    try {
      const countRes = await tradeApi.count(filters);
      const total = countRes.data?.total || 0;
      const maxPage = Math.max(1, Math.ceil(total / pagination.pageSize));
      const current = Math.min(pagination.current, maxPage);
      const listRes = await tradeApi.list({ page: current, size: pagination.pageSize, ...filters });
      const list = listRes.data || [];
      setTrades(list);
      setPagination((p) => ({ ...p, current, total }));
      setSelectedRowKeys((prev) => prev.filter((id) => list.some((x) => x.id === id)));
    } catch {
      message.error('加载失败');
    }
    setLoading(false);
  };

  const loadPositions = async () => {
    setLoading(true);
    try {
      const res = await tradeApi.positions(filters);
      setPositions(res.data || []);
    } catch {
      message.error('加载持仓失败');
    }
    setLoading(false);
  };

  const updateFilter = (key, val) => {
    setFilters((prev) => {
      if (val === undefined || val === null) {
        const { [key]: _omit, ...rest } = prev;
        setPagination((p) => ({ ...p, current: 1 }));
        return rest;
      }
      setPagination((p) => ({ ...p, current: 1 }));
      return { ...prev, [key]: val };
    });
  };

  const setDateRange = (dates) => {
    if (dates) {
      setFilters((f) => ({
        ...f,
        date_from: dates[0].format('YYYY-MM-DD'),
        date_to: dates[1].format('YYYY-MM-DD'),
      }));
      return;
    }
    setFilters((f) => {
      const { date_from, date_to, ...rest } = f;
      return rest;
    });
  };

  const loadTradeDetail = async (tradeId) => {
    setDetailLoading(true);
    try {
      const [tradeRes, reviewRes, sourceRes] = await Promise.all([
        tradeApi.get(tradeId),
        tradeReviewApi.get(tradeId).catch((e) => (e.response?.status === 404 ? { data: null } : Promise.reject(e))),
        tradeSourceApi.get(tradeId),
      ]);
      const tradeData = tradeRes.data || null;
      setDetailTrade(tradeData);
      setDetailLegacy({ review_note: tradeData?.review_note || '', notes: tradeData?.notes || '' });

      const reviewData = reviewRes.data || {};
      const normalizedReview = { ...EMPTY_REVIEW };
      REVIEW_FIELD_KEYS.forEach((k) => {
        normalizedReview[k] = reviewData?.[k] || '';
      });
      setDetailReview(normalizedReview);
      setDetailReviewExists(!!reviewRes.data);

      const sourceData = sourceRes.data || {};
      setDetailSource({
        ...EMPTY_SOURCE,
        ...sourceData,
        broker_name: sourceData?.broker_name || '',
        source_label: sourceData?.source_label || '',
        import_channel: sourceData?.import_channel || '',
        parser_version: sourceData?.parser_version || '',
        source_note_snapshot: sourceData?.source_note_snapshot || '',
      });
    } catch {
      message.error('详情加载失败');
    }
    setDetailLoading(false);
  };

  const openTradeDetail = async (tradeId) => {
    setActiveTradeId(tradeId);
    setDetailOpen(true);
    await loadTradeDetail(tradeId);
  };

  const handleDeleteTrade = async (id) => {
    await tradeApi.delete(id);
    message.success('已删除');
    if (activeTradeId === id) {
      setDetailOpen(false);
      setActiveTradeId(null);
    }
    loadTrades();
  };

  const handleSaveDetailReview = async () => {
    if (!activeTradeId) return;
    setDetailSavingReview(true);
    try {
      const payload = {};
      REVIEW_FIELD_KEYS.forEach((k) => {
        payload[k] = normalizeText(detailReview[k]);
      });
      const hasReviewData = Object.values(payload).some((v) => v !== null);
      if (hasReviewData) {
        await tradeReviewApi.upsert(activeTradeId, payload);
        setDetailReviewExists(true);
        message.success('结构化复盘已保存');
      } else if (detailReviewExists) {
        await tradeReviewApi.delete(activeTradeId);
        setDetailReviewExists(false);
        message.success('结构化复盘已清空');
      } else {
        message.info('未检测到可保存的结构化复盘内容');
      }
      await loadTradeDetail(activeTradeId);
      await loadTrades();
    } catch (e) {
      message.error(e.response?.data?.detail || '结构化复盘保存失败');
    }
    setDetailSavingReview(false);
  };

  const handleSaveDetailSource = async () => {
    if (!activeTradeId) return;
    setDetailSavingSource(true);
    try {
      const payload = {
        broker_name: normalizeText(detailSource.broker_name),
        source_label: normalizeText(detailSource.source_label),
        import_channel: normalizeText(detailSource.import_channel),
        parser_version: normalizeText(detailSource.parser_version),
        source_note_snapshot: normalizeText(detailSource.source_note_snapshot) || normalizeText(detailLegacy.notes),
        derived_from_notes: false,
      };
      const hasSourceData = Object.values(payload).some((v) => v !== null && v !== false);
      if (!hasSourceData && !detailSource.exists_in_db) {
        message.info('来源元数据为空，无需保存');
        return;
      }
      await tradeSourceApi.upsert(activeTradeId, payload);
      message.success('来源元数据已保存');
      await Promise.all([loadTradeDetail(activeTradeId), loadSources(), loadTrades()]);
    } catch (e) {
      message.error(e.response?.data?.detail || '来源元数据保存失败');
    }
    setDetailSavingSource(false);
  };

  const handleSaveDetailLegacy = async () => {
    if (!activeTradeId) return;
    setDetailSavingLegacy(true);
    try {
      await tradeApi.update(activeTradeId, {
        review_note: normalizeText(detailLegacy.review_note),
        notes: normalizeText(detailLegacy.notes),
      });
      message.success('兼容字段已保存');
      await loadTradeDetail(activeTradeId);
      await loadTrades();
    } catch (e) {
      message.error(e.response?.data?.detail || '兼容字段保存失败');
    }
    setDetailSavingLegacy(false);
  };

  const handleImportTrades = async () => {
    if (!importText.trim()) {
      message.warning('请先粘贴数据');
      return;
    }
    setImportLoading(true);
    try {
      const res = await tradeApi.importPaste({ raw_text: importText, broker: importBroker });
      setImportResult(res.data || null);
      message.success(`导入完成：新增 ${res.data?.inserted || 0}，跳过 ${res.data?.skipped || 0}`);
      await Promise.all([loadTrades(), loadSources()]);
    } catch (e) {
      message.error(e.response?.data?.detail || '导入失败');
    } finally {
      setImportLoading(false);
    }
  };

  const openImportModal = () => {
    setImportText('');
    setImportResult(null);
    if (!importBroker) setImportBroker('');
    setImportOpen(true);
  };

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先勾选交易记录');
      return;
    }
    try {
      await Promise.all(selectedRowKeys.map((id) => tradeApi.delete(id)));
      message.success(`已删除 ${selectedRowKeys.length} 条`);
      setSelectedRowKeys([]);
      loadTrades();
    } catch {
      message.error('批量删除失败');
    }
  };

  const handleBatchEditSubmit = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先勾选交易记录');
      return;
    }
    const patch = {};
    if (batchPatch.status) patch.status = batchPatch.status;
    if (batchPatch.strategy_type.trim()) patch.strategy_type = batchPatch.strategy_type.trim();
    if (batchPatch.is_planned === 'true') patch.is_planned = true;
    if (batchPatch.is_planned === 'false') patch.is_planned = false;
    if (batchPatch.notes.trim()) patch.notes = batchPatch.notes.trim();
    if (Object.keys(patch).length === 0) {
      message.warning('请至少填写一个要批量修改的字段');
      return;
    }
    try {
      await Promise.all(selectedRowKeys.map((id) => tradeApi.update(id, patch)));
      message.success(`已批量更新 ${selectedRowKeys.length} 条`);
      setBatchEditOpen(false);
      loadTrades();
    } catch (e) {
      message.error(e.response?.data?.detail || '批量更新失败');
    }
  };

  return (
    <div className="trade-workspace">
      <TradeWorkspaceHeader onOpenImport={openImportModal} onCreateTrade={() => navigate('/trades/new')} />

      <TradeWorkspaceFilterBar
        viewMode={viewMode}
        setViewMode={setViewMode}
        selectedRowKeys={selectedRowKeys}
        sourceOptions={sourceOptions}
        onOpenBatchEdit={() => {
          if (selectedRowKeys.length === 0) {
            message.warning('请先勾选交易记录');
            return;
          }
          setBatchPatch({ status: '', strategy_type: '', is_planned: '', notes: '' });
          setBatchEditOpen(true);
        }}
        onBatchDelete={handleBatchDelete}
        onSetDateRange={setDateRange}
        onUpdateFilter={updateFilter}
      />

      <Card className="trade-table-card" bodyStyle={{ padding: 0 }}>
        {viewMode === 'fills' ? (
          <TradeFillsTable
            rows={trades}
            loading={loading}
            pagination={pagination}
            selectedRowKeys={selectedRowKeys}
            onSelectionChange={setSelectedRowKeys}
            onPageChange={(page, pageSize) => setPagination((p) => ({ ...p, current: page, pageSize }))}
            onOpenDetail={openTradeDetail}
            onOpenEdit={(id) => navigate(`/trades/${id}/edit`)}
            onDelete={handleDeleteTrade}
          />
        ) : (
          <TradePositionsTable rows={positions} loading={loading} />
        )}
      </Card>

      <TradeDetailDrawer
        open={detailOpen}
        tradeId={activeTradeId}
        loading={detailLoading}
        trade={detailTrade}
        review={detailReview}
        reviewExists={detailReviewExists}
        source={detailSource}
        legacy={detailLegacy}
        reviewTaxonomy={reviewTaxonomy}
        savingReview={detailSavingReview}
        savingSource={detailSavingSource}
        savingLegacy={detailSavingLegacy}
        onClose={() => setDetailOpen(false)}
        onReload={() => activeTradeId && loadTradeDetail(activeTradeId)}
        onOpenEdit={() => activeTradeId && navigate(`/trades/${activeTradeId}/edit`)}
        onChangeReview={(k, v) => setDetailReview((p) => ({ ...p, [k]: v }))}
        onChangeSource={(k, v) => setDetailSource((p) => ({ ...p, [k]: v }))}
        onChangeLegacy={(k, v) => setDetailLegacy((p) => ({ ...p, [k]: v }))}
        onSaveReview={handleSaveDetailReview}
        onSaveSource={handleSaveDetailSource}
        onSaveLegacy={handleSaveDetailLegacy}
      />

      <TradeImportModal
        open={importOpen}
        loading={importLoading}
        sourceOptions={sourceOptions}
        broker={importBroker}
        text={importText}
        result={importResult}
        onCancel={() => setImportOpen(false)}
        onConfirm={handleImportTrades}
        onBrokerChange={setImportBroker}
        onTextChange={setImportText}
      />

      <TradeBatchEditModal
        open={batchEditOpen}
        selectedCount={selectedRowKeys.length}
        patch={batchPatch}
        onCancel={() => setBatchEditOpen(false)}
        onConfirm={handleBatchEditSubmit}
        onChangePatch={(k, v) => setBatchPatch((p) => ({ ...p, [k]: v }))}
      />
    </div>
  );
}
