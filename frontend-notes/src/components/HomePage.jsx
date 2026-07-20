import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRightOutlined,
  CalendarOutlined,
  CheckOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  FormOutlined,
  PushpinFilled,
  PushpinOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { message } from 'antd';
import { Solar } from 'lunar-javascript';
import dayjs from 'dayjs';
import { noteApi, todoApi } from '../api';
import { getWeather } from '../utils/weather';
import { backendTimeInChina, chinaNow } from '../utils/datetime';

const PINNED_DOC_KEY = 'notes-home-pinned-docs';

function formatRelativeTime(value) {
  const date = backendTimeInChina(value);
  const now = chinaNow();
  if (!date.isValid()) return '';
  if (date.isSame(now, 'day')) return `今天 ${date.format('HH:mm')}`;
  if (date.isSame(now.subtract(1, 'day'), 'day')) return `昨天 ${date.format('HH:mm')}`;
  return date.format('M月D日');
}

function getGreeting(hour) {
  if (hour < 6) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export default function HomePage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [weather, setWeather] = useState(null);
  const [todos, setTodos] = useState([]);
  const [diaryTree, setDiaryTree] = useState({});
  const [todayDiaries, setTodayDiaries] = useState([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState({ diary: [], doc: [], todo: [] });
  const [selectedMonth, setSelectedMonth] = useState(() => dayjs().startOf('month'));
  const [pinnedDocIds, setPinnedDocIds] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(PINNED_DOC_KEY) || '[]');
      return Array.isArray(stored) ? stored.slice(0, 5) : [];
    } catch {
      return [];
    }
  });
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingTodos, setLoadingTodos] = useState(true);
  const [loadingTree, setLoadingTree] = useState(true);
  const [loadingWeather, setLoadingWeather] = useState(true);

  useEffect(() => {
    let alive = true;
    const today = dayjs().format('YYYY-MM-DD');

    Promise.allSettled([noteApi.stats(), todoApi.list()]).then(([statsResult, todosResult]) => {
      if (!alive) return;
      if (statsResult.status === 'fulfilled') setStats(statsResult.value.data);
      if (todosResult.status === 'fulfilled') setTodos(todosResult.value.data || []);
      setLoadingStats(false);
      setLoadingTodos(false);
    });

    Promise.allSettled([
      noteApi.diaryTree(),
      noteApi.list({ note_type: 'diary', note_date: today }),
    ]).then(([treeResult, todayResult]) => {
      if (!alive) return;
      if (treeResult.status === 'fulfilled') setDiaryTree(treeResult.value.data || {});
      if (todayResult.status === 'fulfilled') setTodayDiaries(todayResult.value.data || []);
      setLoadingTree(false);
    });

    getWeather().then((result) => {
      if (alive) setWeather(result || null);
    }).catch(() => {}).finally(() => {
      if (alive) setLoadingWeather(false);
    });

    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const query = searchKeyword.trim();
    if (!query) {
      setSearchResults({ diary: [], doc: [], todo: [] });
      setSearchLoading(false);
      return undefined;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const [diaries, docs, todoItems] = await Promise.all([
          noteApi.search({ q: query, note_type: 'diary', limit: 5 }),
          noteApi.search({ q: query, note_type: 'doc', limit: 5 }),
          todoApi.list({ include_completed: true, keyword: query }),
        ]);
        setSearchResults({
          diary: diaries.data || [],
          doc: docs.data || [],
          todo: (todoItems.data || []).slice(0, 5),
        });
      } catch {
        setSearchResults({ diary: [], doc: [], todo: [] });
      } finally {
        setSearchLoading(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  const now = dayjs();
  const solar = Solar.fromDate(new Date());
  const lunar = solar.getLunar();
  const lunarText = `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
  const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const pendingTodos = useMemo(() => todos.filter((todo) => !todo.is_completed), [todos]);
  const completedTodos = todos.length - pendingTodos.length;

  const diaryDates = useMemo(() => {
    const dates = new Set();
    Object.values(diaryTree).forEach((months) => {
      Object.values(months).forEach((days) => days.forEach((item) => dates.add(item.date)));
    });
    return dates;
  }, [diaryTree]);

  const streakDays = useMemo(() => {
    let count = 0;
    let date = dayjs();
    while (diaryDates.has(date.format('YYYY-MM-DD'))) {
      count += 1;
      date = date.subtract(1, 'day');
    }
    return count;
  }, [diaryDates]);

  const monthKey = selectedMonth.format('YYYY-MM-');
  const monthWrittenDays = useMemo(
    () => Array.from(diaryDates).filter((date) => date.startsWith(monthKey)).length,
    [diaryDates, monthKey]
  );
  const monthTotalDays = selectedMonth.daysInMonth();
  const monthRate = Math.round((monthWrittenDays / monthTotalDays) * 100);
  const canGoNextMonth = selectedMonth.isBefore(dayjs().startOf('month'), 'month');
  const monthCells = useMemo(() => {
    const start = selectedMonth.startOf('month');
    const cells = Array.from({ length: (start.day() + 6) % 7 }, (_, index) => ({ key: `blank-${index}`, blank: true }));
    for (let day = 1; day <= start.daysInMonth(); day += 1) {
      const date = start.date(day).format('YYYY-MM-DD');
      cells.push({ key: date, day, date, written: diaryDates.has(date), today: date === dayjs().format('YYYY-MM-DD') });
    }
    return cells;
  }, [diaryDates, selectedMonth]);

  const todayDiaryWords = useMemo(
    () => todayDiaries.reduce((total, diary) => total + (diary.word_count || 0), 0),
    [todayDiaries]
  );

  const recentDocs = useMemo(() => {
    const documents = stats?.recent_docs || [];
    const pinOrder = new Map(pinnedDocIds.map((id, index) => [id, index]));
    return [...documents].sort((left, right) => {
      const leftPinned = pinOrder.has(left.id);
      const rightPinned = pinOrder.has(right.id);
      if (leftPinned && rightPinned) return pinOrder.get(left.id) - pinOrder.get(right.id);
      if (leftPinned) return -1;
      if (rightPinned) return 1;
      return 0;
    });
  }, [pinnedDocIds, stats]);

  const searchResultCount = searchResults.diary.length + searchResults.doc.length + searchResults.todo.length;

  const togglePin = (id) => {
    setPinnedDocIds((previous) => {
      const next = previous.includes(id) ? previous.filter((item) => item !== id) : [id, ...previous].slice(0, 5);
      try { localStorage.setItem(PINNED_DOC_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const completeTodo = async (todo) => {
    setTodos((previous) => previous.map((item) => item.id === todo.id ? { ...item, is_completed: true } : item));
    try {
      await todoApi.update(todo.id, { is_completed: true });
      message.success('已完成');
    } catch {
      setTodos((previous) => previous.map((item) => item.id === todo.id ? todo : item));
      message.error('更新待办失败');
    }
  };

  const openFirstSearchResult = () => {
    if (searchResults.diary[0]) navigate(`/diary/${searchResults.diary[0].id}`);
    else if (searchResults.doc[0]) navigate(`/doc/${searchResults.doc[0].id}`);
    else if (searchResults.todo[0]) navigate('/todo');
  };

  const renderSearchGroup = (label, icon, items, type) => {
    if (!items.length) return null;
    return (
      <div className="home-v2-search-group">
        <div className="home-v2-search-label">{icon}<span>{label}</span></div>
        <div>
          {items.slice(0, 4).map((item) => (
            <button
              key={`${type}-${item.id}`}
              onClick={() => navigate(type === 'todo' ? '/todo' : `/${type}/${item.id}`)}
            >
              <span>{type === 'todo' && item.is_completed ? '已完成 · ' : ''}{item.title || item.content || '无标题'}</span>
              <ArrowRightOutlined />
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="home-page home-workspace">
      <div className="home-v2-shell">
        <section className="home-v2-hero">
          <div className="home-v2-hero-top">
            <div>
              <span className="home-v2-eyebrow">{now.format('M月D日')} · {weekDays[now.day()]} · 农历{lunarText}</span>
              <h1>{getGreeting(now.hour())}，欢迎回到知识笔记</h1>
              <p>翻开最近的内容，或者从一个新的想法开始。</p>
            </div>
            <div className="home-v2-weather" aria-label="天气">
              {loadingWeather ? <span className="home-v2-weather-loading" /> : weather ? (
                <><b>{weather.icon}</b><strong>{weather.temp}°</strong><span>{weather.text}<small>{weather.city}</small></span></>
              ) : <span>{now.format('HH:mm')}</span>}
            </div>
          </div>

          <div className="home-v2-search-wrap">
            <SearchOutlined />
            <input
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') openFirstSearchResult(); }}
              placeholder="搜索日记、文档和待办…"
            />
            {searchKeyword && <button onClick={() => setSearchKeyword('')} aria-label="清空搜索">×</button>}
            {searchKeyword.trim() && (
              <div className="home-v2-search-panel">
                {searchLoading ? <div className="home-v2-search-state">正在搜索…</div> : searchResultCount ? (
                  <>
                    {renderSearchGroup('日记', <FormOutlined />, searchResults.diary, 'diary')}
                    {renderSearchGroup('文档', <FileTextOutlined />, searchResults.doc, 'doc')}
                    {renderSearchGroup('待办', <CheckSquareOutlined />, searchResults.todo, 'todo')}
                  </>
                ) : <div className="home-v2-search-state">没有找到相关内容</div>}
              </div>
            )}
          </div>

          <div className="home-v2-actions">
            <button className="primary" onClick={() => navigate('/diary?action=today')}>
              <span className="home-v2-action-icon"><FormOutlined /></span>
              <span><strong>写今日日记</strong><small>{todayDiaries.length ? '继续记录今天' : '从此刻开始记录'}</small></span>
              <ArrowRightOutlined />
            </button>
            <button onClick={() => navigate('/doc?action=new')}>
              <span className="home-v2-action-icon"><FileTextOutlined /></span>
              <span><strong>新建文档</strong><small>整理知识与想法</small></span>
              <ArrowRightOutlined />
            </button>
            <button onClick={() => navigate('/todo?action=new')}>
              <span className="home-v2-action-icon"><CheckSquareOutlined /></span>
              <span><strong>添加待办</strong><small>{pendingTodos.length ? `${pendingTodos.length} 项等待完成` : '安排下一件事'}</small></span>
              <ArrowRightOutlined />
            </button>
          </div>
        </section>

        <div className="home-v2-content-head">
          <div><span>你的知识空间</span><h2>最近与今天</h2></div>
          <p>继续尚未完成的思考，也照顾好今天要做的事。</p>
        </div>

        <div className="home-v2-layout">
          <div className="home-v2-main">
            <section className="home-card home-v2-panel">
              <header className="home-v2-panel-header">
                <div><span>最近打开</span><h2>继续你的工作</h2></div>
                <button onClick={() => navigate('/doc')}>全部文档 <ArrowRightOutlined /></button>
              </header>
              {loadingStats ? <div className="home-v2-list-skeleton"><i /><i /><i /></div> : recentDocs.length ? (
                <div className="home-v2-doc-list">
                  {recentDocs.slice(0, 6).map((doc) => (
                    <div key={doc.id} className="home-v2-doc-row" onClick={() => navigate(`/doc/${doc.id}`)}>
                      <span className="home-v2-doc-icon"><FileTextOutlined /></span>
                      <div><strong>{doc.title || '无标题'}</strong><small><ClockCircleOutlined /> {formatRelativeTime(doc.updated_at)}</small></div>
                      <button
                        className={pinnedDocIds.includes(doc.id) ? 'active' : ''}
                        onClick={(event) => { event.stopPropagation(); togglePin(doc.id); }}
                        title={pinnedDocIds.includes(doc.id) ? '取消固定' : '固定到顶部'}
                      >
                        {pinnedDocIds.includes(doc.id) ? <PushpinFilled /> : <PushpinOutlined />}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="home-v2-empty"><FileTextOutlined /><strong>还没有文档</strong><button onClick={() => navigate('/doc?action=new')}>创建第一篇</button></div>
              )}
            </section>

            <section className="home-card home-v2-panel">
              <header className="home-v2-panel-header">
                <div><span>今日计划</span><h2>接下来要做</h2></div>
                <button onClick={() => navigate('/todo')}>管理待办 <ArrowRightOutlined /></button>
              </header>
              {loadingTodos ? <div className="home-v2-list-skeleton"><i /><i /><i /></div> : pendingTodos.length ? (
                <div className="home-v2-todo-list">
                  {pendingTodos.slice(0, 5).map((todo) => (
                    <div key={todo.id} className="home-v2-todo-row">
                      <button className="home-v2-todo-check" onClick={() => completeTodo(todo)} title="标记为完成"><CheckOutlined /></button>
                      <span className={`home-v2-priority priority-${todo.priority}`} />
                      <strong>{todo.content}</strong>
                      {todo.due_at && <small className={dayjs(todo.due_at).isBefore(dayjs()) ? 'overdue' : ''}><CalendarOutlined /> {dayjs(todo.due_at).format('MM-DD HH:mm')}</small>}
                    </div>
                  ))}
                  {pendingTodos.length > 5 && <button className="home-v2-more" onClick={() => navigate('/todo')}>还有 {pendingTodos.length - 5} 项待办</button>}
                </div>
              ) : (
                <div className="home-v2-empty compact"><CheckOutlined /><strong>今天没有待办</strong><span>享受片刻清闲，或者安排一件新事情。</span><button onClick={() => navigate('/todo?action=new')}>添加待办</button></div>
              )}
            </section>
          </div>

          <aside className="home-v2-side">
            <section className="home-card home-v2-overview">
              <header><span>今日概览</span><b>{now.format('YYYY.MM.DD')}</b></header>
              <div className="home-v2-stats">
                <div><strong>{loadingStats ? '—' : todayDiaryWords}</strong><span>今日字数</span></div>
                <div><strong>{loadingTree ? '—' : streakDays}</strong><span>连续记录</span></div>
                <div><strong>{loadingTodos ? '—' : completedTodos}</strong><span>完成待办</span></div>
              </div>
              <div className="home-v2-library-stats">
                <span><FileTextOutlined /> 知识库</span>
                <b>{loadingStats ? '—' : `${stats?.doc_count || 0} 文档 · ${stats?.diary_count || 0} 日记`}</b>
              </div>
            </section>

            <section className="home-card home-v2-calendar">
              <header className="home-v2-panel-header">
                <div><span>记录节奏</span><h2>{selectedMonth.format('YYYY年M月')}</h2></div>
                <div className="home-v2-month-nav">
                  <button onClick={() => setSelectedMonth((month) => month.subtract(1, 'month'))}>‹</button>
                  <button disabled={!canGoNextMonth} onClick={() => setSelectedMonth((month) => month.add(1, 'month'))}>›</button>
                </div>
              </header>
              <div className="home-v2-progress"><span style={{ width: `${monthRate}%` }} /></div>
              <div className="home-v2-progress-label"><span>本月记录 {monthWrittenDays} 天</span><b>{monthRate}%</b></div>
              {loadingTree ? <div className="home-v2-calendar-loading" /> : (
                <>
                  <div className="home-v2-weekdays">{['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day}>{day}</span>)}</div>
                  <div className="home-v2-calendar-grid">
                    {monthCells.map((cell) => (
                      <span key={cell.key} className={`${cell.blank ? 'blank' : ''} ${cell.written ? 'written' : ''} ${cell.today ? 'today' : ''}`} title={cell.date || ''}>
                        {cell.day || ''}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
