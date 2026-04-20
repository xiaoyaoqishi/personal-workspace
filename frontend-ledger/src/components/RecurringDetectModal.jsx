import { Button, Form, InputNumber, Modal, Select, Space, Table } from 'antd'
import { DIRECTION_OPTIONS, TRANSACTION_TYPE_OPTIONS, WEEKDAY_OPTIONS } from '../utils/enums'
import { recurringFrequencyLabel } from '../utils/ledger'

export default function RecurringDetectModal({
  open,
  loading,
  submitting,
  candidates,
  accounts,
  onCancel,
  onDetect,
  onConvertCandidate,
}) {
  const [form] = Form.useForm()

  return (
    <Modal
      title="识别疑似周期账单"
      open={open}
      onCancel={onCancel}
      width={980}
      footer={null}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="inline"
        initialValues={{ lookback_days: 180, min_occurrences: 3 }}
        onFinish={(values) => onDetect?.(values)}
        style={{ marginBottom: 12 }}
      >
        <Form.Item name="lookback_days" label="回看天数">
          <InputNumber min={30} max={730} precision={0} />
        </Form.Item>
        <Form.Item name="min_occurrences" label="最少次数">
          <InputNumber min={2} max={20} precision={0} />
        </Form.Item>
        <Form.Item name="account_id" label="账户">
          <Select allowClear style={{ width: 170 }} options={(accounts || []).map((x) => ({ label: x.name, value: x.id }))} />
        </Form.Item>
        <Form.Item name="direction" label="方向">
          <Select allowClear style={{ width: 130 }} options={DIRECTION_OPTIONS} />
        </Form.Item>
        <Form.Item name="transaction_type" label="类型">
          <Select allowClear style={{ width: 140 }} options={TRANSACTION_TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            开始识别
          </Button>
        </Form.Item>
      </Form>

      <Table
        rowKey={(row) => `${row.merchant}-${row.amount}-${row.account_id}-${row.transaction_type}-${row.direction}`}
        loading={loading}
        size="small"
        dataSource={candidates || []}
        pagination={{ pageSize: 8, showSizeChanger: false }}
        columns={[
          { title: '商户', dataIndex: 'merchant', width: 180 },
          { title: '金额', dataIndex: 'amount', width: 100 },
          { title: '频率', dataIndex: 'estimated_frequency', width: 100, render: (value) => recurringFrequencyLabel(value) },
          { title: '出现次数', dataIndex: 'occurrences', width: 90 },
          { title: '最近出现', dataIndex: 'last_seen_at', width: 170, render: (value) => `${value}`.slice(0, 19).replace('T', ' ') },
          { title: '建议每月日', dataIndex: 'suggested_day_of_month', width: 90, render: (value) => value || '-' },
          {
            title: '建议星期',
            dataIndex: 'suggested_weekday',
            width: 100,
            render: (value) => (value === null || value === undefined ? '-' : WEEKDAY_OPTIONS.find((x) => x.value === value)?.label || value),
          },
          {
            title: '操作',
            key: 'op',
            width: 130,
            render: (_, row) => (
              <Space>
                <Button type="link" loading={submitting} onClick={() => onConvertCandidate?.(row)}>
                  转为规则
                </Button>
              </Space>
            ),
          },
        ]}
        scroll={{ x: 980 }}
      />
    </Modal>
  )
}
