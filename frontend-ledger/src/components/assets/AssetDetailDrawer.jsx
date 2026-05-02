import { Alert, Button, Card, Descriptions, Divider, Drawer, Empty, Flex, Space, Statistic, Tabs, Tag, Typography } from 'antd'
import AssetEventsPanel from './AssetEventsPanel'
import AssetValuationsPanel from './AssetValuationsPanel'
import { buildAssetMetricsSnapshot } from './assetAnalytics'
import {
  displayEmpty,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  getAssetStatusColor,
  getAssetStatusLabel,
  getAssetTypeLabel,
} from './assetConstants'

function DetailBlock({ title, children }) {
  return (
    <div className="asset-library-detail-block">
      <Divider orientation="left">{title}</Divider>
      {children}
    </div>
  )
}

function ImageLinks({ images }) {
  if (!Array.isArray(images) || !images.length) {
    return <Typography.Text type="secondary">暂无图片链接</Typography.Text>
  }
  return (
    <Space direction="vertical" size={6} style={{ width: '100%' }}>
      {images.map((item) => (
        <Typography.Link key={item} href={item} target="_blank" rel="noreferrer">
          {item}
        </Typography.Link>
      ))}
    </Space>
  )
}

export default function AssetDetailDrawer({
  open,
  asset,
  loading = false,
  error = '',
  onClose,
  onEdit,
  onAssetMutated,
}) {
  const metrics = buildAssetMetricsSnapshot(asset)
  const metricDescriptions = [
    ['总投入成本', formatMoney(metrics.total_cost)],
    ['当前净消费成本', formatMoney(metrics.net_consumption_cost)],
    ['已实现消费成本', formatMoney(metrics.realized_consumption_cost)],
    ['现金日均成本', formatMoney(metrics.cash_daily_cost)],
    ['净日均成本', formatMoney(metrics.net_daily_cost)],
    ['已实现日均成本', formatMoney(metrics.realized_daily_cost)],
    ['残值率', formatPercent(metrics.residual_rate)],
    ['已实现盈亏', formatMoney(metrics.profit_loss)],
    ['持有天数', formatNumber(metrics.holding_days)],
    ['使用天数', formatNumber(metrics.use_days)],
  ]

  const overviewTab = asset ? (
    <Space direction="vertical" size={18} style={{ width: '100%' }}>
      <Card className="asset-library-detail-hero" bordered={false} loading={loading}>
        <Flex justify="space-between" align="flex-start" gap={16} wrap>
          <div>
            <Typography.Title level={4} className="asset-library-detail-title">
              {asset.name}
            </Typography.Title>
            <Space wrap size={[8, 8]}>
              <Tag color={getAssetStatusColor(asset.status)}>{getAssetStatusLabel(asset.status)}</Tag>
              <Tag>{getAssetTypeLabel(asset.asset_type)}</Tag>
              {asset.category ? <Tag>{asset.category}</Tag> : null}
              {asset.include_in_net_worth ? <Tag color="cyan">计入净资产</Tag> : <Tag>不计入净资产</Tag>}
            </Space>
          </div>
          <div className="asset-library-detail-value-group">
            <span>当前估值</span>
            <strong>{formatMoney(asset.current_value)}</strong>
          </div>
        </Flex>
      </Card>

      <div className="asset-library-detail-stat-grid">
        <Card bordered={false}>
          <Statistic title="总投入成本" value={formatMoney(metrics.total_cost)} />
        </Card>
        <Card bordered={false}>
          <Statistic title="净消费成本" value={formatMoney(metrics.net_consumption_cost)} />
        </Card>
        <Card bordered={false}>
          <Statistic title="净日均成本" value={formatMoney(metrics.net_daily_cost)} />
        </Card>
        <Card bordered={false}>
          <Statistic title="残值率" value={formatPercent(metrics.residual_rate)} />
        </Card>
      </div>

      <DetailBlock title="基础信息">
        <Descriptions column={2} size="small" bordered className="asset-library-detail-descriptions">
          <Descriptions.Item label="品牌">{displayEmpty(asset.brand)}</Descriptions.Item>
          <Descriptions.Item label="型号">{displayEmpty(asset.model)}</Descriptions.Item>
          <Descriptions.Item label="购买渠道">{displayEmpty(asset.purchase_channel)}</Descriptions.Item>
          <Descriptions.Item label="存放位置">{displayEmpty(asset.location)}</Descriptions.Item>
          <Descriptions.Item label="序列号">{displayEmpty(asset.serial_number)}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{formatDateTime(asset.created_at)}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{formatDateTime(asset.updated_at)}</Descriptions.Item>
          <Descriptions.Item label="归属角色">{displayEmpty(asset.owner_role)}</Descriptions.Item>
        </Descriptions>
      </DetailBlock>

      <DetailBlock title="成本与估值">
        <Descriptions column={2} size="small" bordered className="asset-library-detail-descriptions">
          <Descriptions.Item label="买入价格">{formatMoney(asset.purchase_price)}</Descriptions.Item>
          <Descriptions.Item label="额外成本">{formatMoney(asset.extra_cost)}</Descriptions.Item>
          <Descriptions.Item label="当前估值">{formatMoney(asset.current_value)}</Descriptions.Item>
          <Descriptions.Item label="卖出价格">{formatMoney(asset.sale_price)}</Descriptions.Item>
          <Descriptions.Item label="目标日均成本">{formatMoney(asset.target_daily_cost)}</Descriptions.Item>
          <Descriptions.Item label="已使用次数">{formatNumber(asset.usage_count)}</Descriptions.Item>
          <Descriptions.Item label="预计使用天数">{formatNumber(asset.expected_use_days)}</Descriptions.Item>
          <Descriptions.Item label="结束日期">{formatDate(asset.end_date)}</Descriptions.Item>
        </Descriptions>
      </DetailBlock>

      <DetailBlock title="生命周期摘要">
        <Descriptions column={2} size="small" bordered className="asset-library-detail-descriptions">
          <Descriptions.Item label="购买日期">{formatDate(asset.purchase_date)}</Descriptions.Item>
          <Descriptions.Item label="开始使用">{formatDate(asset.start_use_date)}</Descriptions.Item>
          <Descriptions.Item label="保修到期">{formatDate(asset.warranty_until)}</Descriptions.Item>
          <Descriptions.Item label="持有天数">{formatNumber(metrics.holding_days)}</Descriptions.Item>
          <Descriptions.Item label="使用天数">{formatNumber(metrics.use_days)}</Descriptions.Item>
          <Descriptions.Item label="距目标日均成本天数">{formatNumber(metrics.days_to_target)}</Descriptions.Item>
          <Descriptions.Item label="目标进度">{formatPercent(metrics.target_progress)}</Descriptions.Item>
        </Descriptions>
      </DetailBlock>

      <DetailBlock title="测算指标">
        <Descriptions column={2} size="small" bordered className="asset-library-detail-descriptions">
          {metricDescriptions.map(([label, value]) => (
            <Descriptions.Item key={label} label={label}>
              {value}
            </Descriptions.Item>
          ))}
        </Descriptions>
      </DetailBlock>

      <DetailBlock title="标签与备注">
        <Card bordered={false} className="asset-library-detail-note-card">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <Typography.Text type="secondary">标签</Typography.Text>
              <div className="asset-library-detail-tags">
                {Array.isArray(asset.tags) && asset.tags.length ? (
                  asset.tags.map((tag) => (
                    <Tag key={tag} className="asset-library-tag-chip">
                      {tag}
                    </Tag>
                  ))
                ) : (
                  <Typography.Text type="secondary">暂无标签</Typography.Text>
                )}
              </div>
            </div>
            <div>
              <Typography.Text type="secondary">图片</Typography.Text>
              <div className="asset-library-detail-images">
                <ImageLinks images={asset.images} />
              </div>
            </div>
            <div>
              <Typography.Text type="secondary">备注</Typography.Text>
              <Typography.Paragraph className="asset-library-detail-note-text">{displayEmpty(asset.note)}</Typography.Paragraph>
            </div>
          </Space>
        </Card>
      </DetailBlock>
    </Space>
  ) : null

  return (
    <Drawer
      title={asset?.name || '资产详情'}
      open={open}
      onClose={onClose}
      width="min(880px, calc(100vw - 24px))"
      destroyOnClose
      extra={
        onEdit && asset ? (
          <Button type="primary" onClick={() => onEdit(asset.id)}>
            编辑资产
          </Button>
        ) : null
      }
      className="asset-library-drawer"
    >
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
      {!asset && !loading ? <Empty description="未获取到资产详情" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : null}
      {asset ? (
        <Tabs
          className="asset-library-detail-tabs"
          items={[
            { key: 'overview', label: '资产概览', children: overviewTab, forceRender: true },
            {
              key: 'events',
              label: '生命周期事件',
              children: <AssetEventsPanel assetId={asset.id} onAssetMutated={onAssetMutated} title="生命周期事件" />,
              forceRender: true,
            },
            {
              key: 'valuations',
              label: '估值记录',
              children: <AssetValuationsPanel assetId={asset.id} onAssetMutated={onAssetMutated} title="估值记录" />,
              forceRender: true,
            },
          ]}
        />
      ) : null}
    </Drawer>
  )
}
