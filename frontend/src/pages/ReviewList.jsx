import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Empty,
  Form,
  Input,
  List,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { reviewApi, tradeApi } from '../api';
import { FUTURES_SYMBOL_OPTIONS } from '../utils/futures';
import {
  buildTradeSearchOption,
  formatInstrumentDisplay,
  formatReviewConclusionLabel,
  formatReviewRoleLabel,
  normalizeTagList,
} from '../features/trading/display';
import {
  REVIEW_SCOPE_ZH,
  REVIEW_TYPE_ZH,
  dictToOptions,
  mapLabel,
} from '../features/trading/localization';
import ReadEditActions from '../features/trading/components/ReadEditActions';
import './ReviewList.css';

const { TextArea } = Input;
const { RangePicker } = DatePicker;

const REVIEW_TYPE_OPTIONS = dictToOptions(REVIEW_TYPE_ZH);
const REVIEW_SCOPE_OPTIONS = dictToOptions(REVIEW_SCOPE_ZH);
const REVIEW_ROLE_OPTIONS = [
  { value: 'linked_trade', label: formatReviewRoleLabel('linked_trade') },
  { value: 'best_trade', label: formatReviewRoleLabel('best_trade') },
  { value: 'worst_trade', label: formatReviewRoleLabel('worst_trade') },
  { value: 'representative_trade', label: formatReviewRoleLabel('representative_trade') },
];
const TRADE_STATUS_OPTIONS = [
  { value: 'open', label: '持仓' },
  { value: 'closed', label: '已平' },
];

function normalizeReviewPayload(values) {
  return {
    ...values,
    tags: normalizeTagList(values.tags),
    title: values.title?.trim() || null,
    review_scope: values.review_scope || 'periodic',
    focus_topic: values.focus_topic?.trim() || null,
    market_regime: values.market_regime?.trim() || null,
    best_trade: values.best_trade?.trim() || null,
    worst_trade: values.worst_trade?.trim() || null,
    tomorrow_avoid: values.tomorrow_avoid?.trim() || null,
    profit_source: values.profit_source?.trim() || null,
    loss_source: values.loss_source?.trim() || null,
    continue_trades: values.continue_trades?.trim() || null,
    reduce_trades: values.reduce_trades?.trim() || null,
    repeated_errors: values.repeated_errors?.trim() || null,
    next_focus: values.next_focus?.trim() || null,
    profit_from_skill: values.profit_from_skill?.trim() || null,
    best_strategy: values.best_strategy?.trim() || null,
    profit_eating_behavior: values.profit_eating_behavior?.trim() || null,
    adjust_symbols: values.adjust_symbols?.trim() || null,
    adjust_position: values.adjust_position?.trim() || null,
    pause_patterns: values.pause_patterns?.trim() || null,
    summary: values.summary?.trim() || null,
    action_items: values.action_items?.trim() || null,
    content: values.content?.trim() || null,
    review_date: values.review_date.format('YYYY-MM-DD'),
  };
}

function summaryToOption(summary) {
  if (!summary?.trade_id) return null;
  return buildTradeSearchOption({
    trade_id: summary.trade_id,
    trade_date: summary.trade_date,
    symbol: summary.symbol,
    contract: summary.contract,
    direction: summary.direction,
    quantity: summary.quantity,
    open_price: summary.open_price,
    close_price: summary.close_price,
    status: summary.status,
    pnl: summary.pnl,
    source_display: summary.source_display,
    has_trade_review: summary.has_trade_review,
    review_conclusion: summary.review_conclusion,
  });
}

