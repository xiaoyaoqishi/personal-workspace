import { useEffect, useState } from 'react'
import { Alert, Button, Card, Empty, Form, List, Popconfirm, Spin, Tag, Timeline, message } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { createAssetEvent, deleteAssetEvent, listAssetEvents } from '../../api/assets'
import AssetEventForm, { getDefaultAssetEventFormValues } from './AssetEventForm'
import { formatDate, formatDateTime, formatMoney, getAssetEventTypeColor, getAssetEventTypeLabel } from './assetConstants'

const TERMINAL_EVENT_TYPES = new Set(['sell', 'dispose', 'lost'])

function buildEventSuccessMessage(eventType) {
  if (eventType === 'sell') return '卖出事件已记录，资产状态会更新为已卖出并记录卖出价格'
  if (eventType === 'dispose') return '报废事件已记录，资产状态会更新为已报废并记录结束日期'
  if (eventType === 'lost') return '丢失事件已记录，资产状态会更新为已遗失并记录结束日期'
  if (eventType === 'repair' || eventType === 'maintenance' || eventType === 'accessory') {
    return '成本事件已记录，附加成本会同步刷新'
  }
  if (eventType === 'start_use') return '开始使用事件已记录，资产状态会更新为使用中'
  return '生命周期事件已记录'
}

function EventRecord({ event, onDelete, deleting = false, showDelete = true }) {
  return (
    <div className={`al-event-card${TERMINAL_EVENT_TYPES.has(event.event_type) ? ' is-terminal' : ''}`}>
      <div className="al-event-card-main">
        <div className="al-event-card-top">
          <Tag color={getAssetEventTypeColor(event.event_type)} style={{ fontSize: 12 }}>
            {getAssetEventTypeLabel(event.event_type)}
          </Tag>
          <span className="al-event-date">{formatDate(event.event_date)}</span>
          {event.amount != null && Number(event.amount) !== 0 ? (
            <span className="al-event-amount">{formatMoney(event.amount)}</span>
          ) : null}
          <span className="al-event-time">{formatDateTime(event.created_at)}</span>
        </div>
        {event.title ? <div className="al-event-title">{event.title}</div> : null}
        {event.note ? <div className="al-event-note">{event.note}</div> : null}
      </div>
      {showDelete ? (
        <div className="al-event-card-actions">
          <Popconfirm
            title="删除事件"
            description="删除事件只会移除事件记录，不会自动回滚资产主表状态或成本。确认继续吗？"
            okText="确认删除"
            cancelText="取消"
            onConfirm={() => onDelete(event.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} loading={deleting} />
          </Popconfirm>
        </div>
      ) : null}
    </div>
  )
}

export default function AssetEventsPanel({
  assetId,
  onAssetMutated,
  title = '生命周期事件',
  showTimeline = false,
  defaultFormOpen = false,
}) {
  const [form] = Form.useForm()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formOpen, setFormOpen] = useState(defaultFormOpen)
  const [deletingId, setDeletingId] = useState(null)
  const [showAll, setShowAll] = useState(false)

  const resetForm = () => {
    form.resetFields()
    form.setFieldsValue(getDefaultAssetEventFormValues())
  }

  const loadEvents = async () => {
    if (!assetId) {
      setEvents([])
      setError('')
      return
    }

    setLoading(true)
    setError('')
    try {
      const payload = await listAssetEvents(assetId)
      setEvents(Array.isArray(payload?.items) ? payload.items : [])
    } catch (nextError) {
      setError(nextError?.userMessage || '生命周期事件加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    resetForm()
  }, [form])

  useEffect(() => {
    setFormOpen(defaultFormOpen)
    setShowAll(false)
    loadEvents()
    resetForm()
  }, [assetId, defaultFormOpen])

  const handleCreate = async (payload) => {
    if (!assetId) return
    setSubmitting(true)
    try {
      await createAssetEvent(assetId, payload)
      message.success(buildEventSuccessMessage(payload.event_type))
      await loadEvents()
      resetForm()
      if (!defaultFormOpen) {
        setFormOpen(false)
      }
      if (onAssetMutated) {
        await onAssetMutated(assetId, { source: 'event', eventType: payload.event_type })
      }
    } catch (error) {
      message.error(error?.userMessage || '生命周期事件新增失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (eventId) => {
    if (!assetId) return
    setDeletingId(eventId)
    try {
      await deleteAssetEvent(assetId, eventId)
      message.success('事件已删除；资产主表状态与成本不会自动回滚')
      await loadEvents()
    } catch (error) {
      message.error(error?.userMessage || '事件删除失败，请稍后重试')
    } finally {
      setDeletingId(null)
    }
  }

  const emptyNode = <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无生命周期事件" />

  return (
    <Card
      className="asset-library-subpanel-card"
      title={title}
      bordered={false}
      extra={
        assetId ? (
          <Button type={formOpen ? 'default' : 'primary'} icon={<PlusOutlined />} onClick={() => setFormOpen((prev) => !prev)}>
            {formOpen ? '收起表单' : '新增事件'}
          </Button>
        ) : null
      }
    >
      {error ? <Alert type="error" showIcon message={error} className="asset-library-inline-alert" /> : null}

      {formOpen && assetId ? (
        <div className="al-event-form-block">
          <AssetEventForm
            form={form}
            onSubmit={handleCreate}
            submitting={submitting}
            onCancel={defaultFormOpen ? undefined : () => setFormOpen(false)}
          />
        </div>
      ) : null}

      {!assetId ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择资产后查看生命周期事件" />
      ) : loading ? (
        <div className="asset-library-loading-state asset-library-loading-state-compact">
          <Spin />
        </div>
      ) : showTimeline ? (
        events.length ? (
          <>
            <Timeline
              className="asset-library-timeline"
              items={(showAll ? events : events.slice(0, 5)).map((event) => ({
                color: TERMINAL_EVENT_TYPES.has(event.event_type) ? 'red' : getAssetEventTypeColor(event.event_type),
                children: <EventRecord event={event} deleting={deletingId === event.id} onDelete={handleDelete} />,
              }))}
            />
            {events.length > 5 ? (
              <button className="al-show-all-btn" onClick={() => setShowAll((p) => !p)}>
                {showAll ? '收起' : `显示全部 ${events.length} 条事件`}
              </button>
            ) : null}
          </>
        ) : (
          emptyNode
        )
      ) : events.length ? (
        <>
          <List
            className="asset-library-record-list"
            dataSource={showAll ? events : events.slice(0, 5)}
            renderItem={(event) => (
              <List.Item className="asset-library-record-list-item">
                <EventRecord event={event} deleting={deletingId === event.id} onDelete={handleDelete} />
              </List.Item>
            )}
          />
          {events.length > 5 ? (
            <button className="al-show-all-btn" onClick={() => setShowAll((p) => !p)}>
              {showAll ? '收起' : `显示全部 ${events.length} 条事件`}
            </button>
          ) : null}
        </>
      ) : (
        emptyNode
      )}
    </Card>
  )
}
