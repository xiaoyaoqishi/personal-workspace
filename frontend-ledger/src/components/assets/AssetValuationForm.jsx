import dayjs from 'dayjs'
import { Button, DatePicker, Flex, Form, Input, InputNumber, Select, Space, Typography } from 'antd'
import { ASSET_VALUATION_TYPE_OPTIONS } from './assetConstants'

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

export function getDefaultAssetValuationFormValues() {
  return {
    valuation_date: dayjs(),
    value: null,
    valuation_type: 'manual',
    source: '',
    note: '',
  }
}

export function buildAssetValuationPayload(values) {
  return {
    valuation_date: toDateString(values.valuation_date),
    value: Number(values.value),
    valuation_type: values.valuation_type || 'manual',
    source: toTextOrNull(values.source),
    note: toTextOrNull(values.note),
  }
}

export default function AssetValuationForm({
  form,
  onSubmit,
  submitting = false,
  submitText = '新增估值',
  onCancel,
}) {
  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={(values) => onSubmit(buildAssetValuationPayload(values), values)}
      className="asset-library-mini-form"
    >
      <div className="asset-library-form-grid asset-library-form-grid-3">
        <Form.Item label="估值日期" name="valuation_date" rules={[{ required: true, message: '请选择估值日期' }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="估值金额" name="value" rules={[{ required: true, message: '请输入估值金额' }]}>
          <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="0.00" />
        </Form.Item>
        <Form.Item label="估值方式" name="valuation_type">
          <Select options={ASSET_VALUATION_TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item label="来源" name="source">
          <Input placeholder="例如：闲鱼参考 / 手动判断 / 维修后重估" />
        </Form.Item>
      </div>

      <Form.Item label="备注" name="note">
        <Input.TextArea rows={3} placeholder="补充估值依据、成交环境、折旧假设等" />
      </Form.Item>

      <Flex justify="space-between" align="center" wrap gap={12}>
        <Typography.Text type="secondary">估值金额必须是合法数字，提交后会刷新当前估值与 metrics。</Typography.Text>
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
