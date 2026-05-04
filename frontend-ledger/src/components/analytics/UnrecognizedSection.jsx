import { Button, Space, Table, Tag } from 'antd'
import { useNavigate } from 'react-router-dom'

function fmtMoney(v) {
  return `¥${Number(v || 0).toFixed(2)}`
}

export default function UnrecognizedSection({ data }) {
  const navigate = useNavigate()
  const d = data || {}

  const merchantCols = [
    { title: '商户', dataIndex: 'merchant', ellipsis: true },
    { title: '次数', dataIndex: 'count', width: 70 },
    { title: '金额', dataIndex: 'amount', width: 110, render: (v) => fmtMoney(v) },
  ]
  const descCols = [
    { title: '摘要', dataIndex: 'description', ellipsis: true },
    { title: '次数', dataIndex: 'count', width: 70 },
    { title: '金额', dataIndex: 'amount', width: 110, render: (v) => fmtMoney(v) },
  ]

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <Space wrap>
        <Tag color="warning">未识别笔数：{d.unrecognized_count ?? 0}</Tag>
        <Tag color="warning">未识别金额：{fmtMoney(d.unrecognized_amount)}</Tag>
        <Tag color="warning">
          占比：{((Number(d.unrecognized_ratio || 0)) * 100).toFixed(1)}%
        </Tag>
      </Space>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Table
          rowKey="merchant"
          size="small"
          pagination={false}
          title={() => '未识别商户 Top'}
          dataSource={Array.isArray(d.top_merchants) ? d.top_merchants : []}
          columns={merchantCols}
        />
        <Table
          rowKey="description"
          size="small"
          pagination={false}
          title={() => '未识别摘要 Top'}
          dataSource={Array.isArray(d.top_descriptions) ? d.top_descriptions : []}
          columns={descCols}
        />
      </div>

      <div>
        <Button type="link" onClick={() => navigate('/imports')}>
          去校对台处理 →
        </Button>
      </div>
    </Space>
  )
}
