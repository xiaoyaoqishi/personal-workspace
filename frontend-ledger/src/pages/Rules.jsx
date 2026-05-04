import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
  Input,
} from 'antd'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'
import { createRule, deleteRule, listCategories, listRules, toggleRule, updateRule } from '../api/ledger'
import EmptyBlock from '../components/EmptyBlock'
import PageHeader from '../components/PageHeader'
import RuleDryRunDrawer from '../components/rules/RuleDryRunDrawer'
import RuleStatsCards from '../components/rules/RuleStatsCards'
import RuleWizard from '../components/rules/RuleWizard'
import SkeletonCard from '../components/SkeletonCard'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

const { Text } = Typography

const TAB_ITEMS = [
  { key: 'all', label: '全部' },
  { key: 'source', label: '来源识别' },
  { key: 'merchant', label: '商户归一' },
  { key: 'category', label: '分类规则' },
]

const RULE_TYPE_COLOR = {
  source: 'blue',
  merchant: 'green',
  category: 'purple',
  combo: 'orange',
}

function ruleTypeLabel(v) {
  const map = { source: '来源识别', merchant: '商户归一', category: '分类规则', combo: '商户+分类' }
  return map[v] || v || '-'
}

function matchModeLabel(v) {
  const map = { contains: '包含', prefix: '前缀', exact: '完全匹配', regex: '正则' }
  return map[v] || v || '-'
}

function buildTargetSummary(row, categories) {
  const catMap = {}
  ;(categories || []).forEach((c) => { catMap[c.id] = c.name })

  if (row.rule_type === 'source') {
    return [row.target_platform, row.target_txn_kind, row.target_scene].filter(Boolean).join(' / ') || '-'
  }
  if (row.rule_type === 'merchant') {
    return row.target_merchant || '-'
  }
  const parts = []
  if (row.target_merchant) parts.push(row.target_merchant)
  if (row.target_category_id) parts.push(catMap[row.target_category_id] || `分类#${row.target_category_id}`)
  if (row.target_subcategory_id) parts.push(catMap[row.target_subcategory_id] || `子分类#${row.target_subcategory_id}`)
  return parts.join(' / ') || row.target_scene || '-'
}

function formatTime(v) {
  if (!v) return '-'
  const d = dayjs(v)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : '-'
}

