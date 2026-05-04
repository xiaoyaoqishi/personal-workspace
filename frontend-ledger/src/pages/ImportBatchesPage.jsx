import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Checkbox, Drawer, Dropdown, Input, Modal, Progress, Segmented, Space, Table, Tag, Upload, message } from 'antd'
import { FilterOutlined, QuestionCircleOutlined, ReloadOutlined, TableOutlined, AppstoreOutlined, UploadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  classifyImportBatch,
  commitImportBatch,
  createImportBatch,
  deleteImportBatch,
  dedupeImportBatch,
  listImportBatches,
  parseImportBatch,
  reprocessImportBatch,
} from '../api/ledger'
import BatchCard from '../components/imports/BatchCard'
import EmptyBlock from '../components/EmptyBlock'
import PageHeader from '../components/PageHeader'
import PipelineStepsBar from '../components/imports/PipelineStepsBar'
import SkeletonCard from '../components/SkeletonCard'
import { isCommittedBatch } from '../constants/ledgerReview'
import { formatDateTime } from '../utils/date'

const STATUS_COLOR = {
  uploaded: 'default',
  parsed: 'processing',
  classified: 'blue',
  deduped: 'orange',
  committed: 'green',
}
const STATUS_LABEL = {
  uploaded: '已上传',
  parsed: '已解析',
  classified: '已分类',
  deduped: '已清理',
  committed: '已提交',
}

const HELP_TEXT = [
  '提交入账只处理 confirmed / approved / accepted 状态的记录；',
  'pending / ignored / rejected / duplicate 不会入账。',
  '"清理重复"不执行真实重复检测，仅复位已有重复标记。',
  '已提交批次只读，如需重处理请先删除（将回滚已入账交易）。',
]

function buildCommitResultMessage(payload) {
  return `提交完成：入账 ${Number(payload?.committed_count || 0)}，跳过 ${Number(payload?.skipped_count || 0)}，失败 ${Number(payload?.failed_count || 0)}`
}

const AUTO_PIPELINE_KEY = 'ledger_import_auto_pipeline'

