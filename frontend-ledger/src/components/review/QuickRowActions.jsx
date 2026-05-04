import { AutoComplete, Button, Cascader, Popover, Space } from 'antd'
import { useState } from 'react'

/**
 * QuickRowActions — 行内快速操作组（浮现在行末）
 * Props:
 *   row              {object}  当前行数据
 *   batchId          {string}
 *   batchCommitted   {boolean}
 *   categories       {Array}   分类树数据
 *   merchants        {Array}   商户名列表（用于 AutoComplete）
 *   onConfirm        {Function(row)}
 *   onIgnore         {Function(row)}
 *   onReject         {Function(row)}
 *   onCategory       {Function(row, categoryName, subcategoryName)}
 *   onMerchant       {Function(row, merchantName)}
 *   onRule           {Function(row)}
 */
export default function QuickRowActions({ row, batchCommitted, categories, merchants = [], onConfirm, onIgnore, onReject, onCategory, onMerchant, onRule }) {
  const [catOpen, setCatOpen] = useState(false)
  const [merchantOpen, setMerchantOpen] = useState(false)
  const [merchantValue, setMerchantValue] = useState('')

  const cascaderOptions = (categories || []).map((cat) => ({
    value: cat.name,
    label: cat.name,
    children: (cat.children || []).map((sub) => ({ value: sub.name, label: sub.name })),
  }))

  if (batchCommitted) return null

  return (
    <Space size={2}>
      <Button
        type="link"
        size="small"
        style={{ padding: '0 4px', color: 'var(--lk-color-success)' }}
        onClick={() => onConfirm?.(row)}
      >
        确认
      </Button>

      <Popover
        open={catOpen}
        onOpenChange={setCatOpen}
        trigger="click"
        content={
          <Cascader
            options={cascaderOptions}
            onChange={(val) => {
              const [cat, sub] = val || []
              onCategory?.(row, cat, sub)
              setCatOpen(false)
            }}
            placeholder="选择分类"
            style={{ width: 240 }}
            open
            showSearch
          />
        }
      >
        <Button type="link" size="small" style={{ padding: '0 4px' }}>改分类</Button>
      </Popover>

      <Popover
        open={merchantOpen}
        onOpenChange={setMerchantOpen}
        trigger="click"
        content={
          <Space>
            <AutoComplete
              value={merchantValue}
              options={merchants.map((m) => ({ value: m }))}
              onChange={setMerchantValue}
              placeholder="输入商户名"
              style={{ width: 180 }}
              filterOption={(input, option) => (option?.value || '').toLowerCase().includes(input.toLowerCase())}
            />
            <Button
              type="primary"
              size="small"
              onClick={() => {
                if (merchantValue) {
                  onMerchant?.(row, merchantValue)
                  setMerchantOpen(false)
                  setMerchantValue('')
                }
              }}
            >
              确定
            </Button>
          </Space>
        }
      >
        <Button type="link" size="small" style={{ padding: '0 4px' }}>改商户</Button>
      </Popover>

      <Button
        type="link"
        size="small"
        style={{ padding: '0 4px', color: 'var(--lk-color-text-muted)' }}
        onClick={() => onIgnore?.(row)}
      >
        忽略
      </Button>

      <Button
        type="link"
        size="small"
        style={{ padding: '0 4px', color: 'var(--lk-color-text-muted)' }}
        onClick={() => onRule?.(row)}
      >
        加入规则
      </Button>
    </Space>
  )
}
