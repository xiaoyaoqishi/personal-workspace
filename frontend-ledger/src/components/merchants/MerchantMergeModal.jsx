import { AutoComplete, Modal, Table, Typography, message } from 'antd'
import { useMemo, useState } from 'react'

const { Text } = Typography

export default function MerchantMergeModal({ open, merchants, onOk, onCancel, confirmLoading }) {
  const [targetId, setTargetId] = useState(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [searchText, setSearchText] = useState('')

  const autoOptions = useMemo(() => {
    const kw = searchText.trim().toLowerCase()
    return (merchants || [])
      .filter((m) => {
        if (!kw) return true
        const aliases = (m.aliases || []).join(' ')
        return `${m.canonical_name} ${aliases}`.toLowerCase().includes(kw)
      })
      .slice(0, 20)
      .map((m) => ({ value: String(m.id), label: `${m.canonical_name} (id: ${m.id})` }))
  }, [merchants, searchText])

  const sourceRows = useMemo(
    () => (merchants || []).filter((m) => String(m.id) !== String(targetId)),
    [merchants, targetId],
  )

  const handleOk = async () => {
    if (!targetId) {
      message.warning('请先选择目标商户')
      return
    }
    if (!selectedRowKeys.length) {
      message.warning('请勾选要并入的源商户')
      return
    }
    onOk({ source_ids: selectedRowKeys.map(Number), target_id: Number(targetId) })
  }

  return (
    <Modal
      title="合并商户"
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={confirmLoading}
      width={700}
      destroyOnHide
    >
      <div style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>目标商户（保留）</Text>
        <AutoComplete
          style={{ width: '100%' }}
          options={autoOptions}
          value={searchText}
          onSearch={setSearchText}
          onSelect={(val) => {
            setTargetId(val)
            const found = (merchants || []).find((m) => String(m.id) === val)
            setSearchText(found ? found.canonical_name : val)
          }}
          placeholder="搜索目标商户名或别名"
          allowClear
          onClear={() => { setTargetId(null); setSearchText('') }}
        />
      </div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
        勾选要并入目标的源商户（别名将合并，关联交易将重新指向目标）
      </Text>
      <Table
        rowKey="id"
        size="small"
        dataSource={sourceRows}
        pagination={{ pageSize: 10 }}
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
        }}
        columns={[
          { title: '商户名', dataIndex: 'canonical_name', ellipsis: true },
          {
            title: '别名',
            dataIndex: 'aliases',
            render: (v) => (Array.isArray(v) ? v.slice(0, 3).join('、') : '-'),
            ellipsis: true,
          },
          { title: '命中次数', dataIndex: 'hit_count', width: 90 },
        ]}
      />
    </Modal>
  )
}
