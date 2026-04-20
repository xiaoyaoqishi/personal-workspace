import { Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Switch } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import {
  CURRENCY_OPTIONS,
  DIRECTION_OPTIONS,
  RECURRING_FREQUENCY_OPTIONS,
  RECURRING_RULE_TYPE_OPTIONS,
  TRANSACTION_TYPE_OPTIONS,
  WEEKDAY_OPTIONS,
} from '../utils/enums'
import { inferDirectionByTransactionType } from '../utils/ledger'

export default function RecurringRuleFormModal({ open, mode, initialValues, accounts, categories, onCancel, onSubmit }) {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const frequency = Form.useWatch('frequency', form)
  const txType = Form.useWatch('transaction_type', form)

  const categoryOptions = useMemo(() => {
    if (txType === 'income') {
      return (categories || []).filter((x) => x.category_type === 'income' || x.category_type === 'both')
    }
    if (txType === 'expense' || txType === 'fee' || txType === 'repayment') {
      return (categories || []).filter((x) => x.category_type === 'expense' || x.category_type === 'both')
    }
    return categories || []
  }, [categories, txType])

  useEffect(() => {
    if (!open) return
    const defaults = {
      name: '',
      is_active: true,
      rule_type: 'subscription',
      frequency: 'monthly',
      interval_count: 1,
      day_of_month: dayjs().date(),
      weekday: dayjs().day() === 0 ? 6 : dayjs().day() - 1,
      start_date: dayjs(),
      end_date: null,
      expected_amount: null,
      amount_tolerance: null,
      currency: 'CNY',
      account_id: undefined,
      counterparty_account_id: undefined,
      category_id: undefined,
      transaction_type: 'expense',
      direction: 'expense',
      merchant: '',
      description: '',
      note: '',
      source_hint: '',
    }

    const merged = {
      ...defaults,
      ...initialValues,
      start_date: initialValues?.start_date ? dayjs(initialValues.start_date) : defaults.start_date,
      end_date: initialValues?.end_date ? dayjs(initialValues.end_date) : null,
    }
    form.setFieldsValue(merged)
  }, [open, initialValues, form])

  useEffect(() => {
    if (!open || !txType) return
    if (txType === 'transfer') {
      form.setFieldValue('direction', 'neutral')
      return
    }
    if (txType === 'refund') {
      form.setFieldValue('direction', 'income')
      return
    }
    const inferred = inferDirectionByTransactionType(txType)
    if (inferred) {
      form.setFieldValue('direction', inferred)
    }
  }, [txType, open, form])

  const submit = async () => {
    try {
      const values = await form.validateFields()
      const payload = {
        ...values,
        start_date: values.start_date?.format('YYYY-MM-DD'),
        end_date: values.end_date ? values.end_date.format('YYYY-MM-DD') : null,
        account_id: Number(values.account_id),
        counterparty_account_id: values.counterparty_account_id ? Number(values.counterparty_account_id) : null,
        category_id: values.category_id ? Number(values.category_id) : null,
        merchant: values.merchant?.trim() || null,
        description: values.description?.trim() || null,
        note: values.note?.trim() || null,
        source_hint: values.source_hint?.trim() || null,
      }
      if (payload.frequency !== 'monthly' && payload.frequency !== 'yearly') {
        payload.day_of_month = null
      }
      if (payload.frequency !== 'weekly') {
        payload.weekday = null
      }
      setSubmitting(true)
      await onSubmit(payload)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={mode === 'edit' ? '编辑周期规则' : '新增周期规则'}
      open={open}
      onCancel={onCancel}
      width={920}
      footer={null}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Space size={12} style={{ width: '100%' }} align="start">
          <Form.Item name="name" label="规则名称" rules={[{ required: true, message: '请输入规则名称' }]} style={{ width: '100%' }}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="is_active" label="启用" valuePropName="checked" style={{ width: 140 }}>
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Space>

        <Space size={12} style={{ width: '100%' }} align="start">
          <Form.Item name="rule_type" label="规则类型" rules={[{ required: true }]} style={{ width: '100%' }}>
            <Select options={RECURRING_RULE_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="frequency" label="周期" rules={[{ required: true }]} style={{ width: '100%' }}>
            <Select options={RECURRING_FREQUENCY_OPTIONS} />
          </Form.Item>
          <Form.Item name="interval_count" label="间隔" rules={[{ required: true }]} style={{ width: 140 }}>
            <InputNumber min={1} max={36} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </Space>

        <Space size={12} style={{ width: '100%' }} align="start">
          <Form.Item name="start_date" label="开始日期" rules={[{ required: true, message: '请选择开始日期' }]} style={{ width: '100%' }}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="end_date" label="结束日期" style={{ width: '100%' }}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          {(frequency === 'monthly' || frequency === 'yearly') ? (
            <Form.Item
              name="day_of_month"
              label={frequency === 'yearly' ? '每年日期（月份取开始日期）' : '每月几号'}
              rules={[{ required: true, message: '请输入日期' }]}
              style={{ width: 220 }}
            >
              <InputNumber min={1} max={31} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          ) : null}
          {frequency === 'weekly' ? (
            <Form.Item name="weekday" label="每周" rules={[{ required: true, message: '请选择星期' }]} style={{ width: 220 }}>
              <Select options={WEEKDAY_OPTIONS} />
            </Form.Item>
          ) : null}
        </Space>

        <Space size={12} style={{ width: '100%' }} align="start">
          <Form.Item name="transaction_type" label="流水类型" rules={[{ required: true }]} style={{ width: '100%' }}>
            <Select options={TRANSACTION_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="direction" label="方向" rules={[{ required: true }]} style={{ width: '100%' }}>
            <Select options={DIRECTION_OPTIONS} disabled={txType === 'transfer' || txType === 'refund'} />
          </Form.Item>
          <Form.Item name="currency" label="币种" rules={[{ required: true }]} style={{ width: '100%' }}>
            <Select options={CURRENCY_OPTIONS} />
          </Form.Item>
        </Space>

        <Space size={12} style={{ width: '100%' }} align="start">
          <Form.Item name="account_id" label="账户" rules={[{ required: true, message: '请选择账户' }]} style={{ width: '100%' }}>
            <Select showSearch optionFilterProp="label" options={(accounts || []).map((x) => ({ label: x.name, value: x.id }))} />
          </Form.Item>
          <Form.Item name="counterparty_account_id" label="对方账户" style={{ width: '100%' }}>
            <Select allowClear showSearch optionFilterProp="label" options={(accounts || []).map((x) => ({ label: x.name, value: x.id }))} />
          </Form.Item>
          <Form.Item name="category_id" label="分类" style={{ width: '100%' }}>
            <Select allowClear options={categoryOptions.map((x) => ({ label: x.name, value: x.id }))} />
          </Form.Item>
        </Space>

        <Space size={12} style={{ width: '100%' }} align="start">
          <Form.Item
            name="expected_amount"
            label="预计金额"
            rules={[{ type: 'number', min: 0.01, message: '预计金额必须大于 0' }]}
            style={{ width: '100%' }}
          >
            <InputNumber min={0.01} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="amount_tolerance" label="金额容差" style={{ width: '100%' }}>
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="merchant" label="商户" style={{ width: '100%' }}>
            <Input maxLength={200} />
          </Form.Item>
        </Space>

        <Form.Item name="description" label="描述">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="note" label="备注">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="source_hint" label="来源提示">
          <Input maxLength={30} placeholder="manual / detect" />
        </Form.Item>

        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" loading={submitting} onClick={submit}>
            保存
          </Button>
        </Space>
      </Form>
    </Modal>
  )
}
