import { useEffect, useMemo, useState } from 'react'
import { Button, Popconfirm, Select, Space, Table, Tag, Tooltip, message } from 'antd'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'
import { createMerchant, deleteMerchant, listCategories, listMerchants, mergeMerchants, updateMerchant } from '../api/ledger'
import EmptyBlock from '../components/EmptyBlock'
import PageHeader from '../components/PageHeader'
import MerchantEditModal from '../components/merchants/MerchantEditModal'
import MerchantMergeModal from '../components/merchants/MerchantMergeModal'
import { Input } from 'antd'
import SkeletonCard from '../components/SkeletonCard'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

const SORT_OPTIONS = [
  { label: '命中次数', value: 'hit_count' },
  { label: '近30天金额', value: 'recent_30d_amount' },
  { label: '最近活跃', value: 'last_seen_at' },
]

const CAT_FILTER_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '有默认分类', value: 'has_cat' },
  { label: '无默认分类', value: 'no_cat' },
]

function RelativeTime({ value }) {
  if (!value) return <span>-</span>
  const abs = dayjs(value).format('YYYY-MM-DD HH:mm')
  const rel = dayjs(value).fromNow()
  return (
    <Tooltip title={abs}>
      <span style={{ fontVariantNumeric: 'tabular-nums', cursor: 'default' }}>{rel}</span>
    </Tooltip>
  )
}

function AliasCell({ aliases }) {
  if (!Array.isArray(aliases) || !aliases.length) return <span style={{ color: 'var(--lk-color-text-muted)' }}>-</span>
  const show = aliases.slice(0, 3)
  const rest = aliases.length - 3
  return (
    <span>
      {show.map((a) => <Tag key={a} style={{ marginBottom: 2 }}>{a}</Tag>)}
      {rest > 0 && <Tag color="default">+{rest}</Tag>}
    </span>
  )
}

