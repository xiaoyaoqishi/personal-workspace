import { useMemo } from 'react'
import dayjs from 'dayjs'
import {
  Button,
  Card,
  DatePicker,
  Flex,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Typography,
} from 'antd'
import {
  ASSET_STATUS_OPTIONS,
  ASSET_TYPE_OPTIONS,
  EMPTY_VALUE,
  formatMoney,
  formatNumber,
  formatPercent,
} from './assetConstants'

const DEFAULT_ASSET_TYPE = 'electronics'

function toDayjs(value) {
  if (!value) return null
  const date = dayjs(value)
  return date.isValid() ? date : null
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : null
}

function toStringOrNull(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text || null
}

function toDateString(value) {
  if (!value) return null
  const date = dayjs(value)
  return date.isValid() ? date.format('YYYY-MM-DD') : null
}

function computePreview(values = {}) {
  const purchasePrice = toNumberOrNull(values.purchase_price) ?? 0
  const extraCost = toNumberOrNull(values.extra_cost) ?? 0
  const currentValue = toNumberOrNull(values.current_value) ?? 0
  const totalCost = purchasePrice + extraCost
  const netConsumptionCost = totalCost - currentValue
  const residualRate = totalCost > 0 ? currentValue / totalCost : null

  let useDays = null
  let netDailyCost = null
  if (values.start_use_date) {
    const startDate = dayjs(values.start_use_date)
    if (startDate.isValid()) {
      const diff = dayjs().startOf('day').diff(startDate.startOf('day'), 'day')
      useDays = diff >= 0 ? diff + 1 : 0
      netDailyCost = useDays > 0 ? netConsumptionCost / useDays : null
    }
  }

  return {
    totalCost,
    netConsumptionCost,
    residualRate,
    useDays,
    netDailyCost,
  }
}

export function getDefaultAssetFormValues() {
  return {
    name: '',
    asset_type: DEFAULT_ASSET_TYPE,
    category: '',
    status: 'in_use',
    brand: '',
    model: '',
    purchase_channel: '',
    purchase_price: null,
    extra_cost: null,
    current_value: null,
    target_daily_cost: null,
    include_in_net_worth: true,
    purchase_date: null,
    start_use_date: null,
    warranty_until: null,
    expected_use_days: null,
    location: '',
    serial_number: '',
    tags: [],
    imagesText: '',
    note: '',
  }
}

export function buildAssetFormValues(asset) {
  const defaults = getDefaultAssetFormValues()
  if (!asset) return defaults
  return {
    ...defaults,
    name: asset.name || '',
    asset_type: asset.asset_type || DEFAULT_ASSET_TYPE,
    category: asset.category || '',
    status: asset.status || 'in_use',
    brand: asset.brand || '',
    model: asset.model || '',
    purchase_channel: asset.purchase_channel || '',
    purchase_price: toNumberOrNull(asset.purchase_price),
    extra_cost: toNumberOrNull(asset.extra_cost),
    current_value: toNumberOrNull(asset.current_value),
    target_daily_cost: toNumberOrNull(asset.target_daily_cost),
    include_in_net_worth: asset.include_in_net_worth !== false,
    purchase_date: toDayjs(asset.purchase_date),
    start_use_date: toDayjs(asset.start_use_date),
    warranty_until: toDayjs(asset.warranty_until),
    expected_use_days: asset.expected_use_days ?? null,
    location: asset.location || '',
    serial_number: asset.serial_number || '',
    tags: Array.isArray(asset.tags) ? asset.tags : [],
    imagesText: Array.isArray(asset.images) ? asset.images.join('\n') : '',
    note: asset.note || '',
  }
}

export function buildAssetPayload(values) {
  const imageLines = String(values.imagesText || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)

  return {
    name: String(values.name || '').trim(),
    asset_type: toStringOrNull(values.asset_type) || DEFAULT_ASSET_TYPE,
    category: toStringOrNull(values.category),
    status: toStringOrNull(values.status) || 'in_use',
    brand: toStringOrNull(values.brand),
    model: toStringOrNull(values.model),
    purchase_channel: toStringOrNull(values.purchase_channel),
    purchase_price: toNumberOrNull(values.purchase_price),
    extra_cost: toNumberOrNull(values.extra_cost),
    current_value: toNumberOrNull(values.current_value),
    target_daily_cost: toNumberOrNull(values.target_daily_cost),
    include_in_net_worth: values.include_in_net_worth !== false,
    purchase_date: toDateString(values.purchase_date),
    start_use_date: toDateString(values.start_use_date),
    warranty_until: toDateString(values.warranty_until),
    expected_use_days: values.expected_use_days ?? null,
    location: toStringOrNull(values.location),
    serial_number: toStringOrNull(values.serial_number),
    tags: Array.isArray(values.tags) ? values.tags.map((item) => String(item).trim()).filter(Boolean) : [],
    images: imageLines,
    note: toStringOrNull(values.note),
  }
}

