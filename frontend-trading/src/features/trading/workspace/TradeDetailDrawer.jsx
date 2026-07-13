import { useMemo } from 'react';
import {
  Button,
  Collapse,
  Descriptions,
  Drawer,
  Empty,
  Space,
  Spin,
  Tag,
  Typography,
  Timeline,
} from 'antd';
import InkSection from '../../../components/InkSection';
import { ReloadOutlined } from '@ant-design/icons';
import { formatChinaDateTime, formatInstrumentDisplay, normalizeTagList } from '../display';
import { getTaxonomyLabel } from '../localization';
import ResearchContentPanel from '../components/ResearchContentPanel';

export default function TradeDetailDrawer({
  open,
  tradeId,
  loading,
  trade,
  riskPointHistory,
  review,
  reviewExists,
  linkedPlans,
  onClose,
  onReload,
  onOpenEdit,
}) {
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
      review?.research_notes,
    ].some((x) => {
      if (typeof x === 'boolean') return x;
      return String(x || '').trim();
    });
  }, [review, reviewTags]);

  const plans = linkedPlans || [];
  const hasDecisionContent = [
    trade?.entry_logic,
    trade?.exit_logic,
    trade?.strategy_type,
    trade?.core_signal,
  ].some((value) => String(value || '').trim());

  return (
    <Drawer
      title={tradeId ? `交易详情 #${tradeId}` : '交易详情'}
      width="min(880px, 96vw)"
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
              <Descriptions.Item label="当前止损点">{trade.stop_loss_point ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="当前目标点">{trade.target_point ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="占本金百分比">{trade.capital_percentage != null ? `${trade.capital_percentage}%` : '-'}</Descriptions.Item>
              <Descriptions.Item label="盈亏">{trade.pnl ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="来源">{trade.source_display || '-'}</Descriptions.Item>
              <Descriptions.Item label="复盘">
                {reviewExists ? <Tag color="green">已建立</Tag> : <Tag>未建立</Tag>}
              </Descriptions.Item>
            </Descriptions>
          </InkSection>

          <InkSection size="small" title="交易决策">
            {hasDecisionContent ? (
              <Descriptions size="small" column={2}>
                <Descriptions.Item label="策略类型">{trade.strategy_type || '-'}</Descriptions.Item>
                <Descriptions.Item label="核心信号">{trade.core_signal || '-'}</Descriptions.Item>
                <Descriptions.Item label="入场逻辑" span={2}>{trade.entry_logic || '-'}</Descriptions.Item>
                <Descriptions.Item label="出场逻辑" span={2}>{trade.exit_logic || '-'}</Descriptions.Item>
              </Descriptions>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无交易决策内容" />
            )}
          </InkSection>

          <InkSection size="small" title="止损/目标/本金占比调整历史">
            {(riskPointHistory || []).length > 0 ? (
              <Timeline
                items={riskPointHistory.map((item) => ({
                  children: (
                    <div>
                      <div>止损点 {item.stop_loss_point ?? '-'} / 目标点 {item.target_point ?? '-'} / 本金占比 {item.capital_percentage != null ? `${item.capital_percentage}%` : '-'}</div>
                      <Typography.Text type="secondary">
                        {formatChinaDateTime(item.recorded_at)}
                      </Typography.Text>
                    </div>
                  ),
                }))}
              />
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无调整历史" />}
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
          <InkSection size="small" title="结构化复盘">
            {!hasReviewContent ? (
              <Empty description="暂无结构化复盘内容" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <div>
                <Space wrap size={[4, 4]} style={{ marginBottom: 8 }}>
                  {review.opportunity_structure ? <Tag color="blue">机会结构：{getTaxonomyLabel('opportunity_structure', review.opportunity_structure)}</Tag> : null}
                  {review.edge_source ? <Tag color="cyan">优势来源：{getTaxonomyLabel('edge_source', review.edge_source)}</Tag> : null}
                  {review.failure_type ? <Tag color="red">失败类型：{getTaxonomyLabel('failure_type', review.failure_type)}</Tag> : null}
                  {review.review_conclusion ? <Tag color="green">结论：{getTaxonomyLabel('review_conclusion', review.review_conclusion)}</Tag> : null}
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
