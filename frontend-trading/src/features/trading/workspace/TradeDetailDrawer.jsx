import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Col,
  Collapse,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Rate,
  Row,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
  Select,
} from 'antd';
import InkSection from '../../../components/InkSection';
import { ReloadOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { formatInstrumentDisplay, normalizeTagList } from '../display';
import { getTaxonomyLabel, taxonomyOptionsWithZh } from '../localization';
import ReadEditActions from '../components/ReadEditActions';
import ResearchContentPanel from '../components/ResearchContentPanel';

const { TextArea } = Input;

export default function TradeDetailDrawer({
  open,
  tradeId,
  loading,
  trade,
  review,
  reviewExists,
  linkedPlans,
  reviewTaxonomy,
  savingReview,
  onClose,
  onReload,
  onOpenEdit,
  onChangeReview,
  onSaveReview,
  onUpdateTradeSignal,
}) {
  const [reviewEditing, setReviewEditing] = useState(false);

  useEffect(() => {
    setReviewEditing(false);
  }, [tradeId, open]);

  const reviewTags = useMemo(
    () => normalizeTagList(review?.tags),
    [review?.tags]
  );
  const hasReviewContent = useMemo(() => {
    if (reviewTags.length > 0) return true;
    return [
      review?.opportunity_structure,
      review?.edge_source,
      review?.failure_type,
      review?.review_conclusion,
      review?.discipline_violated,
      review?.research_notes,
    ].some((x) => {
      if (typeof x === 'boolean') return x;
      return String(x || '').trim();
    });
  }, [review, reviewTags]);

  const saveReview = async () => {
    await onSaveReview();
    setReviewEditing(false);
  };

  const cancelSectionEdit = async (setter) => {
    await onReload();
    setter(false);
  };

  const plans = linkedPlans || [];

  return (
    <Drawer
      title={tradeId ? `交易详情 #${tradeId}` : '交易详情'}
      width={720}
      open={open}
      onClose={onClose}
      destroyOnClose={false}
      extra={
        <Space>
          <Button size="small" icon={<ReloadOutlined />} onClick={onReload} disabled={!tradeId}>
            刷新
          </Button>
          {tradeId ? (
            <Button size="small" type="primary" onClick={onOpenEdit}>
              编辑
            </Button>
          ) : null}
        </Space>
      }
    >
      {loading ? (
        <div className="trade-drawer-loading">
          <Spin />
        </div>
      ) : !trade ? (
        <Typography.Text type="secondary">未找到交易详情</Typography.Text>
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {/* 成交流水 */}
          <InkSection size="small" title="成交信息">
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="交易日期">{trade.trade_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="品种">{formatInstrumentDisplay(trade.symbol, trade.contract)}</Descriptions.Item>
              <Descriptions.Item label="方向">
                <Tag color={trade.direction === '做多' ? 'red' : 'green'}>{trade.direction || '-'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={trade.status === 'closed' ? 'default' : 'processing'}>
                  {trade.status === 'closed' ? '已平' : '持仓'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="开仓价">{trade.open_price ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="平仓价">{trade.close_price ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="手数">{trade.quantity ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="盈亏">{trade.pnl ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="来源">{trade.source_display || '-'}</Descriptions.Item>
              <Descriptions.Item label="复盘">
                {reviewExists ? <Tag color="green">已建立</Tag> : <Tag>未建立</Tag>}
              </Descriptions.Item>
            </Descriptions>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 16 }}>
              <Button
                type="text"
                size="small"
                icon={trade.is_favorite ? <StarFilled style={{ color: '#f5a623' }} /> : <StarOutlined />}
                onClick={() => onUpdateTradeSignal?.({ is_favorite: !trade.is_favorite })}
              >
                {trade.is_favorite ? '已收藏' : '收藏'}
              </Button>
              <Rate
                value={trade.star_rating || 0}
                allowClear
                style={{ fontSize: 14 }}
                onChange={(v) => onUpdateTradeSignal?.({ star_rating: v || null })}
              />
            </div>
          </InkSection>

          {/* 关联计划 */}
          {plans.length > 0 ? (
            <InkSection size="small" title="关联计划">
              {plans.map((plan) => (
                <div key={plan.id} style={{ marginBottom: plans.length > 1 ? 10 : 0 }}>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>{plan.title}</div>
                  <Descriptions size="small" column={2}>
                    {plan.plan_date ? <Descriptions.Item label="日期">{plan.plan_date}</Descriptions.Item> : null}
                    {plan.symbol ? <Descriptions.Item label="品种">{plan.symbol}{plan.contract ? ` / ${plan.contract}` : ''}</Descriptions.Item> : null}
                    {plan.direction_bias ? <Descriptions.Item label="方向">{plan.direction_bias}</Descriptions.Item> : null}
                    {plan.setup_type ? <Descriptions.Item label="形态">{plan.setup_type}</Descriptions.Item> : null}
                    {plan.entry_zone ? <Descriptions.Item label="入场区" span={2}>{plan.entry_zone}</Descriptions.Item> : null}
                    {plan.stop_loss_plan ? <Descriptions.Item label="止损">{plan.stop_loss_plan}</Descriptions.Item> : null}
                    {plan.target_plan ? <Descriptions.Item label="目标">{plan.target_plan}</Descriptions.Item> : null}
                    {plan.invalid_condition ? <Descriptions.Item label="失效条件" span={2}>{plan.invalid_condition}</Descriptions.Item> : null}
                    {plan.thesis ? <Descriptions.Item label="论点" span={2}>{plan.thesis}</Descriptions.Item> : null}
                    {plan.risk_notes ? <Descriptions.Item label="风险" span={2}>{plan.risk_notes}</Descriptions.Item> : null}
                    {plan.execution_checklist ? <Descriptions.Item label="清单" span={2}>{plan.execution_checklist}</Descriptions.Item> : null}
                    {plan.status ? <Descriptions.Item label="状态"><Tag>{plan.status}</Tag></Descriptions.Item> : null}
                    {plan.priority ? <Descriptions.Item label="优先级">{plan.priority}</Descriptions.Item> : null}
                  </Descriptions>
                </div>
              ))}
            </InkSection>
          ) : null}

          {/* 结构化复盘 */}
          <InkSection
            size="small"
            title="结构化复盘"
            extra={
              <ReadEditActions
                editing={reviewEditing}
                saving={savingReview}
                onEdit={() => setReviewEditing(true)}
                onSave={saveReview}
                onCancel={() => cancelSectionEdit(setReviewEditing)}
              />
            }
          >
            {reviewEditing ? (
              <Row gutter={[12, 8]}>
                <Col span={12}>
                  <Typography.Text type="secondary">机会结构</Typography.Text>
                  <Select
                    size="small"
                    value={review.opportunity_structure || undefined}
                    allowClear
                    options={taxonomyOptionsWithZh('opportunity_structure', reviewTaxonomy.opportunity_structure)}
                    onChange={(v) => onChangeReview('opportunity_structure', v || '')}
                    placeholder="选择机会结构"
                    style={{ width: '100%' }}
                  />
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">优势来源</Typography.Text>
                  <Select
                    size="small"
                    value={review.edge_source || undefined}
                    allowClear
                    options={taxonomyOptionsWithZh('edge_source', reviewTaxonomy.edge_source)}
                    onChange={(v) => onChangeReview('edge_source', v || '')}
                    placeholder="选择优势来源"
                    style={{ width: '100%' }}
                  />
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">失败类型</Typography.Text>
                  <Select
                    size="small"
                    value={review.failure_type || undefined}
                    allowClear
                    options={taxonomyOptionsWithZh('failure_type', reviewTaxonomy.failure_type)}
                    onChange={(v) => onChangeReview('failure_type', v || '')}
                    placeholder="选择失败类型"
                    style={{ width: '100%' }}
                  />
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">复盘结论</Typography.Text>
                  <Select
                    size="small"
                    value={review.review_conclusion || undefined}
                    allowClear
                    options={taxonomyOptionsWithZh('review_conclusion', reviewTaxonomy.review_conclusion)}
                    onChange={(v) => onChangeReview('review_conclusion', v || '')}
                    placeholder="选择复盘结论"
                    style={{ width: '100%' }}
                  />
                </Col>
                <Col span={12}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <Typography.Text type="secondary">违反纪律</Typography.Text>
                    <Switch
                      size="small"
                      checked={!!review.discipline_violated}
                      onChange={(v) => onChangeReview('discipline_violated', v)}
                    />
                  </div>
                </Col>
                <Col span={24}>
                  <Typography.Text type="secondary">标签</Typography.Text>
                  <Select
                    size="small"
                    mode="tags"
                    tokenSeparators={[',', '，']}
                    value={review.tags || []}
                    onChange={(v) => onChangeReview('tags', v || [])}
                    style={{ width: '100%' }}
                    placeholder="输入并回车添加标签"
                  />
                </Col>
                <Col span={24}>
                  <ResearchContentPanel
                    editing
                    showStandardFields={false}
                    title="图文研究"
                    value={review.research_notes}
                    onChange={(next) => onChangeReview('research_notes', next)}
                  />
                </Col>
              </Row>
            ) : !hasReviewContent ? (
              <Empty description="暂无结构化复盘内容" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <div>
                <Space wrap size={[4, 4]} style={{ marginBottom: 8 }}>
                  {review.opportunity_structure ? <Tag color="blue">机会结构：{getTaxonomyLabel('opportunity_structure', review.opportunity_structure)}</Tag> : null}
                  {review.edge_source ? <Tag color="cyan">优势来源：{getTaxonomyLabel('edge_source', review.edge_source)}</Tag> : null}
                  {review.failure_type ? <Tag color="red">失败类型：{getTaxonomyLabel('failure_type', review.failure_type)}</Tag> : null}
                  {review.review_conclusion ? <Tag color="green">结论：{getTaxonomyLabel('review_conclusion', review.review_conclusion)}</Tag> : null}
                  {review.discipline_violated ? <Tag color="red">违反纪律</Tag> : null}
                </Space>
                {reviewTags.length > 0 ? (
                  <div style={{ marginBottom: 8 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>标签</Typography.Text>
                    <div style={{ marginTop: 2 }}>
                      {reviewTags.map((t) => <Tag key={t}>{t}</Tag>)}
                    </div>
                  </div>
                ) : null}
                <ResearchContentPanel
                  showStandardFields={false}
                  value={review.research_notes}
                  title="图文研究"
                />
              </div>
            )}
          </InkSection>

        </Space>
      )}
    </Drawer>
  );
}