function LinkedTradeCard({ item }) {
  const s = item?.trade_summary || {};
  const instrumentLabel = formatInstrumentDisplay(s.symbol, s.contract);
  const roleLabel = formatReviewRoleLabel(item.role);
  return (
    <Card size="small" className="review-linked-card">
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        <Space wrap>
          <Tag color="blue">{roleLabel}</Tag>
          {s.direction ? <Tag color={s.direction === '做多' ? 'red' : 'green'}>{s.direction}</Tag> : null}
          {s.status ? <Tag>{s.status === 'closed' ? '已平' : '持仓'}</Tag> : null}
          {s.review_conclusion ? <Tag color="purple">{formatReviewConclusionLabel(s.review_conclusion)}</Tag> : null}
        </Space>
        <Typography.Text strong>{s.trade_date || '-'} · {instrumentLabel}</Typography.Text>
        <Typography.Text type="secondary">
          合约 {s.contract || '-'} · 手数 {s.quantity ?? '-'} · 开/平 {s.open_price ?? '-'}/{s.close_price ?? '-'}
        </Typography.Text>
        <Typography.Text type="secondary">
          PnL {s.pnl ?? '-'} · 来源 {s.source_display || '-'} · ID #{s.trade_id || item.trade_id}
        </Typography.Text>
        {item.notes ? <Typography.Text type="secondary">备注：{item.notes}</Typography.Text> : null}
      </Space>
    </Card>
  );
}