function PreviewValue({ label, value, emphasize = false }) {
  return (
    <div className={`asset-library-preview-item${emphasize ? ' is-emphasize' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export default function AssetForm({
  form,
  mode = 'create',
  onSubmit,
  submitting = false,
  onCancel,
  submitText,
}) {
  const watchedValues = Form.useWatch([], form)
  const preview = useMemo(() => computePreview(watchedValues), [watchedValues])

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark="optional"
      onFinish={(values) => onSubmit(buildAssetPayload(values), values)}
      className="asset-library-form"
    >
      <div className="asset-library-form-layout">
        <div className="asset-library-form-main">
          <Card className="asset-library-form-section" title="基础信息" bordered={false}>
            <div className="asset-library-form-grid asset-library-form-grid-3">
              <Form.Item label="资产名称" name="name" rules={[{ required: true, message: '请输入资产名称' }]} extra="必填，用于列表、榜单和搜索。">
                <Input placeholder="例如：MacBook Pro 14" />
              </Form.Item>
              <Form.Item label="资产类型" name="asset_type">
                <Select
                  allowClear
                  showSearch
                  options={ASSET_TYPE_OPTIONS}
                  placeholder="默认电子设备"
                  optionFilterProp="label"
                />
              </Form.Item>
              <Form.Item label="分类" name="category">
                <Input placeholder="例如：办公设备 / 家电" />
              </Form.Item>
              <Form.Item label="状态" name="status">
                <Select options={ASSET_STATUS_OPTIONS} placeholder="默认使用中" />
              </Form.Item>
              <Form.Item label="品牌" name="brand">
                <Input placeholder="例如：Apple" />
              </Form.Item>
              <Form.Item label="型号" name="model">
                <Input placeholder="例如：M3 Pro" />
              </Form.Item>
              <Form.Item label="购买渠道" name="purchase_channel">
                <Input placeholder="例如：Apple Store / 京东自营" />
              </Form.Item>
            </div>
          </Card>

          <Card className="asset-library-form-section" title="成本与价值" bordered={false}>
            <div className="asset-library-form-grid asset-library-form-grid-3">
              <Form.Item label="买入价格" name="purchase_price" rules={[{ required: true, message: '请输入买入价格' }]} extra="必填，单位为人民币。">
                <InputNumber min={0} precision={2} placeholder="0.00" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="额外成本" name="extra_cost">
                <InputNumber min={0} precision={2} placeholder="例如：维修 / 配件 / 运费" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="当前估值" name="current_value" extra="可先按你的主观残值录入，后续可在详情中持续补估值。">
                <InputNumber min={0} precision={2} placeholder="当前残值" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="目标日均成本" name="target_daily_cost">
                <InputNumber min={0} precision={2} placeholder="目标打平日均成本" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="计入净资产" name="include_in_net_worth" valuePropName="checked">
                <Switch checkedChildren="计入" unCheckedChildren="不计入" />
              </Form.Item>
            </div>
          </Card>

          <Card className="asset-library-form-section" title="日期与生命周期" bordered={false}>
            <div className="asset-library-form-grid asset-library-form-grid-4">
              <Form.Item label="购买日期" name="purchase_date">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="开始使用日期" name="start_use_date">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="保修到期" name="warranty_until">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="预计使用天数" name="expected_use_days">
                <InputNumber min={0} precision={0} placeholder="例如：365" style={{ width: '100%' }} />
              </Form.Item>
            </div>
          </Card>

          <Card className="asset-library-form-section" title="管理信息" bordered={false}>
            <div className="asset-library-form-grid asset-library-form-grid-2">
              <Form.Item label="存放位置" name="location">
                <Input placeholder="例如：书房 / 办公桌 / 仓库" />
              </Form.Item>
              <Form.Item label="序列号" name="serial_number">
                <Input placeholder="便于后续治理和追踪" />
              </Form.Item>
              <Form.Item label="标签" name="tags" extra="输入后回车，可快速录入多个标签。">
                <Select
                  mode="tags"
                  maxTagCount="responsive"
                  tokenSeparators={[',', '，']}
                  placeholder="输入后回车，可录入多个标签"
                />
              </Form.Item>
              <Form.Item label="图片链接" name="imagesText" extra="每行一个链接，适合贴发票图、实物图或二手挂售页。">
                <Input.TextArea rows={4} placeholder={'每行一个 URL\nhttps://example.com/asset-cover.jpg'} />
              </Form.Item>
            </div>
            <Form.Item label="备注" name="note">
              <Input.TextArea rows={4} placeholder="补充购买背景、使用状态、维护说明等" />
            </Form.Item>
          </Card>
        </div>

        <div className="asset-library-form-aside">
          <Card className="asset-library-preview-card" title="实时预估" bordered={false}>
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
              <PreviewValue label="总投入成本" value={formatMoney(preview.totalCost)} emphasize />
              <PreviewValue label="当前净消费成本" value={formatMoney(preview.netConsumptionCost)} emphasize />
              <PreviewValue label="残值率" value={formatPercent(preview.residualRate)} />
              <PreviewValue
                label="粗略使用天数"
                value={preview.useDays === null ? EMPTY_VALUE : `${formatNumber(preview.useDays)} 天`}
              />
              <PreviewValue label="粗略日均成本" value={formatMoney(preview.netDailyCost)} />
              <Typography.Text type="secondary" className="asset-library-preview-note">
                预估仅用于录入时快速校验口径，详情页会优先展示后端返回的正式 metrics。
              </Typography.Text>
            </Space>
          </Card>
        </div>
      </div>

      <Flex justify="space-between" align="center" wrap gap={12} className="asset-library-form-actions">
        <Typography.Text type="secondary">
          日期会按 `YYYY-MM-DD` 提交；非必填金额为空时会提交 `null`，不会发送 `NaN`。
        </Typography.Text>
        <Space>
          {mode === 'edit' && onCancel ? <Button onClick={onCancel}>取消</Button> : null}
          <Button type="primary" htmlType="submit" loading={submitting}>
            {submitText || (mode === 'edit' ? '保存修改' : '创建资产')}
          </Button>
        </Space>
      </Flex>
    </Form>
  )
}
