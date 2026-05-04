import { Button, Space, Tag } from 'antd'

/**
 * ReviewBulkBar — 底部浮动批量操作 Toolbar
 * Props:
 *   selectedCount  {number}
 *   batchCommitted {boolean}
 *   onConfirm      {Function}
 *   onIgnore       {Function}
 *   onCategory     {Function}
 *   onMerchant     {Function}
 *   onRule         {Function}
 *   onClear        {Function}
 */
export default function ReviewBulkBar({ selectedCount, batchCommitted, onConfirm, onIgnore, onCategory, onMerchant, onRule, onClear }) {
  if (!selectedCount) return null
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--lk-color-surface)',
        border: '1px solid var(--lk-color-border)',
        borderRadius: 'var(--lk-radius-md)',
        boxShadow: 'var(--lk-shadow-pop)',
        padding: '10px 20px',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minWidth: 480,
      }}
    >
      <Tag color="blue" style={{ fontVariantNumeric: 'tabular-nums' }}>已选 {selectedCount} 条</Tag>
      <Space>
        <Button size="small" type="primary" disabled={batchCommitted} onClick={onConfirm}>批量确认</Button>
        <Button size="small" disabled={batchCommitted} onClick={onCategory}>改分类</Button>
        <Button size="small" disabled={batchCommitted} onClick={onMerchant}>改商户</Button>
        <Button size="small" disabled={batchCommitted} onClick={onIgnore}>批量忽略</Button>
        <Button size="small" disabled={batchCommitted} onClick={onRule}>加入规则</Button>
        <Button size="small" onClick={onClear}>取消选择</Button>
      </Space>
    </div>
  )
}