export default function ImportBatchesPage() {
  const navigate = useNavigate()
  const [initialLoading, setInitialLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [helpOpen, setHelpOpen] = useState(false)
  const [viewMode, setViewMode] = useState('card')

  // FilterBar state
  const [filterStatus, setFilterStatus] = useState([])
  const [filterName, setFilterName] = useState('')

  // Pipeline modal state
  const [pipelineModal, setPipelineModal] = useState({ open: false, batchId: null, fileName: '' })
  const [pipelineStep, setPipelineStep] = useState(0) // 0=confirm, 1=running, 2=done
  const [pipelineProgress, setPipelineProgress] = useState(0)
  const [autoPipeline, setAutoPipeline] = useState(() => {
    try { return localStorage.getItem(AUTO_PIPELINE_KEY) !== 'false' } catch { return true }
  })

  // Toast dedup: only show last message per batch
  const lastMsgRef = useRef({})
  const showMsg = useCallback((batchId, text, type = 'success') => {
    if (lastMsgRef.current[batchId]) lastMsgRef.current[batchId]()
    const hide = message[type](text, 2)
    lastMsgRef.current[batchId] = hide
  }, [])

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const payload = await listImportBatches()
      setRows(Array.isArray(payload?.items) ? payload.items : [])
    } catch {
      message.error('加载导入批次失败')
    } finally {
      if (!silent) setLoading(false)
      setInitialLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const withLoading = async (fn) => {
    setLoading(true)
    try { await fn() } finally { setLoading(false) }
  }

  const runParseAndRecognize = async (batchId) => {
    await parseImportBatch(batchId)
    await reprocessImportBatch(batchId)
  }

  const handleUpload = async (file) => {
    setLoading(true)
    let batch
    try {
      batch = await createImportBatch(file)
      await load(true)
    } catch {
      message.error('上传失败')
      setLoading(false)
      return
    }
    setLoading(false)
    const batchId = batch?.id
    const fileName = batch?.file_name || file.name || '账单文件'
    if (autoPipeline && batchId) {
      setPipelineStep(0)
      setPipelineProgress(0)
      setPipelineModal({ open: true, batchId, fileName })
    } else {
      message.success('批次创建成功')
      load()
    }
  }

  const runAutoPipeline = async () => {
    const { batchId } = pipelineModal
    if (!batchId) return
    setPipelineStep(1)
    setPipelineProgress(10)
    try {
      await parseImportBatch(batchId)
      setPipelineProgress(45)
      await reprocessImportBatch(batchId)
      setPipelineProgress(75)
      await dedupeImportBatch(batchId)
      setPipelineProgress(100)
      setPipelineStep(2)
      await load(true)
    } catch {
      message.error('自动流水线失败，请手动操作')
      setPipelineModal({ open: false, batchId: null, fileName: '' })
    }
  }

  // Filtered rows
  const filteredRows = rows.filter((row) => {
    if (filterStatus.length && !filterStatus.includes(row.status)) return false
    if (filterName && !String(row.file_name || '').toLowerCase().includes(filterName.toLowerCase())) return false
    return true
  })

  const handleCommit = async (batchId) => {
    await withLoading(async () => {
      const payload = await commitImportBatch(batchId)
      showMsg(batchId, buildCommitResultMessage(payload))
      if (Array.isArray(payload?.errors) && payload.errors.length) {
        Modal.warning({
          title: '部分记录未能入账',
          content: (
            <div>
              {payload.errors.slice(0, 5).map((item) => (
                <div key={`${item.row_id}-${item.error}`}>行 #{item.row_id}：{item.message || item.error || '提交失败'}</div>
              ))}
            </div>
          ),
        })
      }
      await load()
    })
  }

  const makeHandlers = (row) => ({
    onReview: () => navigate(`/imports/${row.id}/review`),
    onParseAndRecognize: () => withLoading(async () => {
      await runParseAndRecognize(row.id)
      showMsg(row.id, '解析并识别完成')
      await load()
    }),
    onDedupe: () => withLoading(async () => {
      await dedupeImportBatch(row.id)
      showMsg(row.id, '清理重复完成')
      await load()
    }),
    onClassify: () => withLoading(async () => {
      await classifyImportBatch(row.id)
      showMsg(row.id, '分类完成')
      await load()
    }),
    onReprocess: () => withLoading(async () => {
      await reprocessImportBatch(row.id)
      showMsg(row.id, '重算识别完成')
      await load()
    }),
    onCommit: () => handleCommit(row.id),
    onDelete: () => withLoading(async () => {
      await deleteImportBatch(row.id)
      showMsg(row.id, '删除完成')
      await load()
    }),
  })

  // Table columns for list view
  const tableColumns = [
    { title: '文件名', dataIndex: 'file_name', ellipsis: true },
    { title: '来源', dataIndex: 'source_type_display', width: 100, render: (v, row) => v || row.source_type || '-' },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: (v) => <Tag color={STATUS_COLOR[v] || 'default'}>{STATUS_LABEL[v] || v}</Tag>,
    },
    { title: '总条数', dataIndex: 'total_rows', width: 80, render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v ?? 0}</span> },
    { title: '待确认', dataIndex: 'pending_count', width: 80, render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v ?? 0}</span> },
    { title: '可入账', dataIndex: 'committable_count', width: 80, render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v ?? 0}</span> },
    { title: '创建时间', dataIndex: 'created_at', width: 160, render: (v) => v ? formatDateTime(v) : '-' },
    {
      title: '操作', key: 'op', fixed: 'right', width: 180,
      render: (_, row) => {
        const h = makeHandlers(row)
        const committed = isCommittedBatch(row)
        const moreItems = [
          ...(committed ? [] : [
            { key: 'parse', label: '解析识别', onClick: h.onParseAndRecognize },
            { key: 'dedupe', label: '清理重复', onClick: h.onDedupe },
            { key: 'reprocess', label: '重算识别', onClick: h.onReprocess },
          ]),
          { key: 'delete', label: <span style={{ color: 'var(--lk-color-danger)' }}>删除</span>, onClick: h.onDelete },
        ]
        return (
          <Space>
            <Button type="link" size="small" onClick={h.onReview}>复核台</Button>
            {!committed && Number(row.committable_count || 0) > 0 && (
              <Button type="link" size="small" onClick={h.onCommit}>提交</Button>
            )}
            <Dropdown menu={{ items: moreItems }} trigger={['click']}>
              <Button type="link" size="small">更多</Button>
            </Dropdown>
          </Space>
        )
      },
    },
  ]

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <PageHeader
        title="导入中心"
        subtitle="上传账单 → 自动识别 → 复核入账"
        extra={
          <Space>
            <Upload accept=".csv,.xls,.xlsx" maxCount={1} showUploadList={false} beforeUpload={(file) => { handleUpload(file); return false }}>
              <Button type="primary" icon={<UploadOutlined />} loading={loading}>上传账单</Button>
            </Upload>
            <Button icon={<ReloadOutlined />} onClick={() => load()} loading={loading}>刷新</Button>
            <Button icon={<QuestionCircleOutlined />} onClick={() => setHelpOpen(true)}>使用说明</Button>
          </Space>
        }
      />

      <PipelineStepsBar />

      {/* FilterBar */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', background: 'var(--lk-color-surface)', padding: '12px 16px', borderRadius: 'var(--lk-radius-sm)', border: '1px solid var(--lk-color-border)' }}>
        <FilterOutlined style={{ color: 'var(--lk-color-text-muted)' }} />
        <Dropdown
          trigger={['click']}
          menu={{
            multiple: true,
            selectedKeys: filterStatus,
            items: Object.entries(STATUS_LABEL).map(([key, label]) => ({ key, label })),
            onClick: ({ key, domEvent }) => {
              domEvent.stopPropagation()
              setFilterStatus((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key])
            },
          }}
        >
          <Button size="small">
            状态筛选 {filterStatus.length ? `(${filterStatus.length})` : ''}
          </Button>
        </Dropdown>
        <Input
          placeholder="搜索文件名"
          value={filterName}
          onChange={(e) => setFilterName(e.target.value)}
          allowClear
          style={{ width: 200 }}
          size="small"
        />
        {(filterStatus.length > 0 || filterName) && (
          <Button size="small" type="link" onClick={() => { setFilterStatus([]); setFilterName('') }}>清除筛选</Button>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <Segmented
            size="small"
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: 'card', icon: <AppstoreOutlined />, label: '卡片' },
              { value: 'list', icon: <TableOutlined />, label: '列表' },
            ]}
          />
        </div>
      </div>

      {/* Content */}
      {initialLoading ? (
        <SkeletonCard rows={4} />
      ) : filteredRows.length === 0 ? (
        <EmptyBlock
          description={rows.length === 0 ? '还没有导入批次' : '没有匹配的批次'}
          actionText={rows.length === 0 ? '上传第一份账单' : undefined}
          onAction={rows.length === 0 ? () => document.querySelector('input[type=file]')?.click() : undefined}
        />
      ) : viewMode === 'card' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
          {filteredRows.map((row) => (
            <BatchCard
              key={row.id}
              batch={row}
              loading={loading}
              {...makeHandlers(row)}
            />
          ))}
        </div>
      ) : (
        <div style={{ background: 'var(--lk-color-surface)', borderRadius: 'var(--lk-radius-md)', border: '1px solid var(--lk-color-border)', overflow: 'hidden' }}>
          <Table
            rowKey="id"
            loading={loading}
            dataSource={filteredRows}
            columns={tableColumns}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            size="small"
            scroll={{ x: 1000 }}
          />
        </div>
      )}

      {/* Help Drawer */}
      <Drawer title="使用说明" open={helpOpen} onClose={() => setHelpOpen(false)} width={360}>
        <ul style={{ paddingLeft: 20, lineHeight: 2, color: 'var(--lk-color-text-secondary)' }}>
          {HELP_TEXT.map((text, i) => <li key={i}>{text}</li>)}
        </ul>
      </Drawer>

      {/* Auto Pipeline Modal */}
      <Modal
        title={`一键处理：${pipelineModal.fileName}`}
        open={pipelineModal.open}
        onCancel={() => setPipelineModal({ open: false, batchId: null, fileName: '' })}
        footer={
          pipelineStep === 0 ? [
            <Button key="skip" onClick={() => { setPipelineModal({ open: false, batchId: null, fileName: '' }); load() }}>跳过，稍后手动处理</Button>,
            <Button key="run" type="primary" onClick={runAutoPipeline}>自动处理（解析 → 识别 → 去重）</Button>,
          ] : pipelineStep === 2 ? [
            <Button key="review" type="primary" onClick={() => { setPipelineModal({ open: false, batchId: null, fileName: '' }); navigate(`/imports/${pipelineModal.batchId}/review`) }}>进入复核台</Button>,
          ] : null
        }
        closable={pipelineStep !== 1}
      >
        {pipelineStep === 0 && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <div style={{ color: 'var(--lk-color-text-secondary)' }}>
              上传成功！是否自动执行：解析识别 → 重算识别 → 清理重复？完成后可直接进入复核台。
            </div>
            <Checkbox
              checked={autoPipeline}
              onChange={(e) => {
                setAutoPipeline(e.target.checked)
                try { localStorage.setItem(AUTO_PIPELINE_KEY, e.target.checked ? 'true' : 'false') } catch {}
              }}
            >
              下次上传后默认自动处理
            </Checkbox>
          </Space>
        )}
        {pipelineStep === 1 && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <div style={{ color: 'var(--lk-color-text-secondary)' }}>正在处理中，请稍候…</div>
            <Progress percent={pipelineProgress} status="active" />
          </Space>
        )}
        {pipelineStep === 2 && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <div style={{ color: 'var(--lk-color-success)', fontWeight: 600 }}>处理完成！</div>
            <div style={{ color: 'var(--lk-color-text-secondary)' }}>解析识别 → 重算识别 → 清理重复 均已完成，请进入复核台核对。</div>
          </Space>
        )}
      </Modal>
    </Space>
  )
}
