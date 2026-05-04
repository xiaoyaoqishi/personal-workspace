import { Button, Cascader, Form, Input, InputNumber, Select, Space, Steps, Switch, Typography } from 'antd'
import { useState } from 'react'
import { dryRunRule } from '../../api/ledger'
import RuleDryRunDrawer from './RuleDryRunDrawer'

const { Text } = Typography

const RULE_TYPE_CARDS = [
  { value: 'source', label: '来源识别', desc: '根据关键词识别交易来源渠道（微信/支付宝/美团等）' },
  { value: 'merchant', label: '商户归一', desc: '把不同写法的商户名统一为标准名称' },
  { value: 'category', label: '分类规则', desc: '根据文本、来源、金额自动归入指定分类' },
  { value: 'combo', label: '商户+分类组合', desc: '同时设置商户归一与分类（一条规则两个效果）' },
]

const MATCH_MODE_OPTIONS = [
  { label: '包含', value: 'contains' },
  { label: '前缀匹配', value: 'prefix' },
  { label: '完全匹配', value: 'exact' },
  { label: '正则', value: 'regex' },
]

const SOURCE_CHANNEL_OPTIONS = [
  { label: '不限', value: '' },
  { label: '微信', value: 'wechat' },
  { label: '支付宝', value: 'alipay' },
  { label: '京东', value: 'jd' },
  { label: '美团', value: 'meituan' },
  { label: '拼多多', value: 'pinduoduo' },
  { label: '银行卡', value: 'bank' },
]

const DIRECTION_OPTIONS = [
  { label: '不限', value: '' },
  { label: '支出', value: 'expense' },
  { label: '收入', value: 'income' },
]

const TXN_KIND_OPTIONS = [
  { label: '不限', value: '' },
  { label: '支出', value: 'expense' },
  { label: '收入', value: 'income' },
  { label: '转账', value: 'transfer' },
]

function buildCascaderOptions(categories) {
  const roots = (categories || []).filter((c) => !c.parent_id)
  return roots.map((root) => ({
    value: root.id,
    label: root.name,
    children: (root.children || []).map((child) => ({
      value: child.id,
      label: child.name,
    })),
  }))
}

