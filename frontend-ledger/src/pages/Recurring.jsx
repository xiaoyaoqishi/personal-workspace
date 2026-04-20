import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Popconfirm, Space, Switch, Table, Tabs, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import {
  createRecurringRule,
  deleteRecurringRule,
  detectRecurring,
  generateRecurringDraft,
  getRecurringOverview,
  getRecurringReminders,
  listAccounts,
  listCategories,
  listRecurringRules,
  matchRecurringTransaction,
  updateRecurringRule,
} from '../api/ledger'
import AmountText from '../components/AmountText'
import EmptyBlock from '../components/EmptyBlock'
import PageHeader from '../components/PageHeader'
import RecurringDetectModal from '../components/RecurringDetectModal'
import RecurringOverviewCards from '../components/RecurringOverviewCards'
import RecurringReminderList from '../components/RecurringReminderList'
import RecurringRuleFormModal from '../components/RecurringRuleFormModal'
import { recurringFrequencyLabel, recurringRuleTypeLabel, transactionTypeLabel } from '../utils/ledger'
import { buildSearchParams } from '../utils/query'

export default function Recurring() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [rules, setRules] = useState([])
  const [overview, setOverview] = useState({})
  const [reminders, setReminders] = useState({ upcoming: [], overdue: [], amount_anomaly: [] })

  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState('create')
  const [editingRule, setEditingRule] = useState(null)

  const [detectOpen, setDetectOpen] = useState(false)
  const [detectLoading, setDetectLoading] = useState(false)
  const [detectCandidates, setDetectCandidates] = useState([])

  const reminderTabs = useMemo(
    () => [
      { key: 'upcoming', label: `即将到期 (${reminders.upcoming?.length || 0})`, items: reminders.upcoming || [] },
      { key: 'overdue', label: `已逾期 (${reminders.overdue?.length || 0})`, items: reminders.overdue || [] },
      { key: 'amount_anomaly', label: `金额异常 (${reminders.amount_anomaly?.length || 0})`, items: reminders.amount_anomaly || [] },
    ],
    [reminders]
  )

  const loadAll = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      const [accountRes, categoryRes, rulesRes, overviewRes, remindersRes] = await Promise.all([
        listAccounts(),
        listCategories(),
        listRecurringRules(),
        getRecurringOverview(),
        getRecurringReminders(),
      ])
      setAccounts(Array.isArray(accountRes?.items) ? accountRes.items : [])
      setCategories(Array.isArray(categoryRes?.items) ? categoryRes.items : [])
      setRules(Array.isArray(rulesRes?.items) ? rulesRes.items : [])
      setOverview(overviewRes || {})
      setReminders({
        upcoming: Array.isArray(remindersRes?.upcoming) ? remindersRes.upcoming : [],
        overdue: Array.isArray(remindersRes?.overdue) ? remindersRes.overdue : [],
        amount_anomaly: Array.isArray(remindersRes?.amount_anomaly) ? remindersRes.amount_anomaly : [],
      })
    } catch (error) {
      setErrorMessage(error?.userMessage || '加载周期账单失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const handleGenerateDraft = async (ruleId) => {
    const draft = await generateRecurringDraft(ruleId, {})
    const query = buildSearchParams({
      draft_from_recurring: 1,
      occurred_at: draft.occurred_at,
      account_id: draft.account_id,
      counterparty_account_id: draft.counterparty_account_id,
      category_id: draft.category_id,
      transaction_type: draft.transaction_type,
      direction: draft.direction,
      amount: draft.amount,
      currency: draft.currency,
      merchant: draft.merchant,
      description: draft.description,
      note: draft.note,
      source: draft.source,
    })
    navigate(`/transactions?${query}`)
  }

  const handleToggleActive = async (row, checked) => {
    await updateRecurringRule(row.id, { is_active: checked })
    await loadAll()
  }

  const handleOpenCreate = () => {
    setFormMode('create')
    setEditingRule(null)
    setFormOpen(true)
  }

  const handleOpenEdit = (row) => {
    setFormMode('edit')
    setEditingRule(row)
    setFormOpen(true)
  }

  const handleSaveRule = async (payload) => {
    setSaving(true)
    try {
      if (formMode === 'edit' && editingRule?.id) {
        await updateRecurringRule(editingRule.id, payload)
        message.success('规则已更新')
      } else {
        await createRecurringRule(payload)
        message.success('规则已创建')
      }
      setFormOpen(false)
      await loadAll()
    } finally {
      setSaving(false)
    }
  }

  const handleDetect = async (payload) => {
    setDetectLoading(true)
    try {
      const res = await detectRecurring(payload)
      setDetectCandidates(Array.isArray(res?.candidates) ? res.candidates : [])
    } finally {
      setDetectLoading(false)
    }
  }

  const handleConvertCandidate = (candidate) => {
    const now = new Date()
    const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const nextInitial = {
      name: `${candidate.merchant}-${recurringFrequencyLabel(candidate.estimated_frequency)}`,
      is_active: true,
      rule_type: candidate.direction === 'income' ? 'income' : 'subscription',
      frequency: candidate.estimated_frequency,
      interval_count: 1,
      day_of_month: candidate.suggested_day_of_month || null,
      weekday: candidate.suggested_weekday ?? null,
      start_date: startDate,
      expected_amount: candidate.amount,
      amount_tolerance: 0,
      currency: 'CNY',
      account_id: candidate.account_id,
      category_id: candidate.suggested_category_id,
      transaction_type: candidate.transaction_type,
      direction: candidate.direction,
      merchant: candidate.merchant,
      source_hint: 'detect',
    }
    setDetectOpen(false)
    setFormMode('create')
    setEditingRule(nextInitial)
    setFormOpen(true)
  }

  const handleMarkMatch = async (ruleId) => {
    const raw = window.prompt('输入流水 ID 作为该规则本期命中：')
    const txId = Number(raw)
    if (!txId || txId <= 0) return
    await matchRecurringTransaction(ruleId, txId)
    message.success('已标记匹配')
    await loadAll()
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <PageHeader
        title="周期账单"
        subtitle="识别固定 recurring 支出/收入，统一查看到期与异常提醒"
        extra={[
          <Button key="detect" onClick={() => setDetectOpen(true)}>
            识别候选
          </Button>,
          <Button key="create" type="primary" onClick={handleOpenCreate}>
            新增规则
          </Button>,
        ]}
      />

      {errorMessage ? <Alert type="error" showIcon message={errorMessage} /> : null}

      <RecurringOverviewCards overview={overview} />

      <Card className="page-card" title="提醒">
        <Tabs
          items={reminderTabs.map((tab) => ({
            key: tab.key,
            label: tab.label,
            children: (
              <RecurringReminderList
                items={tab.items}
                loading={loading}
                onGenerateDraft={handleGenerateDraft}
                onViewRule={(ruleId) => {
                  const row = rules.find((x) => x.id === ruleId)
                  if (!row) return
                  handleOpenEdit(row)
                }}
                onMarkMatch={handleMarkMatch}
              />
            ),
          }))}
        />
      </Card>

      <Card className="page-card" title="规则管理">
        {!rules.length ? (
          <EmptyBlock description="暂无周期规则" />
        ) : (
          <Table
            rowKey="id"
            loading={loading}
            dataSource={rules}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            columns={[
              { title: '名称', dataIndex: 'name', width: 180 },
              { title: '类型', dataIndex: 'rule_type', width: 110, render: (value) => recurringRuleTypeLabel(value) },
              { title: '周期', dataIndex: 'frequency', width: 100, render: (value) => recurringFrequencyLabel(value) },
              {
                title: '预计金额',
                key: 'expected_amount',
                width: 150,
                render: (_, row) =>
                  row.expected_amount ? (
                    <AmountText value={row.expected_amount} currency={row.currency || 'CNY'} direction={row.direction || 'expense'} />
                  ) : (
                    '-'
                  ),
              },
              { title: '账户', dataIndex: 'account_name', width: 130, render: (v) => v || '-' },
              { title: '分类', dataIndex: 'category_name', width: 130, render: (v) => v || '-' },
              { title: '交易类型', dataIndex: 'transaction_type', width: 110, render: (v) => transactionTypeLabel(v) },
              { title: '下次到期', dataIndex: 'next_due_date', width: 120, render: (v) => v || '-' },
              {
                title: '最近匹配',
                dataIndex: 'last_matched_at',
                width: 170,
                render: (v) => (v ? `${v}`.slice(0, 19).replace('T', ' ') : '-'),
              },
              {
                title: '启用',
                width: 90,
                render: (_, row) => <Switch checked={!!row.is_active} onChange={(checked) => handleToggleActive(row, checked)} />,
              },
              {
                title: '操作',
                key: 'op',
                width: 280,
                render: (_, row) => (
                  <Space>
                    <Button type="link" onClick={() => handleOpenEdit(row)}>
                      编辑
                    </Button>
                    <Button type="link" onClick={() => handleGenerateDraft(row.id)}>
                      生成草案
                    </Button>
                    <Popconfirm
                      title="确认删除该规则？"
                      onConfirm={async () => {
                        await deleteRecurringRule(row.id)
                        await loadAll()
                      }}
                    >
                      <Button type="link" danger>
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
            scroll={{ x: 1650 }}
          />
        )}
      </Card>

      <RecurringRuleFormModal
        open={formOpen}
        mode={formMode}
        initialValues={editingRule}
        accounts={accounts}
        categories={categories}
        onCancel={() => setFormOpen(false)}
        onSubmit={handleSaveRule}
        submitting={saving}
      />

      <RecurringDetectModal
        open={detectOpen}
        loading={detectLoading}
        submitting={saving}
        candidates={detectCandidates}
        accounts={accounts}
        onCancel={() => setDetectOpen(false)}
        onDetect={handleDetect}
        onConvertCandidate={handleConvertCandidate}
      />
    </Space>
  )
}
