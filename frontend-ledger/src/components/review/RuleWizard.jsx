import { Alert, Button, Card, Cascader, Input, InputNumber, Modal, Segmented, Select, Space, Steps, Tag } from 'antd'
import { useState } from 'react'

const RULE_KIND_OPTIONS = [
  { label: '商户归一', value: 'merchant', desc: '将关键词命中的记录归一到指定商户名' },
  { label: '分类规则', value: 'category', desc: '将命中记录归入指定分类' },
  { label: '商户+分类', value: 'merchant_and_category', desc: '同时设置商户和分类' },
  { label: '来源/平台', value: 'source', desc: '标记来源渠道或支付平台' },
]

const SOURCE_OPTIONS = [
  { label: '微信', value: 'wechat' },
  { label: '支付宝', value: 'alipay' },
  { label: '美团', value: 'meituan' },
  { label: '京东', value: 'jd' },
  { label: '拼多多', value: 'pinduoduo' },
  { label: '银行卡', value: 'bank_card' },
  { label: '其他', value: 'other' },
]

/**
 * RuleWizard — 3 步规则创建向导
 * Props:
 *   open                  {boolean}
 *   onClose               {Function}
 *   batchId               {string}
 *   batchCommitted        {boolean}
 *   categories            {Array}
 *   targetRowIds          {Array<number>}
 *   defaults              {object}  { matchText, merchantName, categoryName, sourceChannel, platform }
 *   onPreview             {Function(payload) => Promise<previewResult>}
 *   onCreate              {Function(payload) => Promise<result>}
 */
