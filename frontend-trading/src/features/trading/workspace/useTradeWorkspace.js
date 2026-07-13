import { useEffect, useState } from 'react';
import { message } from 'antd';
import { tradeApi, tradeLinkedPlanApi, tradeReviewApi } from '../../../api';
import {
  EMPTY_REVIEW,
  REVIEW_FIELD_KEYS,
} from './constants';
import { normalizeTagList } from '../display';
import { futuresNameBySymbol } from '../../../utils/futures';

export function useTradeWorkspace() {
  const [trades, setTrades] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [filters, setFilters] = useState({});
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [viewMode, setViewMode] = useState('fills');
  const [sourceOptions, setSourceOptions] = useState([]);
  const [symbolOptions, setSymbolOptions] = useState([]);


  const [importOpen, setImportOpen] = useState(false);
  const [importBroker, setImportBroker] = useState('宏源期货');
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [activeTradeId, setActiveTradeId] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTrade, setDetailTrade] = useState(null);
  const [detailRiskPointHistory, setDetailRiskPointHistory] = useState([]);
  const [detailReview, setDetailReview] = useState(EMPTY_REVIEW);
  const [detailReviewExists, setDetailReviewExists] = useState(false);
  const [detailLinkedPlans, setDetailLinkedPlans] = useState([]);

  useEffect(() => {
    if (viewMode === 'fills') loadTrades();
    else loadPositions();
  }, [filters, pagination.current, pagination.pageSize, viewMode]);

  useEffect(() => {
    loadSources();
    loadSymbols();
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

  const loadSymbols = async () => {
    const toOption = (symbol) => {
      const value = String(symbol || '').trim().toUpperCase();
      if (!value) return null;
      const zh = futuresNameBySymbol(value, value);
      return {
        label: zh ? `${zh}(${value})` : value,
        value,
      };
    };
    try {
      const res = await tradeApi.symbols();
      const apiSymbols = (res.data?.items || [])
        .map((v) => String(v || '').trim().toUpperCase())
        .filter(Boolean);
      const merged = Array.from(new Set(apiSymbols)).sort();
      setSymbolOptions(merged.map(toOption).filter(Boolean));
    } catch {
      setSymbolOptions([]);
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
      const [tradeRes, reviewRes, linkedPlansRes, riskPointHistoryRes] = await Promise.all([
        tradeApi.get(tradeId),
        tradeReviewApi.get(tradeId).catch((e) => (e.response?.status === 404 ? { data: null } : Promise.reject(e))),
        tradeLinkedPlanApi.get(tradeId).catch(() => ({ data: [] })),
        tradeApi.riskPointHistory(tradeId).catch(() => ({ data: [] })),
      ]);
      setDetailLinkedPlans(Array.isArray(linkedPlansRes.data) ? linkedPlansRes.data : []);
      setDetailRiskPointHistory(Array.isArray(riskPointHistoryRes.data) ? riskPointHistoryRes.data : []);
      const tradeData = tradeRes.data || null;
      setDetailTrade(tradeData);
      const reviewData = reviewRes.data || {};
      const normalizedReview = { ...EMPTY_REVIEW };
      REVIEW_FIELD_KEYS.forEach((k) => {
        normalizedReview[k] = reviewData?.[k] || '';
      });
      normalizedReview.tags = Array.isArray(reviewData?.tags)
        ? normalizeTagList(reviewData.tags)
        : normalizeTagList(String(reviewData?.review_tags || ''));
      setDetailReview(normalizedReview);
      setDetailReviewExists(!!reviewRes.data);
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
    message.success('已移入回收站');
    if (activeTradeId === id) {
      setDetailOpen(false);
      setActiveTradeId(null);
    }
    await Promise.all([loadTrades(), loadSymbols()]);
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
      await loadSymbols();
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

  return {
    // core data
    trades,
    positions,
    loading,
    filters,
    pagination,
    viewMode,
    sourceOptions,
    symbolOptions,
    // import
    importOpen,
    importLoading,
    importBroker,
    importText,
    importResult,
    // detail
    detailOpen,
    activeTradeId,
    detailLoading,
    detailTrade,
    detailRiskPointHistory,
    detailReview,
    detailReviewExists,
    detailLinkedPlans,
    // setters for UI wiring
    setViewMode,
    setPagination,
    setDetailOpen,
    setImportBroker,
    setImportText,
    setImportOpen,
    // actions
    updateFilter,
    setDateRange,
    openTradeDetail,
    loadTradeDetail,
    handleDeleteTrade,
    handleImportTrades,
    openImportModal,
  };
}
