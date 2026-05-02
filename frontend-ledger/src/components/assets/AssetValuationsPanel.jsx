import { useEffect, useState } from 'react'
import { Alert, Button, Card, Empty, Flex, Form, List, Space, Spin, Tag, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { createAssetValuation, listAssetValuations } from '../../api/assets'
import AssetValuationForm, { getDefaultAssetValuationFormValues } from './AssetValuationForm'
import {
  displayEmpty,
  formatDate,
  formatDateTime,
  formatMoney,
  getAssetValuationTypeColor,
  getAssetValuationTypeLabel,
} from './assetConstants'

function ValuationRecord({ item }) {
  return (
    <div className="asset-library-record-card">
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        <Flex justify="space-between" align="flex-start" gap={12} wrap>
          <Space wrap size={[8, 8]}>
            <Tag color={getAssetValuationTypeColor(item.valuation_type)}>{getAssetValuationTypeLabel(item.valuation_type)}</Tag>
            <Typography.Text type="secondary">{formatDate(item.valuation_date)}</Typography.Text>
            <Typography.Text type="secondary">创建于 {formatDateTime(item.created_at)}</Typography.Text>
          </Space>
          <Typography.Text strong className="asset-library-record-amount">
            {formatMoney(item.value)}
          </Typography.Text>
        </Flex>
        <Space wrap size={[16, 8]} className="asset-library-record-meta">
          <span>来源 {displayEmpty(item.source)}</span>
        </Space>
        {item.note ? <Typography.Paragraph className="asset-library-record-note">{item.note}</Typography.Paragraph> : null}
      </Space>
    </div>
  )
}

export default function AssetValuationsPanel({
  assetId,
  onAssetMutated,
  title = '估值记录',
  defaultFormOpen = false,
}) {
  const [form] = Form.useForm()
  const [valuations, setValuations] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formOpen, setFormOpen] = useState(defaultFormOpen)

  const resetForm = () => {
    form.resetFields()
    form.setFieldsValue(getDefaultAssetValuationFormValues())
  }

  const loadValuations = async () => {
    if (!assetId) {
      setValuations([])
      setError('')
      return
    }
    setLoading(true)
    setError('')
    try {
      const payload = await listAssetValuations(assetId)
      setValuations(Array.isArray(payload?.items) ? payload.items : [])
    } catch (nextError) {
      setError(nextError?.userMessage || '估值记录加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    resetForm()
  }, [form])

  useEffect(() => {
    setFormOpen(defaultFormOpen)
    loadValuations()
    resetForm()
  }, [assetId, defaultFormOpen])

  const handleCreate = async (payload) => {
    if (!assetId) return
    setSubmitting(true)
    try {
      await createAssetValuation(assetId, payload)
      message.success('估值记录已新增，当前估值与指标会同步刷新')
      await loadValuations()
      resetForm()
      if (!defaultFormOpen) {
        setFormOpen(false)
      }
      if (onAssetMutated) {
        await onAssetMutated(assetId, { source: 'valuation', valuationType: payload.valuation_type })
      }
    } catch (error) {
      message.error(error?.userMessage || '估值记录新增失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card
      className="asset-library-subpanel-card"
      title={title}
      bordered={false}
      extra={
        assetId ? (
          <Button type={formOpen ? 'default' : 'primary'} icon={<PlusOutlined />} onClick={() => setFormOpen((prev) => !prev)}>
            {formOpen ? '收起表单' : '新增估值'}
          </Button>
        ) : null
      }
    >
      {error ? <Alert type="error" showIcon message={error} className="asset-library-inline-alert" /> : null}
      {!assetId ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择资产后查看估值记录" />
      ) : loading ? (
        <div className="asset-library-loading-state asset-library-loading-state-compact">
          <Spin />
        </div>
      ) : valuations.length ? (
        <List
          className="asset-library-record-list"
          dataSource={valuations}
          renderItem={(item) => (
            <List.Item className="asset-library-record-list-item">
              <ValuationRecord item={item} />
            </List.Item>
          )}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无估值记录" />
      )}

      {formOpen && assetId ? (
        <Card className="asset-library-inline-form-card" size="small" title="新增估值记录" bordered={false}>
          <AssetValuationForm
            form={form}
            onSubmit={handleCreate}
            submitting={submitting}
            onCancel={defaultFormOpen ? undefined : () => setFormOpen(false)}
          />
        </Card>
      ) : null}
    </Card>
  )
}