export default function MerchantDictionaryPage() {
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [categories, setCategories] = useState([])
  const [keyword, setKeyword] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [sortBy, setSortBy] = useState('hit_count')

  const [editModal, setEditModal] = useState({ open: false, row: null })
  const [editLoading, setEditLoading] = useState(false)
  const [mergeModal, setMergeModal] = useState({ open: false })
  const [mergeLoading, setMergeLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [mRes, cRes] = await Promise.all([listMerchants(), listCategories()])
      setRows(Array.isArray(mRes?.items) ? mRes.items : [])
      setCategories(Array.isArray(cRes?.items) ? cRes.items : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    let result = rows.filter((row) => {
      if (catFilter === 'has_cat' && !row.default_category_id) return false
      if (catFilter === 'no_cat' && row.default_category_id) return false
      if (!kw) return true
      const aliases = (row.aliases || []).join(' ')
      return `${row.canonical_name} ${aliases}`.toLowerCase().includes(kw)
    })
    result = [...result].sort((a, b) => {
      if (sortBy === 'hit_count') return (b.hit_count || 0) - (a.hit_count || 0)
      if (sortBy === 'recent_30d_amount') return (b.recent_30d_amount || 0) - (a.recent_30d_amount || 0)
      if (sortBy === 'last_seen_at') {
        if (!a.last_seen_at) return 1
        if (!b.last_seen_at) return -1
        return new Date(b.last_seen_at) - new Date(a.last_seen_at)
      }
      return 0
    })
    return result
  }, [rows, keyword, catFilter, sortBy])

  const handleEdit = async (values) => {
    setEditLoading(true)
    try {
      if (editModal.row?.id) {
        await updateMerchant(editModal.row.id, values)
        message.success('商户已更新')
      } else {
        await createMerchant(values)
        message.success('商户已新建')
      }
      setEditModal({ open: false, row: null })
      await load()
    } finally {
      setEditLoading(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteMerchant(id)
      message.success('商户已删除')
      await load()
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || '删除失败'
      message.error(detail)
    }
  }

  const handleMerge = async (payload) => {
    setMergeLoading(true)
    try {
      await mergeMerchants(payload)
      message.success('合并成功')
      setMergeModal({ open: false })
      await load()
    } finally {
      setMergeLoading(false)
    }
  }

  const columns = [
    {
      title: '规范商户名',
      dataIndex: 'canonical_name',
      width: 180,
      render: (v) => <strong>{v}</strong>,
    },
    {
      title: '别名',
      dataIndex: 'aliases',
      render: (v) => <AliasCell aliases={v} />,
    },
    {
      title: '默认分类',
      key: 'cat',
      width: 180,
      render: (_, row) => {
        const parts = [row.default_category_name, row.default_subcategory_name].filter(Boolean)
        return parts.length ? parts.join(' / ') : <span style={{ color: 'var(--lk-color-text-muted)' }}>-</span>
      },
    },
    {
      title: '命中次数',
      dataIndex: 'hit_count',
      width: 90,
      render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v || 0}</span>,
    },
    {
      title: '近30天笔数',
      dataIndex: 'recent_30d_count',
      width: 100,
      render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v || 0}</span>,
    },
    {
      title: '近30天金额',
      dataIndex: 'recent_30d_amount',
      width: 120,
      render: (v) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {v ? `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
        </span>
      ),
    },
    {
      title: '最近活跃',
      dataIndex: 'last_seen_at',
      width: 110,
      render: (v) => <RelativeTime value={v} />,
    },
    {
      title: '操作',
      key: 'op',
      width: 160,
      render: (_, row) => {
        const hasTransactions = (row.recent_30d_count || 0) > 0 || (row.hit_count || 0) > 0
        return (
          <Space size={4}>
            <Button type="link" size="small" onClick={() => setEditModal({ open: true, row })}>编辑</Button>
            <Button type="link" size="small" onClick={() => setMergeModal({ open: true })}>合并</Button>
            <Popconfirm
              title="确认删除该商户？"
              description={hasTransactions ? '该商户有关联交易，删除可能失败' : '删除后不可恢复'}
              okText="删除"
              cancelText="取消"
              onConfirm={() => handleDelete(row.id)}
            >
              <Button type="link" size="small" danger>删除</Button>
            </Popconfirm>
          </Space>
        )
      },
    },
  ]

  const expandedRowRender = (row) => {
    const aliases = row.aliases || []
    return (
      <div style={{ padding: '8px 16px' }}>
        <div style={{ marginBottom: 8 }}>
          <span style={{ color: 'var(--lk-color-text-secondary)', marginRight: 8 }}>全部别名：</span>
          {aliases.length
            ? aliases.map((a) => <Tag key={a}>{a}</Tag>)
            : <span style={{ color: 'var(--lk-color-text-muted)' }}>暂无别名</span>}
        </div>
      </div>
    )
  }

  if (loading && rows.length === 0) {
    return (
      <div className="page-section">
        <SkeletonCard rows={6} />
      </div>
    )
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <PageHeader
        title="商户词典"
        extra={
          <Space>
            <Button type="primary" onClick={() => setEditModal({ open: true, row: null })}>新建商户</Button>
            <Button onClick={load} loading={loading}>刷新</Button>
          </Space>
        }
      />

      <div className="filter-bar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '0 0 8px' }}>
        <Input
          allowClear
          placeholder="搜索规范名 / 别名"
          style={{ width: 280 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <Select
          style={{ width: 150 }}
          value={catFilter}
          onChange={setCatFilter}
          options={CAT_FILTER_OPTIONS}
        />
        <Select
          style={{ width: 160 }}
          value={sortBy}
          onChange={setSortBy}
          options={SORT_OPTIONS}
          prefix="排序："
        />
      </div>

      {!loading && rows.length === 0 ? (
        <EmptyBlock
          description="还没有商户词典"
          actionText="新建第一个商户"
          onAction={() => setEditModal({ open: true, row: null })}
        />
      ) : (
        <Table
          rowKey="id"
          loading={loading}
          dataSource={filtered}
          columns={columns}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          expandable={{ expandedRowRender }}
          scroll={{ x: 1200 }}
        />
      )}

      <MerchantEditModal
        open={editModal.open}
        row={editModal.row}
        categories={categories}
        onOk={handleEdit}
        onCancel={() => setEditModal({ open: false, row: null })}
        confirmLoading={editLoading}
      />

      <MerchantMergeModal
        open={mergeModal.open}
        merchants={rows}
        onOk={handleMerge}
        onCancel={() => setMergeModal({ open: false })}
        confirmLoading={mergeLoading}
      />
    </Space>
  )
}