export default function ReviewList() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [activeType, setActiveType] = useState('daily');
  const [activeScope, setActiveScope] = useState(undefined);
  const [activeTag, setActiveTag] = useState(undefined);
  const [selectedReviewId, setSelectedReviewId] = useState(null);
  const [linkedTrades, setLinkedTrades] = useState([]);
  const [tradeOptions, setTradeOptions] = useState([]);
  const [tradeOptionLoading, setTradeOptionLoading] = useState(false);
  const [quickTradeId, setQuickTradeId] = useState(undefined);
  const [quickRole, setQuickRole] = useState('linked_trade');
  const [tradeSearch, setTradeSearch] = useState({
    q: '',
    symbol: undefined,
    status: undefined,
    dateRange: null,
  });
  const [form] = Form.useForm();
  const tradeSearchTimerRef = useRef(null);
  const tradeSearchReqRef = useRef(0);

  const selectedReview = useMemo(
    () => reviews.find((x) => x.id === selectedReviewId) || null,
    [reviews, selectedReviewId]
  );

  const reviewTagOptions = useMemo(() => {
    const set = new Set();
    reviews.forEach((r) => normalizeTagList(r.tags).forEach((t) => set.add(t)));
    return Array.from(set).map((x) => ({ value: x, label: x }));
  }, [reviews]);

  const linkedTradeIds = useMemo(() => {
    const set = new Set();
    linkedTrades.forEach((x) => {
      const id = Number(x.trade_id);
      if (id > 0) set.add(id);
    });
    if (quickTradeId) set.add(Number(quickTradeId));
    return Array.from(set);
  }, [linkedTrades, quickTradeId]);

  const tradeOptionsMerged = useMemo(() => {
    const map = {};
    tradeOptions.forEach((item) => {
      map[item.value] = item;
    });
    linkedTrades.forEach((item) => {
      const option = summaryToOption(item.trade_summary);
      if (option && !map[option.value]) {
        map[option.value] = option;
      }
    });
    return Object.values(map);
  }, [tradeOptions, linkedTrades]);

  const tradeOptionMap = useMemo(() => {
    const out = {};
    tradeOptionsMerged.forEach((item) => {
      out[item.value] = item;
    });
    return out;
  }, [tradeOptionsMerged]);

  const resetFormFromReview = (review) => {
    if (!review) {
      form.resetFields();
      form.setFieldsValue({
        review_type: activeType,
        review_scope: activeScope || 'periodic',
        review_date: dayjs(),
        tags: [],
      });
      setLinkedTrades([]);
      return;
    }
    form.setFieldsValue({
      ...review,
      tags: normalizeTagList(review.tags),
      review_type: review.review_type || activeType,
      review_scope: review.review_scope || 'periodic',
      review_date: review.review_date ? dayjs(review.review_date) : dayjs(),
    });
    setLinkedTrades((review.trade_links || []).map((x) => ({
      trade_id: x.trade_id,
      role: x.role || 'linked_trade',
      notes: x.notes || '',
      trade_summary: x.trade_summary || null,
    })));
  };

  const loadReviews = async (nextSelectedId = null) => {
    setLoading(true);
    try {
      const params = { review_type: activeType, size: 200 };
      if (activeScope) params.review_scope = activeScope;
      if (activeTag) params.tag = activeTag;
      const res = await reviewApi.list(params);
      const rows = res.data || [];
      setReviews(rows);
      const targetId = nextSelectedId ?? selectedReviewId;
      if (!rows.length) {
        setSelectedReviewId(null);
        resetFormFromReview(null);
        return;
      }
      if (targetId && rows.some((x) => x.id === targetId)) {
        setSelectedReviewId(targetId);
        resetFormFromReview(rows.find((x) => x.id === targetId));
        return;
      }
      setSelectedReviewId(rows[0].id);
      resetFormFromReview(rows[0]);
    } catch {
      message.error('复盘列表加载失败');
    } finally {
      setLoading(false);
    }
  };

  const searchTradeOptions = async ({ query, includeTradeIds = [], silent = false, searchState } = {}) => {
    const reqId = tradeSearchReqRef.current + 1;
    tradeSearchReqRef.current = reqId;
    if (!silent) setTradeOptionLoading(true);

    try {
      const activeSearch = searchState || tradeSearch;
      const includeIds = Array.from(new Set([...linkedTradeIds, ...(includeTradeIds || [])]))
        .filter((x) => Number(x) > 0)
        .map((x) => Number(x));
      const params = { limit: 50 };
      const keyword = String(query ?? activeSearch.q ?? '').trim();
      if (keyword) params.q = keyword;
      if (activeSearch.symbol) params.symbol = activeSearch.symbol;
      if (activeSearch.status) params.status = activeSearch.status;
      if (activeSearch.dateRange?.[0] && activeSearch.dateRange?.[1]) {
        params.date_from = activeSearch.dateRange[0].format('YYYY-MM-DD');
        params.date_to = activeSearch.dateRange[1].format('YYYY-MM-DD');
      }
      if (includeIds.length > 0) params.include_ids = includeIds.join(',');

      const res = await tradeApi.searchOptions(params);
      if (reqId !== tradeSearchReqRef.current) return;
      const options = (res.data?.items || []).map(buildTradeSearchOption);
      setTradeOptions(options);
    } catch {
      if (reqId !== tradeSearchReqRef.current) return;
      if (!silent) message.error('交易检索失败，请重试');
    } finally {
      if (reqId === tradeSearchReqRef.current && !silent) {
        setTradeOptionLoading(false);
      }
    }
  };

  const scheduleSearchTradeOptions = (query) => {
    if (tradeSearchTimerRef.current) {
      clearTimeout(tradeSearchTimerRef.current);
    }
    tradeSearchTimerRef.current = setTimeout(() => {
      searchTradeOptions({ query });
    }, 300);
  };

  useEffect(() => {
    loadReviews();
  }, [activeType, activeScope, activeTag]);

  useEffect(() => {
    return () => {
      if (tradeSearchTimerRef.current) {
        clearTimeout(tradeSearchTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!editing) return;
    searchTradeOptions({ query: tradeSearch.q, includeTradeIds: linkedTradeIds, silent: true });
  }, [editing, linkedTradeIds.join(',')]);

  const handleSelectReview = (review) => {
    setSelectedReviewId(review.id);
    resetFormFromReview(review);
    setEditing(false);
  };

  const handleNewReview = () => {
    setSelectedReviewId(null);
    resetFormFromReview(null);
    setEditing(true);
    searchTradeOptions({ query: '', includeTradeIds: [] });
  };

  const handleEditReview = () => {
    if (!selectedReview) return;
    resetFormFromReview(selectedReview);
    setEditing(true);
    searchTradeOptions({ query: tradeSearch.q, includeTradeIds: linkedTradeIds });
  };

  const handleCancelEdit = () => {
    resetFormFromReview(selectedReview);
    setEditing(false);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload = normalizeReviewPayload(values);
      let saved;
      if (selectedReviewId) {
        saved = (await reviewApi.update(selectedReviewId, payload)).data;
      } else {
        saved = (await reviewApi.create(payload)).data;
      }
      await reviewApi.upsertTradeLinks(saved.id, {
        trade_links: linkedTrades
          .filter((x) => x.trade_id)
          .map((x) => ({
            trade_id: Number(x.trade_id),
            role: x.role || 'linked_trade',
            notes: (x.notes || '').trim() || null,
          })),
      });
      message.success(selectedReviewId ? '复盘已更新' : '复盘已创建');
      setEditing(false);
      await loadReviews(saved.id);
      setSelectedReviewId(saved.id);
    } catch (e) {
      if (!e?.errorFields) {
        message.error(e?.response?.data?.detail || '保存失败');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedReviewId) return;
    try {
      await reviewApi.delete(selectedReviewId);
      message.success('复盘已删除');
      setEditing(false);
      await loadReviews();
    } catch {
      message.error('删除失败');
    }
  };

  const addLinkedTrade = () => {
    if (!quickTradeId) {
      message.warning('请先选择交易');
      return;
    }
    setLinkedTrades((prev) => {
      const next = [...prev];
      const idx = next.findIndex((x) => Number(x.trade_id) === Number(quickTradeId));
      const tradeSummary = tradeOptionMap[Number(quickTradeId)]?.summary || null;
      if (idx >= 0) {
        next[idx] = { ...next[idx], role: quickRole || 'linked_trade', trade_summary: tradeSummary };
      } else {
        next.push({ trade_id: Number(quickTradeId), role: quickRole || 'linked_trade', notes: '', trade_summary: tradeSummary });
      }
      return next;
    });
    setQuickTradeId(undefined);
  };

  const updateLinkedTrade = (index, patch) => {
    setLinkedTrades((prev) =>
      prev.map((x, i) => {
        if (i !== index) return x;
        const next = { ...x, ...patch };
        if (patch.trade_id) {
          next.trade_summary = tradeOptionMap[Number(patch.trade_id)]?.summary || x.trade_summary || null;
        }
        return next;
      })
    );
  };

  const removeLinkedTrade = (index) => {
    setLinkedTrades((prev) => prev.filter((_, i) => i !== index));
  };

  const type = Form.useWatch('review_type', form) || activeType;
  const tagsForRead = normalizeTagList(selectedReview?.tags);

  return (
    <div className="review-workspace">
      <Card className="review-toolbar" bodyStyle={{ padding: 12 }}>
        <div className="review-toolbar-inner">
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>复盘研究工作台</Typography.Title>
            <Typography.Text type="secondary">默认内容优先阅读，进入编辑模式后再处理结构化字段与关联样本。</Typography.Text>
          </div>
          <Space wrap>
            <Select value={activeType} options={REVIEW_TYPE_OPTIONS} onChange={setActiveType} style={{ width: 130 }} />
            <Select allowClear value={activeScope} options={REVIEW_SCOPE_OPTIONS} placeholder="范围" onChange={setActiveScope} style={{ width: 130 }} />
            <Select allowClear value={activeTag} options={reviewTagOptions} placeholder="标签筛选" onChange={setActiveTag} style={{ width: 140 }} />
            <Button onClick={handleNewReview} icon={<PlusOutlined />}>新建复盘</Button>
            <ReadEditActions
              editing={editing}
              saving={saving}
              onEdit={handleEditReview}
              onSave={handleSave}
              onCancel={handleCancelEdit}
              editDisabled={!selectedReviewId}
            />
            <Popconfirm title="确认删除当前复盘？" onConfirm={handleDelete} disabled={!selectedReviewId}>
              <Button danger icon={<DeleteOutlined />} disabled={!selectedReviewId}>删除</Button>
            </Popconfirm>
          </Space>
        </div>
      </Card>

      <Row gutter={12}>
        <Col xs={24} xl={8}>
          <Card title="复盘列表" className="review-list-card" loading={loading}>
            <List
              dataSource={reviews}
              locale={{ emptyText: <Empty description="暂无复盘" /> }}
              renderItem={(item) => (
                <List.Item className={`review-list-item ${item.id === selectedReviewId ? 'active' : ''}`} onClick={() => handleSelectReview(item)}>
                  <div className="review-list-main">
                    <div className="review-list-title">{item.title || `${item.review_date} ${mapLabel(REVIEW_TYPE_ZH, item.review_type)}`}</div>
                    <div className="review-list-meta">
                      <Tag>{mapLabel(REVIEW_TYPE_ZH, item.review_type)}</Tag>
                      <Tag color="blue">{mapLabel(REVIEW_SCOPE_ZH, item.review_scope || 'periodic')}</Tag>
                      <Tag color="gold">关联 {item.linked_trade_ids?.length || 0}</Tag>
                    </div>
                    <Typography.Paragraph className="review-list-summary" ellipsis={{ rows: 2 }}>
                      {item.summary || item.focus_topic || item.next_focus || '无摘要'}
                    </Typography.Paragraph>
                  </div>
                </List.Item>
              )}
            />
          </Card>
        </Col>

        <Col xs={24} xl={16}>
          <Card title={selectedReviewId ? `复盘 #${selectedReviewId}` : '新建复盘'} className="review-editor-card">
            {editing ? (
              <>
                <Form form={form} layout="vertical" initialValues={{ review_type: activeType, review_scope: 'periodic', review_date: dayjs(), tags: [] }}>
                  <Row gutter={12}>
                    <Col span={10}><Form.Item name="title" label="标题"><Input placeholder="例如：本周趋势延续复盘" /></Form.Item></Col>
                    <Col span={5}><Form.Item name="review_type" label="类型" rules={[{ required: true }]}><Select options={REVIEW_TYPE_OPTIONS} /></Form.Item></Col>
                    <Col span={5}><Form.Item name="review_scope" label="范围"><Select options={REVIEW_SCOPE_OPTIONS} /></Form.Item></Col>
                    <Col span={4}><Form.Item name="review_date" label="日期" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
                    <Col span={8}><Form.Item name="focus_topic" label="聚焦主题"><Input placeholder="setup / 失败类型 / 环境" /></Form.Item></Col>
                    <Col span={8}><Form.Item name="market_regime" label="市场环境"><Input placeholder="高波趋势 / 低波噪声" /></Form.Item></Col>
                    <Col span={8}>
                      <Form.Item name="tags" label="标签">
                        <Select mode="tags" tokenSeparators={[',', '，']} options={reviewTagOptions} placeholder="输入标签并回车" />
                      </Form.Item>
                    </Col>

                    {type === 'daily' && (
                      <>
                        <Col span={12}><Form.Item name="best_trade" label="最佳交易"><TextArea rows={2} /></Form.Item></Col>
                        <Col span={12}><Form.Item name="worst_trade" label="最差交易"><TextArea rows={2} /></Form.Item></Col>
                        <Col span={8}><Form.Item name="discipline_violated" label="纪律违规" valuePropName="checked"><Switch /></Form.Item></Col>
                        <Col span={8}><Form.Item name="loss_acceptable" label="亏损可接受" valuePropName="checked"><Switch /></Form.Item></Col>
                        <Col span={8}><Form.Item name="execution_score" label="执行评分(1-10)"><Input type="number" /></Form.Item></Col>
                        <Col span={24}><Form.Item name="tomorrow_avoid" label="下一交易日避免"><TextArea rows={2} /></Form.Item></Col>
                      </>
                    )}

                    {type === 'weekly' && (
                      <>
                        <Col span={12}><Form.Item name="profit_source" label="主要盈利来源"><TextArea rows={2} /></Form.Item></Col>
                        <Col span={12}><Form.Item name="loss_source" label="主要亏损来源"><TextArea rows={2} /></Form.Item></Col>
                        <Col span={12}><Form.Item name="continue_trades" label="继续做"><TextArea rows={2} /></Form.Item></Col>
                        <Col span={12}><Form.Item name="reduce_trades" label="减少做"><TextArea rows={2} /></Form.Item></Col>
                        <Col span={12}><Form.Item name="repeated_errors" label="重复错误"><TextArea rows={2} /></Form.Item></Col>
                        <Col span={12}><Form.Item name="next_focus" label="下周聚焦"><TextArea rows={2} /></Form.Item></Col>
                      </>
                    )}

                    {type === 'monthly' && (
                      <>
                        <Col span={12}><Form.Item name="profit_from_skill" label="盈利来自能力/运气"><TextArea rows={2} /></Form.Item></Col>
                        <Col span={12}><Form.Item name="best_strategy" label="真正有优势的策略"><TextArea rows={2} /></Form.Item></Col>
                        <Col span={12}><Form.Item name="profit_eating_behavior" label="吞噬利润行为"><TextArea rows={2} /></Form.Item></Col>
                        <Col span={12}><Form.Item name="adjust_symbols" label="品种池调整"><TextArea rows={2} /></Form.Item></Col>
                        <Col span={12}><Form.Item name="adjust_position" label="仓位体系调整"><TextArea rows={2} /></Form.Item></Col>
                        <Col span={12}><Form.Item name="pause_patterns" label="暂停模式"><TextArea rows={2} /></Form.Item></Col>
                      </>
                    )}

                    <Col span={24}><Form.Item name="summary" label="结论摘要"><TextArea rows={2} /></Form.Item></Col>
                    <Col span={24}><Form.Item name="action_items" label="后续动作"><TextArea rows={2} placeholder="可转化为执行清单/知识项" /></Form.Item></Col>
                    <Col span={24}><Form.Item name="content" label="详细复盘"><TextArea rows={4} /></Form.Item></Col>
                  </Row>
                </Form>

                <Card size="small" title="关联交易（检索 + 样本）" className="review-link-card">
                  <div className="review-link-search-grid">
                    <Input
                      allowClear
                      value={tradeSearch.q}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTradeSearch((prev) => ({ ...prev, q: v }));
                        scheduleSearchTradeOptions(v);
                      }}
                      placeholder="搜索：交易ID / 合约 / 品种 / 来源"
                    />
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      options={FUTURES_SYMBOL_OPTIONS}
                      value={tradeSearch.symbol}
                      placeholder="品种"
                      onChange={(v) => {
                        const nextSearch = { ...tradeSearch, symbol: v };
                        setTradeSearch(nextSearch);
                        searchTradeOptions({ query: nextSearch.q, searchState: nextSearch });
                      }}
                    />
                    <Select
                      allowClear
                      options={TRADE_STATUS_OPTIONS}
                      value={tradeSearch.status}
                      placeholder="状态"
                      onChange={(v) => {
                        const nextSearch = { ...tradeSearch, status: v };
                        setTradeSearch(nextSearch);
                        searchTradeOptions({ query: nextSearch.q, searchState: nextSearch });
                      }}
                    />
                    <RangePicker
                      value={tradeSearch.dateRange}
                      onChange={(dates) => {
                        const nextSearch = { ...tradeSearch, dateRange: dates };
                        setTradeSearch(nextSearch);
                        searchTradeOptions({ query: nextSearch.q, searchState: nextSearch });
                      }}
                    />
                  </div>

                  <Space wrap style={{ marginTop: 10, marginBottom: 10, width: '100%' }}>
                    <Select
                      showSearch
                      filterOption={false}
                      value={quickTradeId}
                      onChange={setQuickTradeId}
                      onSearch={scheduleSearchTradeOptions}
                      onFocus={() => searchTradeOptions({ query: tradeSearch.q, includeTradeIds: linkedTradeIds })}
                      options={tradeOptionsMerged}
                      placeholder="输入关键词检索交易后选择"
                      style={{ width: 520, maxWidth: '100%' }}
                      optionFilterProp="label"
                      loading={tradeOptionLoading}
                      notFoundContent={tradeOptionLoading ? '检索中...' : '暂无匹配交易，继续输入关键词'}
                    />
                    <Select value={quickRole} onChange={setQuickRole} options={REVIEW_ROLE_OPTIONS} style={{ width: 150 }} />
                    <Button onClick={addLinkedTrade}>添加关联</Button>
                  </Space>

                  {!linkedTrades.length ? (
                    <Empty description="尚未关联交易" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : (
                    <List
                      dataSource={linkedTrades}
                      renderItem={(item, index) => (
                        <List.Item
                          actions={[
                            <Button key="delete" type="link" danger onClick={() => removeLinkedTrade(index)}>移除</Button>,
                          ]}
                        >
                          <div className="review-link-row">
                            <Select
                              size="small"
                              showSearch
                              filterOption={false}
                              optionFilterProp="label"
                              value={item.trade_id}
                              onSearch={scheduleSearchTradeOptions}
                              onFocus={() => searchTradeOptions({ query: tradeSearch.q, includeTradeIds: linkedTradeIds })}
                              onChange={(v) => updateLinkedTrade(index, { trade_id: v })}
                              options={tradeOptionsMerged}
                              style={{ width: 420 }}
                              loading={tradeOptionLoading}
                              notFoundContent={tradeOptionLoading ? '检索中...' : '请输入关键词检索交易'}
                            />
                            <Select
                              size="small"
                              value={item.role || 'linked_trade'}
                              options={REVIEW_ROLE_OPTIONS}
                              onChange={(v) => updateLinkedTrade(index, { role: v })}
                              style={{ width: 140 }}
                            />
                            <Input
                              size="small"
                              placeholder="样本备注"
                              value={item.notes || ''}
                              onChange={(e) => updateLinkedTrade(index, { notes: e.target.value })}
                            />
                          </div>
                        </List.Item>
                      )}
                    />
                  )}
                </Card>
              </>
            ) : !selectedReview ? (
              <Empty description="请选择左侧复盘或新建复盘" />
            ) : (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Card size="small" title="复盘概览" className="review-read-card">
                  <Descriptions size="small" column={2}>
                    <Descriptions.Item label="标题">{selectedReview.title || '-'}</Descriptions.Item>
                    <Descriptions.Item label="日期">{selectedReview.review_date || '-'}</Descriptions.Item>
                    <Descriptions.Item label="类型">{mapLabel(REVIEW_TYPE_ZH, selectedReview.review_type)}</Descriptions.Item>
                    <Descriptions.Item label="范围">{mapLabel(REVIEW_SCOPE_ZH, selectedReview.review_scope || 'periodic')}</Descriptions.Item>
                    <Descriptions.Item label="聚焦主题">{selectedReview.focus_topic || '-'}</Descriptions.Item>
                    <Descriptions.Item label="市场环境">{selectedReview.market_regime || '-'}</Descriptions.Item>
                  </Descriptions>
                  {tagsForRead.length > 0 ? (
                    <div style={{ marginTop: 8 }}>
                      <Typography.Text type="secondary">标签</Typography.Text>
                      <div style={{ marginTop: 6 }}>{tagsForRead.map((t) => <Tag key={t}>{t}</Tag>)}</div>
                    </div>
                  ) : null}
                </Card>

                {selectedReview.summary ? (
                  <Card size="small" title="结论摘要" className="review-read-card">
                    <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{selectedReview.summary}</Typography.Paragraph>
                  </Card>
                ) : null}
                {selectedReview.action_items ? (
                  <Card size="small" title="后续动作" className="review-read-card">
                    <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{selectedReview.action_items}</Typography.Paragraph>
                  </Card>
                ) : null}
                {selectedReview.content ? (
                  <Card size="small" title="详细复盘" className="review-read-card">
                    <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{selectedReview.content}</Typography.Paragraph>
                  </Card>
                ) : null}

                <Card size="small" title="关联交易（内容卡片）" className="review-link-card">
                  {(selectedReview.trade_links || []).length === 0 ? (
                    <Empty description="暂无关联交易" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : (
                    <div className="review-linked-grid">
                      {(selectedReview.trade_links || []).map((item) => (
                        <LinkedTradeCard key={`${item.id}-${item.trade_id}`} item={item} />
                      ))}
                    </div>
                  )}
                </Card>
              </Space>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
