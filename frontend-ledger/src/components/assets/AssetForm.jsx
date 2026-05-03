import { useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import {
  Button,
  Card,
  Collapse,
  DatePicker,
  Flex,
  Form,
  Input,
  InputNumber,
  Progress,
  Select,
  Space,
  Switch,
  Typography,
} from 'antd'
import { ASSET_STATUS_OPTIONS, ASSET_TYPE_OPTIONS, formatMoney, formatPercent, shanghaiNow } from './assetConstants'

const DEFAULT_ASSET_TYPE = 'electronics'

function toDayjs(value) {
  if (!value) return null
  const nextValue = dayjs(value)
  return nextValue.isValid() ? nextValue : null
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
  const nextValue = dayjs(value)
  return nextValue.isValid() ? nextValue.format('YYYY-MM-DD') : null
}

function isSameDateValue(left, right) {
  if (!left && !right) return true
  if (!left || !right) return false
  const leftDate = dayjs(left)
  const rightDate = dayjs(right)
  if (!leftDate.isValid() || !rightDate.isValid()) return false
  return leftDate.isSame(rightDate, 'day')
}

function computePreview(values = {}) {
  const purchasePrice = toNumberOrNull(values.purchase_price) ?? 0
  const extraCost = toNumberOrNull(values.extra_cost) ?? 0
  const targetDailyCost = toNumberOrNull(values.target_daily_cost)
  const totalCost = purchasePrice + extraCost
  const effectiveStartUseDate = values.start_use_date || values.purchase_date

  let useDays = null
  let cashDailyCost = null
  if (effectiveStartUseDate) {
    const startDate = dayjs(effectiveStartUseDate)
    if (startDate.isValid()) {
      const diff = shanghaiNow().startOf('day').diff(startDate.startOf('day'), 'day')
      useDays = diff >= 0 ? diff + 1 : 0
      cashDailyCost = useDays > 0 ? totalCost / useDays : null
    }
  }

  let targetProgress = null
  if (targetDailyCost && targetDailyCost > 0 && useDays && useDays > 0 && totalCost > 0) {
    const requiredDays = Math.ceil(totalCost / targetDailyCost)
    targetProgress = requiredDays > 0 ? useDays / requiredDays : 1
  }

  return {
    totalCost,
    useDays,
    cashDailyCost,
    targetProgress,
  }
}

function hasAdvancedValues(values = {}) {
  return Boolean(
    (values.status && values.status !== 'in_use') ||
      (values.start_use_date && !isSameDateValue(values.start_use_date, values.purchase_date)) ||
      toNumberOrNull(values.extra_cost) !== null ||
      toNumberOrNull(values.target_daily_cost) !== null ||
      values.include_in_net_worth === false ||
      values.warranty_until ||
      (values.expected_use_days !== null && values.expected_use_days !== undefined && values.expected_use_days !== '') ||
      toStringOrNull(values.location) ||
      toStringOrNull(values.serial_number) ||
      toStringOrNull(values.imagesText) ||
      toStringOrNull(values.note)
  )
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
    sale_price: null,
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
    sale_price: toNumberOrNull(asset.sale_price),
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
    sale_price: toNumberOrNull(values.sale_price),
    target_daily_cost: toNumberOrNull(values.target_daily_cost),
    include_in_net_worth: values.include_in_net_worth !== false,
    purchase_date: toDateString(values.purchase_date),
    start_use_date: toDateString(values.start_use_date || values.purchase_date),
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
  const [advancedOpen, setAdvancedOpen] = useState([])
  const advancedInitializedRef = useRef(false)
  const hasAdvancedInfo = useMemo(() => hasAdvancedValues(watchedValues || {}), [watchedValues])
  const hasPurchasePrice = toNumberOrNull(watchedValues?.purchase_price) !== null
  const hasExtraCost = toNumberOrNull(watchedValues?.extra_cost) !== null
  const hasEffectiveStartUseDate = Boolean(watchedValues?.start_use_date || watchedValues?.purchase_date)

  useEffect(() => {
    if (advancedInitializedRef.current) return
    if (mode === 'edit' && hasAdvancedInfo) {
      setAdvancedOpen(['more'])
    }
    advancedInitializedRef.current = true
  }, [hasAdvancedInfo, mode])

  const advancedItems = [
    {
      key: 'more',
      label: (
        <div className="asset-library-collapse-header">
          <span>更多信息</span>
          <Typography.Text type="secondary">保修、位置、卖出复盘和备注等可后续补充</Typography.Text>
        </div>
      ),
      children: (
        <div className="asset-library-form-grid asset-library-form-grid-3">
          <Form.Item label="状态" name="status">
            <Select options={ASSET_STATUS_OPTIONS} placeholder="默认使用中" />
          </Form.Item>
          <Form.Item label="开始使用日期" name="start_use_date" extra="默认跟随购买日期，仅在晚于购买时修改">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="附加成本" name="extra_cost">
            <InputNumber min={0} precision={2} placeholder="维修、配件或运费" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="目标日均成本" name="target_daily_cost">
            <InputNumber min={0} precision={2} placeholder="可稍后补充" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="卖出价格" name="sale_price">
            <InputNumber min={0} precision={2} placeholder="仅卖出后填写" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="纳入长期资产统计" name="include_in_net_worth" valuePropName="checked">
            <Switch checkedChildren="纳入" unCheckedChildren="不纳入" />
          </Form.Item>
          <Form.Item label="保修到期日" name="warranty_until">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="预期使用天数" name="expected_use_days">
            <InputNumber min={0} precision={0} placeholder="可稍后补充" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="存放位置" name="location">
            <Input placeholder="例如：书房 / 办公桌 / 仓库" />
          </Form.Item>
          <Form.Item label="序列号" name="serial_number">
            <Input placeholder="便于后续查找和管理" />
          </Form.Item>
          <Form.Item label="图片链接" name="imagesText" className="asset-library-form-item-span-2">
            <Input.TextArea rows={3} placeholder={'每行一个链接\n例如：发票图、实物图或挂售页'} />
          </Form.Item>
          <Form.Item label="备注" name="note" className="asset-library-form-item-span-3">
            <Input.TextArea rows={4} placeholder="补充购买背景、使用状态、维护说明等" />
          </Form.Item>
        </div>
      ),
    },
  ]

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
      onFinish={(values) => onSubmit(buildAssetPayload(values), values)}
      className="asset-library-form"
    >
      <div className="asset-library-form-layout">
        <div className="asset-library-form-main">
          <Card className="asset-library-form-section" bordered={false}>
            <Flex justify="space-between" align="center" wrap gap={12} className="asset-library-form-section-header">
              <div>
                <Typography.Title level={4} className="asset-library-section-title">
                  快速录入
                </Typography.Title>
                <Typography.Text type="secondary">先填写高频字段，开始使用日期默认等于购买日期，其他信息可后续补充。</Typography.Text>
              </div>
            </Flex>

            <div className="asset-library-form-grid asset-library-form-grid-3 asset-library-form-grid-compact">
              <Form.Item label="资产名称" name="name" rules={[{ required: true, message: '请输入资产名称' }]} extra="必填">
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
              <Form.Item label="分类" name="category" extra="可稍后补充">
                <Input placeholder="例如：办公设备 / 家电" />
              </Form.Item>
              <Form.Item label="品牌" name="brand" extra="可稍后补充">
                <Input placeholder="例如：Apple" />
              </Form.Item>
              <Form.Item label="型号" name="model" extra="可稍后补充">
                <Input placeholder="例如：MacBook Pro 14 / M3 Pro" />
              </Form.Item>
              <Form.Item label="购买渠道" name="purchase_channel" extra="可稍后补充">
                <Input placeholder="例如：Apple Store / 京东自营" />
              </Form.Item>
              <Form.Item
                label="买入成本"
                name="purchase_price"
                rules={[{ required: true, message: '请输入买入成本' }]}
                extra="建议填写，用于计算成本"
              >
                <InputNumber min={0} precision={2} placeholder="0.00" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="购买日期" name="purchase_date" extra="开始使用默认跟随此日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="标签" name="tags" extra="输入后回车，可录入多个标签" className="asset-library-form-item-span-3">
                <Select
                  mode="tags"
                  maxTagCount="responsive"
                  tokenSeparators={[',', '，']}
                  placeholder="输入后回车，可录入多个标签"
                />
              </Form.Item>
            </div>
          </Card>

          <Collapse
            items={advancedItems}
            activeKey={advancedOpen}
            onChange={(keys) => setAdvancedOpen(Array.isArray(keys) ? keys : [keys])}
            className="asset-library-form-collapse"
            ghost
          />
        </div>

        <div className="asset-library-form-aside">
          <Card className="asset-library-preview-card" title="实时预估" bordered={false}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <div className="asset-library-preview-grid">
                <PreviewValue
                  label="累计投入成本"
                  value={hasPurchasePrice || hasExtraCost ? formatMoney(preview.totalCost) : '填写买入成本后显示'}
                  emphasize
                />
                <PreviewValue
                  label="附加成本占比"
                  value={preview.totalCost > 0 && (toNumberOrNull(watchedValues?.extra_cost) ?? 0) > 0 ? formatPercent((toNumberOrNull(watchedValues?.extra_cost) ?? 0) / preview.totalCost) : '填写附加成本后显示'}
                />
                <PreviewValue
                  label="粗略现金日均成本"
                  value={hasPurchasePrice && hasEffectiveStartUseDate ? formatMoney(preview.cashDailyCost) : '填写买入成本和购买日期后显示'}
                />
              </div>

              {preview.targetProgress !== null ? (
                <div className="asset-library-preview-residual">
                  <Flex justify="space-between" align="center" gap={12}>
                    <Typography.Text type="secondary">目标进度</Typography.Text>
                    <Typography.Text>{formatPercent(preview.targetProgress)}</Typography.Text>
                  </Flex>
                  <Progress percent={Math.max(0, Math.min(100, Number((preview.targetProgress * 100).toFixed(1))))} showInfo={false} strokeColor="#1f7ae0" />
                </div>
              ) : null}

              {!hasPurchasePrice || !hasEffectiveStartUseDate ? (
                <Typography.Text type="secondary" className="asset-library-preview-note">
                  填写买入成本和购买日期后显示日均成本。
                </Typography.Text>
              ) : (
                <Typography.Text type="secondary" className="asset-library-preview-note">
                  创建后可继续记录附加成本、闲置、卖出和备注。
                </Typography.Text>
              )}
            </Space>
          </Card>
        </div>
      </div>

      <Flex justify="space-between" align="center" wrap gap={12} className="asset-library-form-actions">
        <Typography.Text type="secondary">创建后可继续补充事件、保修、卖出复盘和备注。</Typography.Text>
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
