import { useEffect, useState } from 'react';
import {
  Alert,
  AutoComplete,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Input,
  Modal,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  ImportOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { tradeApi, tradeReviewApi, tradeSourceApi } from '../api';
import { formatFuturesSymbol, FUTURES_SYMBOL_OPTIONS } from '../utils/futures';
import './TradeList.css';

const { RangePicker } = DatePicker;
const { TextArea } = Input;

const EMPTY_REVIEW_TAXONOMY = {
  opportunity_structure: [],
  edge_source: [],
  failure_type: [],
  review_conclusion: [],
};

const EMPTY_REVIEW = {
  opportunity_structure: '',
  edge_source: '',
  failure_type: '',
  review_conclusion: '',
  entry_thesis: '',
  invalidation_valid_evidence: '',
  invalidation_trigger_evidence: '',
  invalidation_boundary: '',
  management_actions: '',
  exit_reason: '',
  review_tags: '',
  research_notes: '',
};

const EMPTY_SOURCE = {
  broker_name: '',
  source_label: '',
  import_channel: '',
  parser_version: '',
  source_note_snapshot: '',
  exists_in_db: false,
  derived_from_notes: true,
};

const REVIEW_FIELD_KEYS = Object.keys(EMPTY_REVIEW);

function parseSourceFromNotes(notes = '') {
  const text = String(notes || '');
  const mBroker = text.match(/来源券商:\s*([^|]+)/);
  const mSource = text.match(/来源:\s*([^|]+)/);
  const broker = mBroker ? mBroker[1].trim() : '';
  const source = mSource ? mSource[1].trim() : '';
  if (broker && source) return `${broker} / ${source}`;
  return broker || source || '-';
}

function normalizeText(val) {
  if (val === undefined || val === null) return null;
  const trimmed = String(val).trim();
  return trimmed || null;
}

const taxonomyOptions = (arr = []) => arr.map((v) => ({ label: v, value: v }));

export default function TradeList() {
  const [trades, setTrades] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [filters, setFilters] = useState({});
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [importOpen, setImportOpen] = useState(false);
  const [importBroker, setImportBroker] = useState('宏源期货');
  const [sourceOptions, setSourceOptions] = useState([]);
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [viewMode, setViewMode] = useState('fills');
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [batchEditOpen, setBatchEditOpen] = useState(false);
  const [batchPatch, setBatchPatch] = useState({
    status: '',
    strategy_type: '',
    is_planned: '',
    notes: '',
  });

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

  const navigate = useNavigate();

  useEffect(() => {
    if (viewMode === 'fills') {
      loadTrades();
    } else {
      loadPositions();
    }
  }, [filters, pagination.current, pagination.pageSize, viewMode]);

  useEffect(() => {
    loadSources();
    loadReviewTaxonomy();
  }, []);

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

  const loadSources = async () => {
    try {
      const res = await tradeApi.sources();
      const items = res.data?.items || [];
      setSourceOptions(items.map((v) => ({ label: v, value: v })));
    } catch {
      setSourceOptions([]);
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

  const loadTradeDetail = async (tradeId) => {
    setDetailLoading(true);
    try {
      const [tradeRes, reviewRes, sourceRes] = await Promise.all([
        tradeApi.get(tradeId),
        tradeReviewApi.get(tradeId).catch((e) => {
          if (e.response?.status === 404) return { data: null };
          throw e;
        }),
        tradeSourceApi.get(tradeId),
      ]);

      const tradeData = tradeRes.data || null;
      setDetailTrade(tradeData);
      setDetailLegacy({
        review_note: tradeData?.review_note || '',
        notes: tradeData?.notes || '',
      });

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

  const handleDelete = async (id) => {
    await tradeApi.delete(id);
    message.success('已删除');
    if (activeTradeId === id) {
      setDetailOpen(false);
      setActiveTradeId(null);
    }
    loadTrades();
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
      await Promise.all([loadTradeDetail(activeTradeId), loadSources()]);
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
      if (viewMode === 'fills') {
        await loadTrades();
      }
      await loadTradeDetail(activeTradeId);
    } catch (e) {
      message.error(e.response?.data?.detail || '兼容字段保存失败');
    }
    setDetailSavingLegacy(false);
  };

  const columns = [
    {
      title: '开仓时间',
      dataIndex: 'open_time',
      width: 170,
      render: (v, r) => {
        const d = v || r.trade_date;
        return d ? dayjs(d).format('YYYY-MM-DD') : '-';
      },
      sorter: (a, b) => new Date(a.open_time || 0).getTime() - new Date(b.open_time || 0).getTime(),
    },
    { title: '类型', dataIndex: 'instrument_type', width: 90 },
    {
      title: '品种',
      dataIndex: 'symbol',
      width: 160,
      render: (_, r) => formatFuturesSymbol(r.symbol, r.contract),
    },
    { title: '合约', dataIndex: 'contract', width: 100 },
    {
      title: '方向',
      dataIndex: 'direction',
      width: 70,
      render: (v) => <Tag color={v === '做多' ? 'red' : 'green'}>{v}</Tag>,
    },
    { title: '开仓价', dataIndex: 'open_price', width: 100 },
    { title: '平仓价', dataIndex: 'close_price', width: 100 },
    {
      title: '平仓时间',
      dataIndex: 'close_time',
      width: 120,
      render: (v, r) => {
        if (v) return dayjs(v).format('YYYY-MM-DD');
        if (r.status === 'closed' && r.trade_date) return dayjs(r.trade_date).format('YYYY-MM-DD');
        return '-';
      },
    },
    { title: '手数', dataIndex: 'quantity', width: 70 },
    {
      title: '盈亏',
      dataIndex: 'pnl',
      width: 100,
      render: (v) =>
        v != null ? (
          <span style={{ color: v >= 0 ? '#cf1322' : '#3f8600', fontWeight: 'bold' }}>{v.toFixed(2)}</span>
        ) : (
          '-'
        ),
      sorter: (a, b) => (a.pnl || 0) - (b.pnl || 0),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 70,
      render: (v) => <Tag color={v === 'closed' ? 'default' : 'processing'}>{v === 'closed' ? '已平' : '持仓'}</Tag>,
    },
    {
      title: '券商/来源',
      dataIndex: 'notes',
      width: 190,
      render: (v) => parseSourceFromNotes(v),
      ellipsis: true,
    },
    {
      title: '计划内',
      dataIndex: 'is_planned',
      width: 70,
      render: (v) => (v === true ? <Tag color="green">是</Tag> : v === false ? <Tag color="red">否</Tag> : '-'),
    },
    {
      title: '操作',
      width: 180,
      fixed: 'right',
      render: (_, r) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openTradeDetail(r.id)}>
            详情
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => navigate(`/trades/${r.id}/edit`)} />
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const positionColumns = [
    { title: '品种', dataIndex: 'symbol_label', width: 220 },
    {
      title: '方向',
      dataIndex: 'side',
      width: 90,
      render: (v) => <Tag color={v === '做多' ? 'red' : 'green'}>{v}</Tag>,
    },
    { title: '净手数', dataIndex: 'net_quantity', width: 100 },
    { title: '持仓均价', dataIndex: 'avg_open_price', width: 120 },
    { title: '开仓起始日', dataIndex: 'open_since', width: 120 },
    { title: '最近成交日', dataIndex: 'last_trade_date', width: 120 },
  ];
  const positionData = positions.map((p, idx) => ({
    key: `${p.symbol}-${p.side}-${idx}`,
    ...p,
    symbol_label: formatFuturesSymbol(p.symbol, p.contract),
  }));

  const handleImport = async () => {
    if (!importText.trim()) {
      message.warning('请先粘贴数据');
      return;
    }
    setImportLoading(true);
    try {
      const res = await tradeApi.importPaste({ raw_text: importText, broker: importBroker });
      setImportResult(res.data || null);
      message.success(`导入完成：新增 ${res.data?.inserted || 0}，跳过 ${res.data?.skipped || 0}`);
      loadTrades();
      loadSources();
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

  const openBatchEdit = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先勾选交易记录');
      return;
    }
    setBatchPatch({ status: '', strategy_type: '', is_planned: '', notes: '' });
    setBatchEditOpen(true);
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
      <div className="trade-page-header">
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            交易工作台
          </Typography.Title>
          <Typography.Text type="secondary">
            粘贴导入、筛选浏览、结构化复盘与来源元数据在同一工作流中完成。
          </Typography.Text>
        </div>
        <Space>
          <Button icon={<ImportOutlined />} onClick={openImportModal}>
            粘贴导入
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/trades/new')}>
            新建交易
          </Button>
        </Space>
      </div>

      <Card className="trade-filter-card">
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <Segmented
              value={viewMode}
              onChange={setViewMode}
              options={[
                { label: '成交流水', value: 'fills' },
                { label: '当前持仓', value: 'positions' },
              ]}
            />
          </Col>
          {viewMode === 'fills' && (
            <Col>
              <Space>
                <Button onClick={openBatchEdit}>批量修改</Button>
                <Popconfirm title={`确认删除已勾选的 ${selectedRowKeys.length} 条记录？`} onConfirm={handleBatchDelete}>
                  <Button danger>批量删除</Button>
                </Popconfirm>
                <span style={{ color: '#888', fontSize: 12 }}>已勾选 {selectedRowKeys.length} 条</span>
              </Space>
            </Col>
          )}
          {viewMode === 'fills' && (
            <Col flex="auto">
              <Space wrap className="trade-filter-controls">
                <RangePicker
                  onChange={(dates) => {
                    if (dates) {
                      setFilters((f) => ({
                        ...f,
                        date_from: dates[0].format('YYYY-MM-DD'),
                        date_to: dates[1].format('YYYY-MM-DD'),
                      }));
                    } else {
                      setFilters((f) => {
                        const { date_from, date_to, ...rest } = f;
                        return rest;
                      });
                    }
                  }}
                />
                <Select
                  placeholder="交易类型"
                  allowClear
                  style={{ width: 120 }}
                  options={['期货', '加密货币', '股票', '外汇'].map((v) => ({ label: v, value: v }))}
                  onChange={(v) => updateFilter('instrument_type', v)}
                />
                <Select
                  placeholder="品种"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  style={{ width: 170 }}
                  options={FUTURES_SYMBOL_OPTIONS}
                  onChange={(v) => updateFilter('symbol', v)}
                />
                <Select
                  placeholder="券商/来源"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  style={{ width: 170 }}
                  options={sourceOptions}
                  onChange={(v) => updateFilter('source_keyword', v)}
                />
                <Select
                  placeholder="方向"
                  allowClear
                  style={{ width: 100 }}
                  options={[
                    { label: '做多', value: '做多' },
                    { label: '做空', value: '做空' },
                  ]}
                  onChange={(v) => updateFilter('direction', v)}
                />
                <Select
                  placeholder="状态"
                  allowClear
                  style={{ width: 100 }}
                  options={[
                    { label: '持仓', value: 'open' },
                    { label: '已平', value: 'closed' },
                  ]}
                  onChange={(v) => updateFilter('status', v)}
                />
              </Space>
            </Col>
          )}
        </Row>
      </Card>

      <Card className="trade-table-card" bodyStyle={{ padding: 0 }}>
        {viewMode === 'fills' ? (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={trades}
            rowSelection={{
              selectedRowKeys,
              onChange: setSelectedRowKeys,
            }}
            loading={loading}
            scroll={{ x: 1320 }}
            pagination={{
              ...pagination,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              onChange: (page, pageSize) => setPagination((p) => ({ ...p, current: page, pageSize })),
              showTotal: (t) => `共 ${t} 条`,
            }}
            size="middle"
          />
        ) : (
          <Table
            rowKey="key"
            columns={positionColumns}
            dataSource={positionData}
            loading={loading}
            pagination={false}
            size="middle"
            locale={{ emptyText: '当前无持仓' }}
          />
        )}
      </Card>

      <Drawer
        title={activeTradeId ? `交易详情 #${activeTradeId}` : '交易详情'}
        width={680}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        destroyOnClose={false}
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => activeTradeId && loadTradeDetail(activeTradeId)}
              disabled={!activeTradeId}
            >
              刷新
            </Button>
            {activeTradeId ? (
              <Button type="primary" onClick={() => navigate(`/trades/${activeTradeId}/edit`)}>
                打开完整编辑
              </Button>
            ) : null}
          </Space>
        }
      >
        {detailLoading ? (
          <div className="trade-drawer-loading">
            <Spin />
          </div>
        ) : !detailTrade ? (
          <Typography.Text type="secondary">未找到交易详情</Typography.Text>
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card size="small" title="成交信息">
              <Descriptions size="small" column={2}>
                <Descriptions.Item label="交易日期">{detailTrade.trade_date || '-'}</Descriptions.Item>
                <Descriptions.Item label="品种">{formatFuturesSymbol(detailTrade.symbol, detailTrade.contract)}</Descriptions.Item>
                <Descriptions.Item label="方向">
                  <Tag color={detailTrade.direction === '做多' ? 'red' : 'green'}>{detailTrade.direction || '-'}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={detailTrade.status === 'closed' ? 'default' : 'processing'}>
                    {detailTrade.status === 'closed' ? '已平' : '持仓'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="开仓价">{detailTrade.open_price ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="平仓价">{detailTrade.close_price ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="手数">{detailTrade.quantity ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="盈亏">{detailTrade.pnl ?? '-'}</Descriptions.Item>
              </Descriptions>
            </Card>

            <Card size="small" title="来源元数据（TradeSourceMetadata）">
              <Row gutter={12}>
                <Col span={12}>
                  <Typography.Text type="secondary">券商</Typography.Text>
                  <Input
                    value={detailSource.broker_name}
                    onChange={(e) => setDetailSource((p) => ({ ...p, broker_name: e.target.value }))}
                    placeholder="例如：宏源期货"
                  />
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">来源标签</Typography.Text>
                  <Input
                    value={detailSource.source_label}
                    onChange={(e) => setDetailSource((p) => ({ ...p, source_label: e.target.value }))}
                    placeholder="例如：日结单粘贴导入"
                  />
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">导入通道</Typography.Text>
                  <Input
                    value={detailSource.import_channel}
                    onChange={(e) => setDetailSource((p) => ({ ...p, import_channel: e.target.value }))}
                    placeholder="例如：paste_import"
                  />
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">解析版本</Typography.Text>
                  <Input
                    value={detailSource.parser_version}
                    onChange={(e) => setDetailSource((p) => ({ ...p, parser_version: e.target.value }))}
                    placeholder="例如：paste_v1"
                  />
                </Col>
                <Col span={24}>
                  <Typography.Text type="secondary">来源快照</Typography.Text>
                  <TextArea
                    value={detailSource.source_note_snapshot}
                    onChange={(e) => setDetailSource((p) => ({ ...p, source_note_snapshot: e.target.value }))}
                    rows={2}
                    placeholder="可选：保存来源相关快照"
                  />
                </Col>
              </Row>
              <div className="trade-drawer-actions">
                <Space>
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    loading={detailSavingSource}
                    onClick={handleSaveDetailSource}
                  >
                    保存来源元数据
                  </Button>
                  <Typography.Text type="secondary">
                    {detailSource.exists_in_db
                      ? '当前读取显式 metadata'
                      : '当前为 notes 回退结果，保存后将写入显式 metadata'}
                  </Typography.Text>
                </Space>
              </div>
            </Card>

            <Card size="small" title="结构化复盘（TradeReview）">
              <Row gutter={12}>
                <Col span={12}>
                  <Typography.Text type="secondary">机会结构</Typography.Text>
                  <Select
                    value={detailReview.opportunity_structure || undefined}
                    allowClear
                    options={taxonomyOptions(reviewTaxonomy.opportunity_structure)}
                    onChange={(v) => setDetailReview((p) => ({ ...p, opportunity_structure: v || '' }))}
                    placeholder="选择机会结构"
                    style={{ width: '100%' }}
                  />
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">优势来源</Typography.Text>
                  <Select
                    value={detailReview.edge_source || undefined}
                    allowClear
                    options={taxonomyOptions(reviewTaxonomy.edge_source)}
                    onChange={(v) => setDetailReview((p) => ({ ...p, edge_source: v || '' }))}
                    placeholder="选择优势来源"
                    style={{ width: '100%' }}
                  />
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">失败类型</Typography.Text>
                  <Select
                    value={detailReview.failure_type || undefined}
                    allowClear
                    options={taxonomyOptions(reviewTaxonomy.failure_type)}
                    onChange={(v) => setDetailReview((p) => ({ ...p, failure_type: v || '' }))}
                    placeholder="选择失败类型"
                    style={{ width: '100%' }}
                  />
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">复盘结论</Typography.Text>
                  <Select
                    value={detailReview.review_conclusion || undefined}
                    allowClear
                    options={taxonomyOptions(reviewTaxonomy.review_conclusion)}
                    onChange={(v) => setDetailReview((p) => ({ ...p, review_conclusion: v || '' }))}
                    placeholder="选择复盘结论"
                    style={{ width: '100%' }}
                  />
                </Col>
                <Col span={24}>
                  <Typography.Text type="secondary">入场论点</Typography.Text>
                  <TextArea
                    rows={2}
                    value={detailReview.entry_thesis}
                    onChange={(e) => setDetailReview((p) => ({ ...p, entry_thesis: e.target.value }))}
                  />
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">有效证据</Typography.Text>
                  <TextArea
                    rows={2}
                    value={detailReview.invalidation_valid_evidence}
                    onChange={(e) => setDetailReview((p) => ({ ...p, invalidation_valid_evidence: e.target.value }))}
                  />
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">失效证据</Typography.Text>
                  <TextArea
                    rows={2}
                    value={detailReview.invalidation_trigger_evidence}
                    onChange={(e) => setDetailReview((p) => ({ ...p, invalidation_trigger_evidence: e.target.value }))}
                  />
                </Col>
                <Col span={24}>
                  <Typography.Text type="secondary">相似但不同边界</Typography.Text>
                  <TextArea
                    rows={2}
                    value={detailReview.invalidation_boundary}
                    onChange={(e) => setDetailReview((p) => ({ ...p, invalidation_boundary: e.target.value }))}
                  />
                </Col>
                <Col span={24}>
                  <Typography.Text type="secondary">管理动作</Typography.Text>
                  <TextArea
                    rows={2}
                    value={detailReview.management_actions}
                    onChange={(e) => setDetailReview((p) => ({ ...p, management_actions: e.target.value }))}
                  />
                </Col>
                <Col span={24}>
                  <Typography.Text type="secondary">离场原因</Typography.Text>
                  <TextArea
                    rows={2}
                    value={detailReview.exit_reason}
                    onChange={(e) => setDetailReview((p) => ({ ...p, exit_reason: e.target.value }))}
                  />
                </Col>
                <Col span={24}>
                  <Typography.Text type="secondary">复盘标签</Typography.Text>
                  <Input
                    value={detailReview.review_tags}
                    onChange={(e) => setDetailReview((p) => ({ ...p, review_tags: e.target.value }))}
                  />
                </Col>
                <Col span={24}>
                  <Typography.Text type="secondary">研究记录</Typography.Text>
                  <TextArea
                    rows={3}
                    value={detailReview.research_notes}
                    onChange={(e) => setDetailReview((p) => ({ ...p, research_notes: e.target.value }))}
                  />
                </Col>
              </Row>
              <div className="trade-drawer-actions">
                <Space>
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    loading={detailSavingReview}
                    onClick={handleSaveDetailReview}
                  >
                    保存结构化复盘
                  </Button>
                  <Typography.Text type="secondary">
                    {detailReviewExists ? '当前已存在 TradeReview 记录' : '当前无 TradeReview 记录'}
                  </Typography.Text>
                </Space>
              </div>
            </Card>

            <Card size="small" title="兼容字段（Legacy）">
              <Typography.Text type="secondary">复盘一句话</Typography.Text>
              <TextArea
                rows={2}
                value={detailLegacy.review_note}
                onChange={(e) => setDetailLegacy((p) => ({ ...p, review_note: e.target.value }))}
                placeholder="保持 legacy review_note 行为不变"
              />
              <Divider style={{ margin: '12px 0' }} />
              <Typography.Text type="secondary">备注（notes）</Typography.Text>
              <TextArea
                rows={3}
                value={detailLegacy.notes}
                onChange={(e) => setDetailLegacy((p) => ({ ...p, notes: e.target.value }))}
                placeholder="保持 notes 兼容，不自动改写来源标记"
              />
              <div className="trade-drawer-actions">
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={detailSavingLegacy}
                  onClick={handleSaveDetailLegacy}
                >
                  保存兼容字段
                </Button>
              </div>
            </Card>
          </Space>
        )}
      </Drawer>

      <Modal
        title="粘贴导入期货交易"
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onOk={handleImport}
        okText="开始导入"
        cancelText="取消"
        confirmLoading={importLoading}
        width={860}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Alert
            type="info"
            showIcon
            message="直接从 Excel 复制 10 列数据后粘贴即可"
            description="列顺序：交易日期、合约、买/卖、投机（一般）/套保/套利、成交价、手数、成交额、开/平、手续费、平仓盈亏"
          />
          <AutoComplete
            value={importBroker}
            onChange={setImportBroker}
            style={{ width: 260 }}
            options={sourceOptions}
            placeholder="券商名称（支持自定义）"
          />
          <Input.TextArea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="在 Excel 中选中含表头或不含表头的数据区域，复制后粘贴到这里"
            autoSize={{ minRows: 12, maxRows: 22 }}
          />
          {importResult && (
            <div style={{ fontSize: 13 }}>
              <div>
                新增：{importResult.inserted}，跳过重复：{importResult.skipped}，错误：
                {importResult.errors?.length || 0}
              </div>
              {(importResult.errors?.length || 0) > 0 && (
                <div
                  style={{
                    marginTop: 8,
                    maxHeight: 180,
                    overflowY: 'auto',
                    background: '#fafafa',
                    border: '1px solid #eee',
                    padding: 8,
                  }}
                >
                  {importResult.errors.slice(0, 30).map((er, i) => (
                    <div key={i}>
                      第{er.row}行：{er.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Space>
      </Modal>

      <Modal
        title={`批量修改（${selectedRowKeys.length} 条）`}
        open={batchEditOpen}
        onCancel={() => setBatchEditOpen(false)}
        onOk={handleBatchEditSubmit}
        okText="应用修改"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Select
            value={batchPatch.status}
            onChange={(v) => setBatchPatch((p) => ({ ...p, status: v }))}
            placeholder="状态（不改可留空）"
            allowClear
            options={[
              { label: '持仓', value: 'open' },
              { label: '已平', value: 'closed' },
            ]}
          />
          <Input
            value={batchPatch.strategy_type}
            onChange={(e) => setBatchPatch((p) => ({ ...p, strategy_type: e.target.value }))}
            placeholder="策略类型（不改可留空）"
          />
          <Select
            value={batchPatch.is_planned}
            onChange={(v) => setBatchPatch((p) => ({ ...p, is_planned: v }))}
            placeholder="计划内（不改可留空）"
            allowClear
            options={[
              { label: '是', value: 'true' },
              { label: '否', value: 'false' },
            ]}
          />
          <Input.TextArea
            value={batchPatch.notes}
            onChange={(e) => setBatchPatch((p) => ({ ...p, notes: e.target.value }))}
            placeholder="备注（不改可留空）"
            autoSize={{ minRows: 3, maxRows: 6 }}
          />
        </Space>
      </Modal>
    </div>
  );
}