export default function RuleWizard({ open, onClose, batchId, batchCommitted, categories = [], targetRowIds = [], defaults = {}, onPreview, onCreate }) {
  const [step, setStep] = useState(0)
  const [ruleKind, setRuleKind] = useState('merchant')
  const [ruleScope, setRuleScope] = useState('profile')
  const [reprocessScope, setReprocessScope] = useState('unconfirmed')
  const [priority, setPriority] = useState(40)
  const [matchText, setMatchText] = useState(defaults.matchText || '')
  const [merchantName, setMerchantName] = useState(defaults.merchantName || '')
  const [categoryPath, setCategoryPath] = useState([])  // [categoryName, subcategoryName?]
  const [sourceChannel, setSourceChannel] = useState(defaults.sourceChannel || null)
  const [platform, setPlatform] = useState(defaults.platform || null)
  const [previewResult, setPreviewResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // 每次打开时重置
  const handleOpen = () => {
    setStep(0)
    setRuleKind('merchant')
    setRuleScope('profile')
    setReprocessScope('unconfirmed')
    setPriority(40)
    setMatchText(defaults.matchText || '')
    setMerchantName(defaults.merchantName || '')
    setCategoryPath(defaults.categoryName ? [defaults.categoryName] : [])
    setSourceChannel(defaults.sourceChannel || null)
    setPlatform(defaults.platform || null)
    setPreviewResult(null)
  }

  const cascaderOptions = (categories || []).map((cat) => ({
    value: cat.name,
    label: cat.name,
    children: (cat.children || []).map((sub) => ({ value: sub.name, label: sub.name })),
  }))

  const buildPayload = (previewOnly) => ({
    row_ids: targetRowIds,
    rule_kind: ruleKind,
    match_text: matchText,
    target_merchant_name: (ruleKind === 'merchant' || ruleKind === 'merchant_and_category') ? (merchantName || null) : null,
    target_category_name: (ruleKind === 'category' || ruleKind === 'merchant_and_category') ? (categoryPath[0] || null) : null,
    target_subcategory_name: (ruleKind === 'category' || ruleKind === 'merchant_and_category') ? (categoryPath[1] || null) : null,
    target_source_channel: ruleKind === 'source' ? (sourceChannel || null) : null,
    target_platform: ruleKind === 'source' ? (platform || null) : null,
    priority: Number(priority || 40),
    apply_scope: ruleScope,
    preview_only: previewOnly,
    reprocess_after_create: true,
    reprocess_scope: reprocessScope,
  })

  const handlePreview = async () => {
    setSubmitting(true)
    try {
      const result = await onPreview(buildPayload(true))
      setPreviewResult(result)
      setStep(2)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreate = async () => {
    setSubmitting(true)
    try {
      await onCreate(buildPayload(false))
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  const stepItems = [
    { title: '规则类型', description: '选择规则用途' },
    { title: '填写条件', description: '关键词与目标' },
    { title: '预览确认', description: '命中范围 + 创建' },
  ]

  return (
    <Modal
      title="建立识别规则"
      open={open}
      onCancel={onClose}
      afterOpenChange={(visible) => { if (visible) handleOpen() }}
      width={800}
      footer={null}
      destroyOnHide
    >
      <Steps current={step} items={stepItems} size="small" style={{ marginBottom: 24 }} />

      {/* Step 0：规则类型 */}
      {step === 0 && (
        <Space direction="vertical" style={{ width: '100%' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {RULE_KIND_OPTIONS.map(({ label, value, desc }) => (
              <Card
                key={value}
                size="small"
                onClick={() => setRuleKind(value)}
                style={{
                  cursor: 'pointer',
                  border: ruleKind === value ? '2px solid var(--lk-color-primary)' : '1px solid var(--lk-color-border)',
                  borderRadius: 'var(--lk-radius-sm)',
                }}
              >
                <div style={{ fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 12, color: 'var(--lk-color-text-muted)', marginTop: 4 }}>{desc}</div>
              </Card>
            ))}
          </div>
          <Space style={{ marginTop: 8 }}>
            <Tag color="blue" style={{ fontVariantNumeric: 'tabular-nums' }}>样本 {targetRowIds.length} 条</Tag>
          </Space>
          <div style={{ textAlign: 'right', marginTop: 16 }}>
            <Button type="primary" onClick={() => setStep(1)}>下一步</Button>
          </div>
        </Space>
      )}

      {/* Step 1：填写关键词与目标 */}
      {step === 1 && (
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Input
            value={matchText}
            onChange={(e) => setMatchText(e.target.value)}
            addonBefore="匹配关键词"
            placeholder="自动提取，可修改"
          />
          {(ruleKind === 'merchant' || ruleKind === 'merchant_and_category') && (
            <Input
              value={merchantName}
              onChange={(e) => setMerchantName(e.target.value)}
              addonBefore="目标商户"
              placeholder="归一后的商户名"
            />
          )}
          {(ruleKind === 'category' || ruleKind === 'merchant_and_category') && (
            <div>
              <div style={{ marginBottom: 4, fontSize: 13, color: 'var(--lk-color-text-secondary)' }}>目标分类</div>
              <Cascader
                options={cascaderOptions}
                value={categoryPath}
                onChange={setCategoryPath}
                placeholder="选择分类（可选子分类）"
                style={{ width: '100%' }}
                showSearch
              />
            </div>
          )}
          {ruleKind === 'source' && (
            <Space wrap style={{ width: '100%' }}>
              <Select
                style={{ minWidth: 200 }}
                placeholder="来源渠道"
                value={sourceChannel}
                options={SOURCE_OPTIONS}
                onChange={setSourceChannel}
                allowClear
              />
              <Select
                style={{ minWidth: 200 }}
                placeholder="平台"
                value={platform}
                options={SOURCE_OPTIONS}
                onChange={setPlatform}
                allowClear
              />
            </Space>
          )}
          <Alert type="info" showIcon message="先预览命中范围，确认无误再创建。" />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <Button onClick={() => setStep(0)}>上一步</Button>
            <Button type="primary" onClick={handlePreview} loading={submitting} disabled={batchCommitted || !matchText}>
              预览命中范围
            </Button>
          </div>
        </Space>
      )}

      {/* Step 2：预览确认 + 创建参数 */}
      {step === 2 && (
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          {previewResult && (
            <Card size="small" title="预览结果">
              <Tag color="blue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                预计命中 {Number(previewResult?.estimated_hit_rows || 0)} 条
              </Tag>
              <Space direction="vertical" style={{ width: '100%', marginTop: 8 }}>
                {(previewResult?.preview || []).map((item, idx) => (
                  <div key={`${item.row_id}-${idx}`} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                      {item.pattern}
                    </span>
                    <Space size={4}>
                      <Tag style={{ fontSize: 11 }}>影响 {item.expected_hit_rows} 条</Tag>
                      {item.skipped_existing ? <Tag color="warning" style={{ fontSize: 11 }}>已有规则</Tag> : <Tag color="success" style={{ fontSize: 11 }}>可创建</Tag>}
                    </Space>
                  </div>
                ))}
              </Space>
            </Card>
          )}
          <Space wrap>
            <Segmented
              value={ruleScope}
              onChange={setRuleScope}
              options={[
                { label: '当前来源范围', value: 'profile' },
                { label: '全局生效', value: 'global' },
              ]}
              size="small"
            />
            <Segmented
              value={reprocessScope}
              onChange={setReprocessScope}
              options={[
                { label: '重识别未确认', value: 'unconfirmed' },
                { label: '重识别全部', value: 'all' },
              ]}
              size="small"
            />
            <InputNumber
              min={0}
              max={9999}
              value={priority}
              onChange={(v) => setPriority(Number(v ?? 40))}
              addonBefore="优先级"
              style={{ width: 120 }}
            />
          </Space>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <Button onClick={() => setStep(1)}>上一步</Button>
            <Space>
              <Button onClick={() => setStep(1)}>重新预览</Button>
              <Button type="primary" onClick={handleCreate} loading={submitting} disabled={batchCommitted}>
                创建并应用
              </Button>
            </Space>
          </div>
        </Space>
      )}
    </Modal>
  )
}
