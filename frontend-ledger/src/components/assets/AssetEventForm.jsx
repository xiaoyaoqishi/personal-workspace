import { useEffect } from 'react'
import dayjs from 'dayjs'
import { Alert, Button, DatePicker, Flex, Form, Input, InputNumber, Select, Space, Typography } from 'antd'
import { ASSET_EVENT_TYPE_OPTIONS, getAssetEventHint, getAssetEventTypeLabel } from './assetConstants'

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : null
}

function toDateString(value) {
  if (!value) return null
  const date = dayjs(value)
  return date.isValid() ? date.format('YYYY-MM-DD') : null
}

function toTextOrNull(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text || null
}

export function getDefaultAssetEventFormValues() {
  return {
    event_type: 'note',
    event_date: dayjs(),
    title: '',
    amount: null,
    note: '',
  }
}

export function buildAssetEventPayload(values) {
  return {
    event_type: values.event_type,
    event_date: toDateString(values.event_date),
    title: String(values.title || '').trim(),
    amount: toNumberOrNull(values.amount),
    note: toTextOrNull(values.note),
  }
}

export default function AssetEventForm({
  form,
  onSubmit,
  submitting = false,
  submitText = '记录事件',
  onCancel,
}) {
  const eventType = Form.useWatch('event_type', form)
  const hint = getAssetEventHint(eventType)

  useEffect(() => {
    if (!form.getFieldValue('title') && eventType) {
      form.setFieldValue('title', getAssetEventTypeLabel(eventType))
    }
  }, [eventType, form])

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={(values) => onSubmit(buildAssetEventPayload(values), values)}
      className="asset-library-mini-form"
    >
      {hint ? <Alert type="info" showIcon message={hint} className="asset-library-inline-alert" /> : null}

      <div className="asset-library-form-grid asset-library-form-grid-3">
        <Form.Item label="事件类型" name="event_type" rules={[{ required: true, message: '请选择事件类型' }]}>
          <Select options={ASSET_EVENT_TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item label="事件日期" name="event_date" rules={[{ required: true, message: '请选择事件日期' }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="标题" name="title" rules={[{ required: true, message: '请输入事件标题' }]}>
          <Input placeholder="例如：更换电池 / 开始使用 / 挂售" />
        </Form.Item>
        <Form.Item label="金额" name="amount">
          <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="为空则不提交" />
        </Form.Item>
      </div>

      <Form.Item label="备注" name="note">
        <Input.TextArea rows={3} placeholder="补充维修内容、挂售渠道、卖出背景、使用说明等" />
      </Form.Item>

      <Flex justify="space-between" align="center" wrap gap={12}>
        <Typography.Text type="secondary">金额为空时会提交 `null`，不会发送 `NaN`。</Typography.Text>
        <Space>
          {onCancel ? <Button onClick={onCancel}>取消</Button> : null}
          <Button type="primary" htmlType="submit" loading={submitting}>
            {submitText}
          </Button>
        </Space>
      </Flex>
    </Form>
  )
}