export default function Rules() {
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [categories, setCategories] = useState([])
  const [keyword, setKeyword] = useState('')
  const [activeTab, setActiveTab] = useState('all')

  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardInitial, setWizardInitial] = useState(null)
  const [wizardLoading, setWizardLoading] = useState(false)

  const [dryRunDrawer, setDryRunDrawer] = useState({ open: false, params: null })

  const load = async () => {
    setLoading(true)
    try {
      const [rRes, cRes] = await Promise.all([listRules(), listCategories()])
      setRows(Array.isArray(rRes?.items) ? rRes.items : [])
      setCategories(Array.isArray(cRes?.items) ? cRes.items : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const tabRules = useMemo(() => {
    return activeTab === 'all' ? rows : rows.filter((r) => r.rule_type === activeTab)
  }, [rows, activeTab])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return tabRules
    return tabRules.filter((r) => {
      const text = [r.pattern, r.explain_text, r.target_merchant, r.target_scene].filter(Boolean).join(' ').toLowerCase()
      return text.includes(kw)
    })
  }, [tabRules, keyword])

  const handleToggle = async (row, enabled) => {
    try {
      await toggleRule(row.id, { enabled })
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, enabled } : r)))
    } catch {
      message.error('切换失败')
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteRule(id)
      message.success('规则已删除')
      await load()
    } catch {
      message.error('删除失败')
    }
  }

  const handleWizardOk = async (values) => {
    setWizardLoading(true)
    try {
      if (wizardInitial?.id) {
        await updateRule(wizardInitial.id, values)
        message.success('规则已更新')
      } else {
        await createRule(values)
        message.success('规则已新建')
      }
      setWizardOpen(false)
      setWizardInitial(null)
      await load()
    } finally {
      setWizardLoading(false)
    }
  }

  const openCreate = () => { setWizardInitial(null); setWizardOpen(true) }
  const openEdit = (row) => { setWizardInitial(row); setWizardOpen(true) }
  const openCopy = (row) => { setWizardInitial({ ...row, id: undefined }); setWizardOpen(true) }
  const openDryRun = (row) => {
    setDryRunDrawer({
      open: true,
      params: {
        rule_type: row.rule_type,
        match_mode: row.match_mode,
        pattern: row.pattern,
        source_channel_condition: row.source_channel_condition,
        platform_condition: row.platform_condition,
        direction_condition: row.direction_condition,
        amount_min: row.amount_min,
        amount_max: row.amount_max,
      },
    })
  }

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60, render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span> },
    {
      title: '类型',
      dataIndex: 'rule_type',
      width: 100,
      render: (v) => <Tag color={RULE_TYPE_COLOR[v] || 'default'}>{ruleTypeLabel(v)}</Tag>,
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 72,
      render: (v, row) => (
        <Switch
          size="small"
          checked={v}
          onChange={(checked) => handleToggle(row, checked)}
        />
      ),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 80,
      render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span>,
    },
    {
      title: '匹配方式 / 文本',
      key: 'match',
      ellipsis: true,
      render: (_, row) => (
        <span>
          <Tag bordered={false}>{matchModeLabel(row.match_mode)}</Tag>
          <Text code style={{ fontSize: 12 }}>{row.pattern}</Text>
        </span>
      ),
    },
    {
      title: '目标结果',
      key: 'target',
      width: 200,
      ellipsis: true,
      render: (_, row) => buildTargetSummary(row, categories),
    },
    {
      title: '命中次数',
      dataIndex: 'hit_count',
      width: 90,
      render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v || 0}</span>,
    },
    {
      title: '最近命中',
      dataIndex: 'last_hit_at',
      width: 140,
      render: (v) => formatTime(v),
    },
    {
      title: '操作',
      key: 'op',
      width: 200,
      render: (_, row) => (
        <Space size={2}>
          <Button type="link" size="small" onClick={() => openDryRun(row)}>试跑</Button>
          <Button type="link" size="small" onClick={() => openEdit(row)}>编辑</Button>
          <Button type="link" size="small" onClick={() => openCopy(row)}>复制</Button>
          <Popconfirm
            title="确认删除该规则？"
            okText="删除"
            cancelText="取消"
            onConfirm={() => handleDelete(row.id)}
          >
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

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
        title="规则管理"
        extra={
          <Button type="primary" onClick={openCreate}>新建规则</Button>
        }
      />

      <RuleStatsCards rules={rows} />

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={TAB_ITEMS}
        style={{ marginBottom: 0 }}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <Input
          allowClear
          placeholder="搜索匹配文本 / 说明 / 目标"
          style={{ width: 280 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <Button onClick={load} loading={loading}>刷新</Button>
      </div>

      {!loading && rows.length === 0 ? (
        <EmptyBlock description="还没有规则" actionText="新建第一条规则" onAction={openCreate} />
      ) : (
        <Table
          rowKey="id"
          loading={loading}
          dataSource={filtered}
          columns={columns}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          scroll={{ x: 1100 }}
        />
      )}

      {wizardOpen && (
        <RuleWizard
          open={wizardOpen}
          initialValues={wizardInitial}
          categories={categories}
          onOk={handleWizardOk}
          onCancel={() => { setWizardOpen(false); setWizardInitial(null) }}
          confirmLoading={wizardLoading}
        />
      )}

      <RuleDryRunDrawer
        open={dryRunDrawer.open}
        ruleParams={dryRunDrawer.params}
        onClose={() => setDryRunDrawer({ open: false, params: null })}
      />
    </Space>
  )
}
