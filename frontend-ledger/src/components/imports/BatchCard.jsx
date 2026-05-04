import { Badge, Button, Card, Dropdown, Popconfirm, Space, Tag, Typography } from 'antd'
import { EllipsisOutlined } from '@ant-design/icons'
import { formatDateTime } from '../../utils/date'

const STATUS_COLOR = {
  uploaded: 'default',
  parsed: 'processing',
  classified: 'blue',
  deduped: 'orange',
  committed: 'green',
}
const STATUS_LABEL = {
  uploaded: '已上传',
  parsed: '已解析',
  classified: '已分类',
  deduped: '已清理',
  committed: '已提交',
}

function nextStepLabel(status) {
  if (status === 'uploaded') return '解析识别'
  if (status === 'parsed' || status === 'classified') return '清理重复'
  if (status === 'deduped') return '进入复核台'
  if (status === 'committed') return '查看明细'
  return '处理'
}

function nextStepAction(status, handlers) {
  if (status === 'uploaded') return handlers.onParseAndRecognize
  if (status === 'parsed' || status === 'classified') return handlers.onDedupe
  if (status === 'deduped') return handlers.onReview
  if (status === 'committed') return handlers.onReview
  return handlers.onReview
}

/**
 * BatchCard — 单个导入批次卡片
 * Props:
 *   batch         {object}   批次数据
 *   loading       {boolean}
 *   onReview      {Function} 进入复核台
 *   onParseAndRecognize {Function}
 *   onDedupe      {Function}
 *   onClassify    {Function}
 *   onReprocess   {Function}
 *   onCommit      {Function}
 *   onDelete      {Function}
 */
export default function BatchCard({ batch, loading, onReview, onParseAndRecognize, onDedupe, onClassify, onReprocess, onCommit, onDelete }) {
  const committed = batch.status === 'committed'
  const committableCount = Number(batch.committable_count || 0)
  const pendingCount = Number(batch.pending_count || 0)
  const duplicateCount = Number(batch.duplicate_count || 0)
  const unrecognizedCount = Number(batch.total_rows || 0) - Number(batch.matched_rows || 0)

  const mainLabel = nextStepLabel(batch.status)
  const mainAction = nextStepAction(batch.status, { onParseAndRecognize, onDedupe, onReview, onClassify })

  const moreItems = [
    ...(committed ? [] : [
      { key: 'parse', label: '解析识别', onClick: onParseAndRecognize },
      { key: 'classify', label: '分类', onClick: onClassify },
      { key: 'dedupe', label: '清理重复', onClick: onDedupe },
      { key: 'reprocess', label: '重算识别', onClick: onReprocess },
    ]),
    { key: 'divider', type: 'divider' },
    {
      key: 'delete',
      label: (
        <Popconfirm
          title="删除并回滚批次"
          description="将回滚已入账交易并删除导入行，操作不可逆。"
          okText="删除"
          cancelText="取消"
          onConfirm={onDelete}
          disabled={loading}
        >
          <span style={{ color: 'var(--lk-color-danger)' }}>删除</span>
        </Popconfirm>
      ),
    },
  ]

  return (
    <Card
      size="small"
      style={{
        borderRadius: 'var(--lk-radius-md)',
        boxShadow: 'var(--lk-shadow-card)',
        border: '1px solid var(--lk-color-border)',
        minWidth: 360,
      }}
      styles={{ body: { padding: '16px' } }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Typography.Text
            ellipsis={{ tooltip: batch.file_name }}
            style={{ maxWidth: 200, fontWeight: 600, color: 'var(--lk-color-text)' }}
          >
            {batch.file_name || '-'}
          </Typography.Text>
          <Tag color={STATUS_COLOR[batch.status] || 'default'}>{STATUS_LABEL[batch.status] || batch.status}</Tag>
        </div>
      }
      extra={
        <Space>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {batch.created_at ? formatDateTime(batch.created_at) : '-'}
          </Typography.Text>
          <Dropdown menu={{ items: moreItems }} trigger={['click']} disabled={loading}>
            <Button type="text" size="small" icon={<EllipsisOutlined />} />
          </Dropdown>
        </Space>
      }
    >
      {/* 指标行 */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--lk-color-text)' }}>
            {batch.total_rows ?? 0}
          </div>
          <div style={{ fontSize: 12, color: 'var(--lk-color-text-muted)' }}>总条数</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: pendingCount > 0 ? 'var(--lk-color-info)' : 'var(--lk-color-text-muted)' }}>
            {pendingCount}
          </div>
          <div style={{ fontSize: 12, color: 'var(--lk-color-text-muted)' }}>待确认</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: committableCount > 0 ? 'var(--lk-color-success)' : 'var(--lk-color-text-muted)' }}>
            {committableCount}
          </div>
          <div style={{ fontSize: 12, color: 'var(--lk-color-text-muted)' }}>可入账</div>
        </div>
        {unrecognizedCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Tag color="warning" style={{ fontSize: 12 }}>未识别 {unrecognizedCount}</Tag>
          </div>
        )}
      </div>

      {/* 底部主操作 */}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button
          type="primary"
          size="small"
          onClick={mainAction}
          disabled={loading}
          style={{ flex: 1, fontVariantNumeric: 'tabular-nums' }}
        >
          {mainLabel}
        </Button>
        {!committed && committableCount > 0 && (
          <Button
            size="small"
            onClick={onCommit}
            disabled={loading}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            提交 {committableCount} 条
          </Button>
        )}
      </div>
    </Card>
  )
}
