import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { noteApi, todoApi } from '../api';
import { getWeather } from '../utils/weather';
import { Lunar, Solar } from 'lunar-javascript';
import dayjs from 'dayjs';

export default function HomePage() {
  const navigate = useNavigate();
  const PINNED_DOC_KEY = 'notes-home-pinned-docs';

  // ---- State ----
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
      const arr = JSON.parse(localStorage.getItem(PINNED_DOC_KEY) || '[]');
      return Array.isArray(arr) ? arr.slice(0, 5) : [];
    } catch { return []; }
  });

  // 分区块 loading
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingTodos, setLoadingTodos] = useState(true);
  const [loadingTree, setLoadingTree] = useState(true);
  const [loadingWeather, setLoadingWeather] = useState(true);

  // ---- 分优先级加载 ----
  useEffect(() => {
    let alive = true;
    const todayStr = dayjs().format('YYYY-MM-DD');

    // P1: stats + todos
    Promise.allSettled([
      noteApi.stats(),
      todoApi.list(),
    ]).then(([statsRes, todosRes]) => {
      if (!alive) return;
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
      if (todosRes.status === 'fulfilled') setTodos(todosRes.value.data || []);
      setLoadingStats(false);
      setLoadingTodos(false);
    });

    // P2: diaryTree + todayDiaries (微延迟)
    setTimeout(() => {
      if (!alive) return;
      Promise.allSettled([
        noteApi.diaryTree(),
        noteApi.list({ note_type: 'diary', note_date: todayStr }),
      ]).then(([treeRes, todayRes]) => {
        if (!alive) return;
        if (treeRes.status === 'fulfilled') setDiaryTree(treeRes.value.data || {});
        if (todayRes.status === 'fulfilled') setTodayDiaries(todayRes.value.data || []);
        setLoadingTree(false);
      });
    }, 50);

    // P3: weather (延迟加载)
    setTimeout(() => {
      if (!alive) return;
      Promise.allSettled([getWeather()]).then(([weatherRes]) => {
        if (!alive) return;
        if (weatherRes.status === 'fulfilled') setWeather(weatherRes.value || null);
        setLoadingWeather(false);
      });
    }, 300);

    return () => { alive = false; };
  }, []);

  // ---- 搜索 ----
  useEffect(() => {
    const q = searchKeyword.trim();
    if (!q) {
      setSearchResults({ diary: [], doc: [], todo: [] });
      setSearchLoading(false);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setSearchLoading(true);
        const [d1, d2, d3] = await Promise.all([
          noteApi.search({ q, note_type: 'diary', limit: 6 }),
          noteApi.search({ q, note_type: 'doc', limit: 6 }),
          todoApi.list({ include_completed: true, keyword: q }),
        ]);
        setSearchResults({
          diary: d1.data || [],
          doc: d2.data || [],
          todo: (d3.data || []).slice(0, 6),
        });
      } catch {
        setSearchResults({ diary: [], doc: [], todo: [] });
      } finally {
        setSearchLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [searchKeyword]);

  // ---- 计算属性 ----
  const now = dayjs();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const solar = Solar.fromDate(new Date());
  const lunar = solar.getLunar();
  const lunarStr = `${lunar.getYearInGanZhi()}年 ${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
  const dateStr = `${now.format('YYYY年M月D日')} 星期${weekdays[now.day()]}`;

  const pendingTodos = todos.filter((t) => !t.is_completed);
  const diaryDates = useMemo(() => {
    const set = new Set();
    Object.values(diaryTree).forEach((months) => {
      Object.values(months).forEach((days) => {
        days.forEach((n) => set.add(n.date));
      });
    });
    return set;
  }, [diaryTree]);

  const streakDays = useMemo(() => {
    let count = 0;
    let d = dayjs();
    while (diaryDates.has(d.format('YYYY-MM-DD'))) {
      count += 1;
      d = d.subtract(1, 'day');
    }
    return count;
  }, [diaryDates]);

  const monthLabel = selectedMonth.format('YYYY年M月');
  const monthKey = selectedMonth.format('YYYY-MM-');
  const monthTotalDays = selectedMonth.daysInMonth();
  const monthWrittenDays = useMemo(
    () => Array.from(diaryDates).filter((d) => d.startsWith(monthKey)).length,
    [diaryDates, monthKey]
  );
  const monthRate = monthTotalDays ? Math.round((monthWrittenDays / monthTotalDays) * 100) : 0;
  const todayStr = now.format('YYYY-MM-DD');
  const canGoNextMonth = selectedMonth.isBefore(dayjs().startOf('month'), 'month');
  const heatWeekDays = ['一', '二', '三', '四', '五', '六', '日'];
  const monthHeatCells = useMemo(() => {
    const monthStart = selectedMonth.startOf('month');
    const firstDayOffset = (monthStart.day() + 6) % 7;
    const cells = [];
    for (let i = 0; i < firstDayOffset; i++) {
      cells.push({ key: `blank-${i}`, empty: true });
    }
    for (let day = 1; day <= monthStart.daysInMonth(); day++) {
      const d = monthStart.date(day);
      const date = d.format('YYYY-MM-DD');
      cells.push({
        key: date,
        empty: false,
        day,
        date,
        has: diaryDates.has(date),
        today: date === todayStr,
      });
    }
    return cells;
  }, [selectedMonth, diaryDates, todayStr]);
  const todayDiaryWords = useMemo(
    () => (todayDiaries || []).reduce((sum, n) => sum + (n.word_count || 0), 0),
    [todayDiaries]
  );
  const todoDoneRate = useMemo(() => {
    const total = todos.length;
    if (!total) return 0;
    const done = todos.filter((t) => t.is_completed).length;
    return Math.round((done / total) * 100);
  }, [todos]);

  const sortedRecentDocs = useMemo(() => {
    const arr = stats?.recent_docs || [];
    const order = new Map(pinnedDocIds.map((id, idx) => [id, idx]));
    return [...arr].sort((a, b) => {
      const ap = order.has(a.id);
      const bp = order.has(b.id);
      if (ap && bp) return order.get(a.id) - order.get(b.id);
      if (ap) return -1;
      if (bp) return 1;
      return 0;
    });
  }, [stats, pinnedDocIds]);

  const togglePinDoc = (id) => {
    setPinnedDocIds((prev) => {
      const exists = prev.includes(id);
      const next = exists ? prev.filter((x) => x !== id) : [id, ...prev].slice(0, 5);
      try { localStorage.setItem(PINNED_DOC_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const openFirstSearchResult = () => {
    if (searchResults.diary[0]) { navigate(`/diary/${searchResults.diary[0].id}`); return; }
    if (searchResults.doc[0]) { navigate(`/doc/${searchResults.doc[0].id}`); return; }
    if (searchResults.todo[0]) navigate('/todo');
  };

  const switchMonth = (delta) => {
    setSelectedMonth((prev) => prev.add(delta, 'month').startOf('month'));
  };

  // ---- Render ----
  return (
    <div className="home-page">
      {/* Header: 日期 + 天气 */}
      <div className="home-header-card">
        <div className="home-header-left">
          <div className="home-date-solar">{dateStr}</div>
          <div className="home-date-lunar">{lunarStr}</div>
        </div>
        {!loadingWeather && weather && (
          <div className="home-header-weather">
            <span className="weather-icon-lg">{weather.icon}</span>
            <span className="weather-temp">{weather.temp}°C</span>
            <span className="weather-text">{weather.text}</span>
            <span className="weather-location">{weather.city}</span>
          </div>
        )}
        {loadingWeather && <div className="home-skeleton-inline" />}
      </div>

      <div className="home-dashboard">
        {/* 左栏 */}
        <div className="home-main-col">
          {/* KPI 卡片行 */}
          <div className="home-kpi-row">
            <div className="home-kpi-card">
              <div className="home-kpi-num">{loadingStats ? '-' : todayDiaryWords}</div>
              <div className="home-kpi-label">今日字数</div>
            </div>
            <div className="home-kpi-card">
              <div className="home-kpi-num">{loadingStats ? '-' : (stats?.diary_count || 0)}</div>
              <div className="home-kpi-label">日记总数</div>
            </div>
            <div className="home-kpi-card">
              <div className="home-kpi-num">{loadingStats ? '-' : (stats?.doc_count || 0)}</div>
              <div className="home-kpi-label">文档总数</div>
            </div>
            <div className="home-kpi-card">
              <div className="home-kpi-num">{loadingTodos ? '-' : `${todoDoneRate}%`}</div>
              <div className="home-kpi-label">待办完成率</div>
            </div>
          </div>

          {/* 快速入口卡片 */}
          <div className="home-card">
            <div className="home-card-title">快速入口</div>
            <div className="home-global-search">
              <input
                className="home-search-input"
                placeholder="搜索日记、文档、待办..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') openFirstSearchResult(); }}
              />
              {searchKeyword.trim() && (
                <div className="home-search-result-panel">
                  {searchLoading ? (
                    <div className="empty-hint">搜索中...</div>
                  ) : (
                    <>
                      {searchResults.diary.length > 0 && (
                        <div className="home-search-group">
                          <div className="home-search-group-title">日记</div>
                          {searchResults.diary.slice(0, 3).map((n) => (
                            <div key={`d-${n.id}`} className="home-search-item" onClick={() => navigate(`/diary/${n.id}`)}>
                              {n.title || '无标题'}
                            </div>
                          ))}
                        </div>
                      )}
                      {searchResults.doc.length > 0 && (
                        <div className="home-search-group">
                          <div className="home-search-group-title">文档</div>
                          {searchResults.doc.slice(0, 3).map((n) => (
                            <div key={`n-${n.id}`} className="home-search-item" onClick={() => navigate(`/doc/${n.id}`)}>
                              {n.title || '无标题'}
                            </div>
                          ))}
                        </div>
                      )}
                      {searchResults.todo.length > 0 && (
                        <div className="home-search-group">
                          <div className="home-search-group-title">待办</div>
                          {searchResults.todo.slice(0, 3).map((t) => (
                            <div key={`t-${t.id}`} className="home-search-item" onClick={() => navigate('/todo')}>
                              {t.is_completed ? '✅' : '⬜'} {t.content}
                            </div>
                          ))}
                        </div>
                      )}
                      {!searchResults.diary.length && !searchResults.doc.length && !searchResults.todo.length && (
                        <div className="empty-hint">无匹配结果</div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="home-quick-grid">
              <button className="home-action-btn primary" onClick={() => navigate('/diary?action=today')}>写今日日记</button>
              <button className="home-action-btn" onClick={() => navigate('/doc?action=new')}>新建文档</button>
              <button className="home-action-btn" onClick={() => navigate('/todo?action=new')}>新建待办</button>
            </div>
            <div className="home-inline-section">
              <div className="home-card-header">
                <div className="home-card-title">最近文档</div>
                <button className="home-card-link" onClick={() => navigate('/doc')}>查看全部</button>
              </div>
              {loadingStats ? (
                <div className="home-skeleton-list"><div className="home-skeleton-line" /><div className="home-skeleton-line" /></div>
              ) : sortedRecentDocs.length > 0 ? (
                <div className="home-recent-docs">
                  {sortedRecentDocs.slice(0, 5).map(doc => (
                    <div key={doc.id} className="home-recent-doc-item" onClick={() => navigate(`/doc/${doc.id}`)}>
                      <span className="home-recent-doc-title">{doc.title}</span>
                      <button
                        className={`home-pin-btn ${pinnedDocIds.includes(doc.id) ? 'active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); togglePinDoc(doc.id); }}
                        title={pinnedDocIds.includes(doc.id) ? '取消固定' : '固定'}
                      >
                        {pinnedDocIds.includes(doc.id) ? '★' : '☆'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-hint">暂无文档</div>
              )}
            </div>
          </div>

          {/* 待办摘要卡片 */}
          <div className="home-card">
            <div className="home-card-header">
              <div className="home-card-title">待办事项</div>
              <button className="home-card-link" onClick={() => navigate('/todo')}>查看全部</button>
            </div>
            {loadingTodos ? (
              <div className="home-skeleton-list"><div className="home-skeleton-line" /><div className="home-skeleton-line" /><div className="home-skeleton-line" /></div>
            ) : pendingTodos.length > 0 ? (
              <div className="home-todo-list">
                {pendingTodos.slice(0, 5).map((t) => (
                  <div key={t.id} className="home-todo-item">
                    <span className={`home-todo-dot priority-${t.priority}`} />
                    <span className="home-todo-text">{t.content}</span>
                    {t.due_at && <span className="home-todo-due">{dayjs(t.due_at).format('MM-DD')}</span>}
                  </div>
                ))}
                {pendingTodos.length > 5 && <div className="home-todo-more">还有 {pendingTodos.length - 5} 项...</div>}
              </div>
            ) : (
              <div className="empty-hint">暂无待办事项</div>
            )}
          </div>
        </div>

        {/* 右栏 */}
        <div className="home-side-col">
          {/* 连续记录卡片 */}
          <div className="home-card">
            <div className="home-card-header">
              <div className="home-card-title">写作连续性</div>
              <div className="home-month-switch">
                <button className="home-month-nav" onClick={() => switchMonth(-1)} aria-label="上个月">‹</button>
                <span className="home-month-label">{monthLabel}</span>
                <button className="home-month-nav" onClick={() => switchMonth(1)} disabled={!canGoNextMonth} aria-label="下个月">›</button>
              </div>
            </div>
            {loadingTree ? (
              <div className="home-skeleton-line" style={{ height: 140 }} />
            ) : (
              <>
                <div className="home-streak-row">
                  <div className="home-streak-num">{streakDays}</div>
                  <div className="home-streak-unit">天连续记录</div>
                </div>
                <div className="home-month-rate">{monthLabel} {monthRate}%（{monthWrittenDays}/{monthTotalDays}天）</div>
                <div className="home-heat-weekdays">
                  {heatWeekDays.map((w) => (
                    <span key={w} className="home-heat-weekday">{w}</span>
                  ))}
                </div>
                <div className="home-heat-grid month">
                  {monthHeatCells.map((cell) => (
                    <span
                      key={cell.key}
                      className={`home-heat-cell ${cell.empty ? 'blank' : ''} ${cell.has ? 'active' : ''} ${cell.today ? 'today' : ''}`}
                      title={cell.empty ? '' : cell.date}
                    >
                      {cell.empty ? '' : cell.day}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
