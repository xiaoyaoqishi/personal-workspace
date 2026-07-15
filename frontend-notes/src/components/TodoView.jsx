import { useEffect, useMemo, useRef, useState } from 'react';
import { DatePicker, Popconfirm, message } from 'antd';
import {
  BellOutlined,
  CalendarOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  LinkOutlined,
  PlusOutlined,
  SearchOutlined,
  SelectOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { noteApi, todoApi } from '../api';

const REMINDER_KEY = 'todo-reminded-ids';
const PRIORITY_LABELS = { high: '高优先级', medium: '普通', low: '低优先级' };

function toBackendDatetime(value) {
  if (!value) return null;
  const date = dayjs(value);
  return date.isValid() ? date.format('YYYY-MM-DDTHH:mm:ss') : null;
}

function getDueMeta(value, completed) {
  if (!value) return null;
  const date = dayjs(value);
  if (!date.isValid()) return null;
  const hasTime = date.hour() !== 23 || date.minute() !== 59;
  const label = date.isSame(dayjs(), 'day')
    ? `今天${hasTime ? ` ${date.format('HH:mm')}` : ''}`
    : date.isSame(dayjs().add(1, 'day'), 'day')
      ? `明天${hasTime ? ` ${date.format('HH:mm')}` : ''}`
      : date.format(hasTime ? 'MM月DD日 HH:mm' : 'MM月DD日');
  return { label, overdue: !completed && date.isBefore(dayjs()) };
}

export default function TodoView({ onNavigate, initialAction }) {
  const [todos, setTodos] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [newTodo, setNewTodo] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newDueAt, setNewDueAt] = useState(null);
  const [newReminderAt, setNewReminderAt] = useState(null);
  const [showCreateOptions, setShowCreateOptions] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState('pending');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [expandedIds, setExpandedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const createInputRef = useRef(null);

  const loadTodos = async () => {
    try {
      const res = await todoApi.list({ include_completed: true });
      const list = res.data || [];
      setTodos(list);
      setDrafts(Object.fromEntries(list.map((todo) => [todo.id, todo.content])));
      setSelectedIds((prev) => prev.filter((id) => list.some((todo) => todo.id === id)));
    } catch {
      message.error('加载待办失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTodos();
  }, []);

  useEffect(() => {
    if (typeof initialAction === 'string' && initialAction.startsWith('new:')) {
      setTimeout(() => createInputRef.current?.focus(), 0);
    }
  }, [initialAction]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = dayjs();
      let reminded = [];
      try {
        reminded = JSON.parse(localStorage.getItem(REMINDER_KEY) || '[]');
      } catch {
        reminded = [];
      }
      const remindedSet = new Set(reminded);
      let touched = false;
      for (const todo of todos) {
        if (todo.is_completed || !todo.reminder_at) continue;
        const reminder = dayjs(todo.reminder_at);
        if (reminder.isValid() && !reminder.isAfter(now) && !remindedSet.has(todo.id)) {
          message.info(`待办提醒：${todo.content}`);
          remindedSet.add(todo.id);
          touched = true;
        }
      }
      if (touched) localStorage.setItem(REMINDER_KEY, JSON.stringify(Array.from(remindedSet)));
    }, 30000);
    return () => clearInterval(timer);
  }, [todos]);

  const counts = useMemo(() => ({
    all: todos.length,
    pending: todos.filter((todo) => !todo.is_completed).length,
    completed: todos.filter((todo) => todo.is_completed).length,
  }), [todos]);

  const visibleTodos = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return todos.filter((todo) => {
      if (filter === 'pending' && todo.is_completed) return false;
      if (filter === 'completed' && !todo.is_completed) return false;
      return !normalizedKeyword || todo.content.toLowerCase().includes(normalizedKeyword);
    });
  }, [filter, keyword, todos]);

  const createTodo = async () => {
    const content = newTodo.trim();
    if (!content || creating) {
      if (!content) createInputRef.current?.focus();
      return;
    }
    setCreating(true);
    try {
      await todoApi.create({
        content,
        priority: newPriority,
        due_at: toBackendDatetime(newDueAt),
        reminder_at: toBackendDatetime(newReminderAt),
      });
      setNewTodo('');
      setNewPriority('medium');
      setNewDueAt(null);
      setNewReminderAt(null);
      setShowCreateOptions(false);
      await loadTodos();
      message.success('待办已创建');
      createInputRef.current?.focus();
    } catch (error) {
      message.error(error.response?.data?.detail || '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const updateTodo = async (id, patch) => {
    try {
      await todoApi.update(id, patch);
      await loadTodos();
    } catch (error) {
      message.error(error.response?.data?.detail || '更新失败');
    }
  };

  const deleteTodo = async (id) => {
    try {
      await todoApi.delete(id);
      await loadTodos();
      message.success('待办已删除');
    } catch {
      message.error('删除失败');
    }
  };

  const jumpToSource = async (todo) => {
    if (!todo?.source_note_id) return;
    try {
      const res = await noteApi.get(todo.source_note_id);
      const note = res.data;
      onNavigate?.(note.note_type === 'diary' ? 'diary' : 'doc', {
        id: note.id,
        anchor: todo.source_anchor_text || '',
      });
    } catch {
      message.error('来源笔记不存在或已删除');
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  };

  const toggleSelectionMode = () => {
    setSelectionMode((prev) => !prev);
    setSelectedIds([]);
  };

  const selectAllVisible = () => {
    const visibleIds = visibleTodos.map((todo) => todo.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : visibleIds);
  };

  const bulkSetCompleted = async (isCompleted) => {
    if (!selectedIds.length) return;
    try {
      await Promise.all(selectedIds.map((id) => todoApi.update(id, { is_completed: isCompleted })));
      message.success(isCompleted ? '已批量完成' : '已恢复为未完成');
      setSelectedIds([]);
      setSelectionMode(false);
      await loadTodos();
    } catch {
      message.error('批量更新失败');
    }
  };

  const toggleDetails = (id) => {
    setExpandedIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  };

  const setQuickDue = (days) => {
    setNewDueAt(dayjs().add(days, 'day').hour(23).minute(59).second(0));
    setShowCreateOptions(true);
  };

  return (
    <div className="todo-page">
      <div className="todo-page-inner">
        <header className="todo-page-header">
          <div>
            <h1>待办</h1>
            <p>{counts.pending ? `还有 ${counts.pending} 件事等待完成` : '今天的事情都完成了'}</p>
          </div>
          <button className={`todo-select-mode-btn ${selectionMode ? 'active' : ''}`} onClick={toggleSelectionMode}>
            <SelectOutlined /> {selectionMode ? '退出选择' : '批量管理'}
          </button>
        </header>

        <section className="todo-compose-card">
          <div className="todo-compose-main">
            <span className="todo-compose-icon"><PlusOutlined /></span>
            <input
              ref={createInputRef}
              className="todo-compose-input"
              placeholder="写下要做的事，按 Enter 快速创建"
              value={newTodo}
              onChange={(event) => setNewTodo(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) createTodo();
              }}
            />
            <button className="todo-create-btn" disabled={!newTodo.trim() || creating} onClick={createTodo}>
              {creating ? '创建中…' : '添加待办'}
            </button>
          </div>
          <div className="todo-compose-tools">
            <button className={newDueAt?.isSame(dayjs(), 'day') ? 'active' : ''} onClick={() => setQuickDue(0)}>
              <CalendarOutlined /> 今天
            </button>
            <button className={newDueAt?.isSame(dayjs().add(1, 'day'), 'day') ? 'active' : ''} onClick={() => setQuickDue(1)}>
              <CalendarOutlined /> 明天
            </button>
            <button className={showCreateOptions ? 'active' : ''} onClick={() => setShowCreateOptions((prev) => !prev)}>
              <ClockCircleOutlined /> 更多设置
            </button>
          </div>
          {showCreateOptions && (
            <div className="todo-compose-options">
              <label>
                <span>优先级</span>
                <select value={newPriority} onChange={(event) => setNewPriority(event.target.value)}>
                  <option value="high">高优先级</option>
                  <option value="medium">普通</option>
                  <option value="low">低优先级</option>
                </select>
              </label>
              <label>
                <span>截止时间</span>
                <DatePicker showTime format="YYYY-MM-DD HH:mm" value={newDueAt} onChange={setNewDueAt} placeholder="可选" />
              </label>
              <label>
                <span>提醒时间</span>
                <DatePicker showTime format="YYYY-MM-DD HH:mm" value={newReminderAt} onChange={setNewReminderAt} placeholder="可选" />
              </label>
            </div>
          )}
        </section>

        <div className="todo-toolbar">
          <div className="todo-filter-tabs" role="tablist" aria-label="筛选待办">
            {[
              ['pending', '未完成'],
              ['all', '全部'],
              ['completed', '已完成'],
            ].map(([value, label]) => (
              <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>
                {label}<span>{counts[value]}</span>
              </button>
            ))}
          </div>
          <label className="todo-search">
            <SearchOutlined />
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索待办" />
            {keyword && <button onClick={() => setKeyword('')} aria-label="清空搜索">×</button>}
          </label>
        </div>

        {selectionMode && (
          <div className="todo-selection-bar">
            <button onClick={selectAllVisible}>全选当前</button>
            <span>已选择 {selectedIds.length} 项</span>
            <div>
              <button disabled={!selectedIds.length} onClick={() => bulkSetCompleted(true)}>标为完成</button>
              <button disabled={!selectedIds.length} onClick={() => bulkSetCompleted(false)}>恢复未完成</button>
            </div>
          </div>
        )}

        <main className="todo-list">
          {loading ? (
            <div className="todo-empty"><span className="todo-empty-icon">···</span><strong>正在加载</strong></div>
          ) : visibleTodos.length ? visibleTodos.map((todo) => {
            const dueMeta = getDueMeta(todo.due_at, todo.is_completed);
            const selected = selectedIds.includes(todo.id);
            const expanded = expandedIds.includes(todo.id);
            return (
              <article key={todo.id} className={`todo-item ${todo.is_completed ? 'done' : ''} ${selected ? 'selected' : ''}`}>
                <div className="todo-item-main">
                  {selectionMode && (
                    <button
                      className={`todo-select-check ${selected ? 'checked' : ''}`}
                      onClick={() => toggleSelect(todo.id)}
                      aria-label={selected ? '取消选择' : '选择待办'}
                    >
                      {selected && <CheckOutlined />}
                    </button>
                  )}
                  <button
                    className={`todo-complete-check ${todo.is_completed ? 'checked' : ''}`}
                    onClick={() => updateTodo(todo.id, { is_completed: !todo.is_completed })}
                    aria-label={todo.is_completed ? '恢复为未完成' : '标记为完成'}
                    title={todo.is_completed ? '恢复为未完成' : '标记为完成'}
                  >
                    {todo.is_completed && <CheckOutlined />}
                  </button>
                  <div className="todo-item-body">
                    <input
                      className="todo-content-input"
                      value={drafts[todo.id] || ''}
                      onChange={(event) => setDrafts((prev) => ({ ...prev, [todo.id]: event.target.value }))}
                      onBlur={() => {
                        const value = (drafts[todo.id] || '').trim();
                        if (value && value !== todo.content) updateTodo(todo.id, { content: value });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                      }}
                      aria-label="待办内容"
                    />
                    <div className="todo-item-meta">
                      <span className={`todo-priority-badge priority-${todo.priority}`}>
                        <i />{PRIORITY_LABELS[todo.priority] || '普通'}
                      </span>
                      {dueMeta && (
                        <span className={dueMeta.overdue ? 'overdue' : ''}>
                          <CalendarOutlined /> {dueMeta.overdue ? '已逾期 · ' : ''}{dueMeta.label}
                        </span>
                      )}
                      {todo.reminder_at && <span><BellOutlined /> 已设置提醒</span>}
                      {todo.source_note_id && <span><LinkOutlined /> 来自笔记</span>}
                    </div>
                  </div>
                  <div className="todo-item-actions">
                    {todo.source_note_id && <button onClick={() => jumpToSource(todo)} title="查看来源"><LinkOutlined /></button>}
                    <button className={expanded ? 'active' : ''} onClick={() => toggleDetails(todo.id)} title="编辑详情"><EditOutlined /></button>
                    <Popconfirm title="删除这条待办？" okText="删除" cancelText="取消" onConfirm={() => deleteTodo(todo.id)}>
                      <button className="danger" title="删除"><DeleteOutlined /></button>
                    </Popconfirm>
                  </div>
                </div>
                {expanded && (
                  <div className="todo-item-details">
                    <label>
                      <span>优先级</span>
                      <select value={todo.priority} onChange={(event) => updateTodo(todo.id, { priority: event.target.value })}>
                        <option value="high">高优先级</option>
                        <option value="medium">普通</option>
                        <option value="low">低优先级</option>
                      </select>
                    </label>
                    <label>
                      <span>截止时间</span>
                      <DatePicker showTime format="YYYY-MM-DD HH:mm" value={todo.due_at ? dayjs(todo.due_at) : null} onChange={(value) => updateTodo(todo.id, { due_at: toBackendDatetime(value) })} placeholder="未设置" />
                    </label>
                    <label>
                      <span>提醒时间</span>
                      <DatePicker showTime format="YYYY-MM-DD HH:mm" value={todo.reminder_at ? dayjs(todo.reminder_at) : null} onChange={(value) => updateTodo(todo.id, { reminder_at: toBackendDatetime(value) })} placeholder="未设置" />
                    </label>
                    <span className="todo-created-at">创建于 {dayjs(todo.created_at).format('YYYY-MM-DD HH:mm')}</span>
                  </div>
                )}
              </article>
            );
          }) : (
            <div className="todo-empty">
              <span className="todo-empty-icon"><CheckOutlined /></span>
              <strong>{keyword ? '没有找到相关待办' : filter === 'pending' ? '没有未完成的待办' : '这里还没有待办'}</strong>
              <p>{keyword ? '换个关键词试试' : filter === 'pending' ? '可以安心休息，或添加一件新事情' : '新建的待办会显示在这里'}</p>
              {!keyword && <button onClick={() => createInputRef.current?.focus()}>添加待办</button>}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