function Step1TypeSelect({ value, onChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {RULE_TYPE_CARDS.map((card) => (
        <div
          key={card.value}
          onClick={() => onChange(card.value)}
          style={{
            padding: '16px',
            border: `2px solid ${value === card.value ? 'var(--lk-primary, #1677ff)' : 'var(--lk-border, #d9d9d9)'}`,
            borderRadius: 8,
            cursor: 'pointer',
            background: value === card.value ? 'var(--lk-primary-bg, #e6f4ff)' : 'transparent',
            transition: 'all 0.2s',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{card.label}</div>
          <div style={{ color: 'var(--lk-text-secondary, #666)', fontSize: 13 }}>{card.desc}</div>
        </div>
      ))}
    </div>
  )
}

function Step2ConditionTarget({ form, ruleType, categories }) {
  const catOptions = buildCascaderOptions(categories)
  const showMerchant = ruleType === 'merchant' || ruleType === 'combo'
  const showCategory = ruleType === 'category' || ruleType === 'combo'
  const showPlatform = ruleType === 'source'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0 16px' }}>
      <Form.Item label="匹配方式" name="match_mode" rules={[{ required: true }]}
        help={<Text type="secondary" style={{ fontSize: 12 }}>包含适合关键词；前缀适合固定开头；正则适合复杂模式</Text>}>
        <Select options={MATCH_MODE_OPTIONS} />
      </Form.Item>
      <Form.Item label="匹配文本" name="pattern" rules={[{ required: true, message: '请输入匹配文本' }]}
        help={<Text type="secondary" style={{ fontSize: 12 }}>先用短关键词验证，再逐步加长</Text>}>
        <Input placeholder="输入要匹配的关键词" />
      </Form.Item>

      <Form.Item label="来源渠道条件" name="source_channel_condition"
        help={<Text type="secondary" style={{ fontSize: 12 }}>留空表示不限渠道</Text>}>
        <Select options={SOURCE_CHANNEL_OPTIONS} placeholder="不限" allowClear />
      </Form.Item>
      <Form.Item label="方向条件" name="direction_condition"
        help={<Text type="secondary" style={{ fontSize: 12 }}>收入 / 支出 / 不限</Text>}>
        <Select options={DIRECTION_OPTIONS} placeholder="不限" allowClear />
      </Form.Item>

      <Form.Item label="金额下限" name="amount_min"
        help={<Text type="secondary" style={{ fontSize: 12 }}>可用于屏蔽小额噪声</Text>}>
        <InputNumber style={{ width: '100%' }} min={0} placeholder="不限" />
      </Form.Item>
      <Form.Item label="金额上限" name="amount_max"
        help={<Text type="secondary" style={{ fontSize: 12 }}>与金额下限组合形成区间</Text>}>
        <InputNumber style={{ width: '100%' }} min={0} placeholder="不限" />
      </Form.Item>

      {showPlatform && (
        <Form.Item label="目标平台" name="target_platform" style={{ gridColumn: 'span 2' }}
          help={<Text type="secondary" style={{ fontSize: 12 }}>命中后回填的来源平台</Text>}>
          <Select options={SOURCE_CHANNEL_OPTIONS} placeholder="选择平台" allowClear />
        </Form.Item>
      )}
      {showPlatform && (
        <Form.Item label="目标交易类型" name="target_txn_kind"
          help={<Text type="secondary" style={{ fontSize: 12 }}>命中后设置的交易类型</Text>}>
          <Select options={TXN_KIND_OPTIONS} placeholder="不限" allowClear />
        </Form.Item>
      )}
      {showPlatform && (
        <Form.Item label="目标场景" name="target_scene"
          help={<Text type="secondary" style={{ fontSize: 12 }}>命中后设置的消费场景（如餐饮、购物）</Text>}>
          <Input placeholder="例如：餐饮" />
        </Form.Item>
      )}

      {showMerchant && (
        <Form.Item label="目标商户名" name="target_merchant" style={{ gridColumn: 'span 2' }}
          help={<Text type="secondary" style={{ fontSize: 12 }}>命中后统一成的标准商户名</Text>}>
          <Input placeholder="规范商户名" />
        </Form.Item>
      )}

      {showCategory && (
        <Form.Item label="目标分类" name="category_path" style={{ gridColumn: 'span 2' }}
          help={<Text type="secondary" style={{ fontSize: 12 }}>命中后归入的分类（可只选一级）</Text>}>
          <Cascader options={catOptions} changeOnSelect placeholder="选择分类" allowClear style={{ width: '100%' }} />
        </Form.Item>
      )}
    </div>
  )
}

function Step3PriorityPreview({ form, categories }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [dryRunParams, setDryRunParams] = useState(null)

  const runPreview = () => {
    const vals = form.getFieldsValue()
    const catPath = vals.category_path || []
    setDryRunParams({
      rule_type: vals.rule_type || 'category',
      match_mode: vals.match_mode || 'contains',
      pattern: vals.pattern || '',
      source_channel_condition: vals.source_channel_condition || null,
      platform_condition: vals.platform_condition || null,
      direction_condition: vals.direction_condition || null,
      amount_min: vals.amount_min || null,
      amount_max: vals.amount_max || null,
      target_category_id: catPath[0] ?? null,
      target_subcategory_id: catPath[1] ?? null,
    })
    setDrawerOpen(true)
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Form.Item label="优先级" name="priority" rules={[{ required: true }]}
          help={<Text type="secondary" style={{ fontSize: 12 }}>数字越小越先匹配，建议通用规则用 100，强约束用 1-50</Text>}>
          <InputNumber style={{ width: '100%' }} min={0} max={9999} />
        </Form.Item>
        <Form.Item label="置信度" name="confidence_score"
          help={<Text type="secondary" style={{ fontSize: 12 }}>规则结果可信度，范围 0-1，建议填 0.7-0.95</Text>}>
          <InputNumber style={{ width: '100%' }} min={0} max={1} step={0.01} />
        </Form.Item>
        <Form.Item label="启用" name="enabled" valuePropName="checked"
          help={<Text type="secondary" style={{ fontSize: 12 }}>关闭后规则保留但不生效</Text>}>
          <Switch />
        </Form.Item>
      </div>
      <Form.Item label="备注说明" name="explain_text"
        help={<Text type="secondary" style={{ fontSize: 12 }}>建议写"规则目的 + 适用范围"</Text>}>
        <Input.TextArea rows={2} placeholder="例如：命中京东支付，识别京东体系" />
      </Form.Item>

      <div style={{ borderTop: '1px solid var(--lk-border, #e8e8e8)', paddingTop: 12, marginTop: 4 }}>
        <Button onClick={runPreview}>试跑预览（查看命中样本）</Button>
      </div>

      <RuleDryRunDrawer open={drawerOpen} ruleParams={dryRunParams} onClose={() => setDrawerOpen(false)} />
    </>
  )
}

const STEPS = ['选择规则类型', '填写条件与目标', '优先级 & 预览']

export default function RuleWizard({ open, initialValues, categories, onOk, onCancel, confirmLoading }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [ruleType, setRuleType] = useState('category')
  const [form] = Form.useForm()

  // 当 open 变化时初始化
  const handleOpen = () => {
    const defaults = {
      rule_type: 'category',
      priority: 100,
      enabled: true,
      match_mode: 'contains',
      confidence_score: 0.7,
    }
    if (initialValues) {
      const catPath = initialValues.target_subcategory_id
        ? [initialValues.target_category_id, initialValues.target_subcategory_id]
        : initialValues.target_category_id
        ? [initialValues.target_category_id]
        : undefined
      form.setFieldsValue({ ...defaults, ...initialValues, category_path: catPath })
      setRuleType(initialValues.rule_type || 'category')
    } else {
      form.setFieldsValue(defaults)
      setRuleType('category')
    }
    setCurrentStep(0)
  }

  const handleNext = async () => {
    if (currentStep === 1) {
      await form.validateFields(['match_mode', 'pattern'])
    }
    setCurrentStep((s) => s + 1)
  }

  const handleSubmit = async () => {
    const vals = await form.validateFields()
    const catPath = vals.category_path || []
    const payload = {
      ...vals,
      rule_type: vals.rule_type === 'combo' ? 'category' : vals.rule_type,
      target_category_id: catPath[0] ?? null,
      target_subcategory_id: catPath[1] ?? null,
      source_channel_condition: vals.source_channel_condition || null,
      direction_condition: vals.direction_condition || null,
      platform_condition: vals.platform_condition || null,
    }
    delete payload.category_path
    onOk(payload)
  }

  if (!open) return null

  // 使用 useEffect 监听 open 变化
  // 这里用一个 key 来触发重置

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: 'var(--lk-color-surface)',
          borderRadius: 12,
          width: 720,
          maxHeight: '90vh',
          overflow: 'auto',
          padding: 32,
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 20 }}>
          {initialValues?.id ? `编辑规则 #${initialValues.id}` : '新建规则'}
        </div>
        <Steps current={currentStep} items={STEPS.map((t) => ({ title: t }))} style={{ marginBottom: 24 }} />

        <Form
          form={form}
          layout="vertical"
          onValuesChange={(changed) => {
            if (changed.rule_type) setRuleType(changed.rule_type)
          }}
        >
          <Form.Item name="rule_type" hidden>
            <Input />
          </Form.Item>

          {currentStep === 0 && (
            <Step1TypeSelect
              value={ruleType}
              onChange={(v) => { setRuleType(v); form.setFieldValue('rule_type', v) }}
            />
          )}
          {currentStep === 1 && (
            <Step2ConditionTarget form={form} ruleType={ruleType} categories={categories} />
          )}
          {currentStep === 2 && (
            <Step3PriorityPreview form={form} categories={categories} />
          )}
        </Form>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
          <Space>
            <Button onClick={onCancel}>取消</Button>
            {currentStep > 0 && <Button onClick={() => setCurrentStep((s) => s - 1)}>上一步</Button>}
          </Space>
          <Space>
            {currentStep < 2 ? (
              <Button type="primary" onClick={handleNext}>下一步</Button>
            ) : (
              <Button type="primary" onClick={handleSubmit} loading={confirmLoading}>
                {initialValues?.id ? '保存' : '创建'}
              </Button>
            )}
          </Space>
        </div>
      </div>
    </div>
  )
}
