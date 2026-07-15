import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRightOutlined,
  AuditOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  FileSearchOutlined,
  FormOutlined,
  FundOutlined,
  PlusOutlined,
  ProjectOutlined,
  RiseOutlined,
  SafetyCertificateOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { researchApi, tradeApi, tradePlanApi } from '../api';
import { formatInstrumentDisplay } from '../features/trading/display';
import './TradingHome.css';

const ACTIVE_PLAN_STATUSES = new Set(['draft', 'active', 'triggered']);
const PLAN_STATUS_LABELS = {
  draft: '草稿',
  active: '进行中',
  triggered: '已触发',
  executed: '已执行',
  cancelled: '已取消',
  expired: '已过期',
  reviewed: '已复盘',
};

function formatMoney(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number);
}

function pnlClass(value) {
  const number = Number(value || 0);
  if (number > 0) return 'positive';
  if (number < 0) return 'negative';
  return '';
}

function relativeDate(value) {
  const date = dayjs(value);
  if (!date.isValid()) return '-';
  if (date.isSame(dayjs(), 'day')) return `今天 ${date.format('HH:mm')}`;
  if (date.isSame(dayjs().subtract(1, 'day'), 'day')) return `昨天 ${date.format('HH:mm')}`;
  return date.format('MM-DD HH:mm');
}

function HomeSkeleton({ rows = 3 }) {
  return <div className="trading-home-skeleton">{Array.from({ length: rows }, (_, index) => <i key={index} />)}</div>;
}

export default function TradingHome() {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [trades, setTrades] = useState([]);
  const [plans, setPlans] = useState([]);
  const [researchDocs, setResearchDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      tradeApi.analytics(),
      tradeApi.list({ page: 1, size: 7 }),
      tradePlanApi.list({ page: 1, size: 20 }),
      researchApi.documents.list({ page: 1, size: 4 }),
    ]).then(([analyticsResult, tradesResult, plansResult, researchResult]) => {
      if (!alive) return;
      if (analyticsResult.status === 'fulfilled') setAnalytics(analyticsResult.value.data || null);
      if (tradesResult.status === 'fulfilled') setTrades(tradesResult.value.data || []);
      if (plansResult.status === 'fulfilled') setPlans(plansResult.value.data || []);
      if (researchResult.status === 'fulfilled') setResearchDocs(researchResult.value.data?.items || []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const overview = analytics?.overview || {};
  const coverage = analytics?.coverage || {};
  const positions = analytics?.positions?.open_positions || [];
  const activePlans = useMemo(
    () => plans.filter((plan) => ACTIVE_PLAN_STATUSES.has(plan.status)),
    [plans]
  );
  const overduePlans = activePlans.filter((plan) => plan.plan_date && dayjs(plan.plan_date).isBefore(dayjs(), 'day'));
  const missingReviews = Math.max(0, Number(overview.total_trades || 0) - Number(coverage.trade_review_count || 0));

  const currentMonthPnl = useMemo(() => {
    const key = dayjs().format('YYYY-MM');
    const row = (analytics?.time_series?.monthly || []).find((item) => String(item.bucket || item.key || item.period || item.date) === key);
    return Number(row?.total_pnl ?? row?.pnl ?? 0);
  }, [analytics]);

  const attentionItems = [
    overduePlans.length ? {
      icon: <CalendarOutlined />,
      tone: 'warning',
      title: `${overduePlans.length} 个计划已过计划日`,
      detail: '检查是否需要执行、延期或关闭',
      action: () => navigate('/plans'),
    } : null,
    missingReviews ? {
      icon: <AuditOutlined />,
      tone: 'primary',
      title: `${missingReviews} 笔交易尚未复盘`,
      detail: `当前复盘覆盖率 ${Number(coverage.trade_review_rate || 0).toFixed(0)}%`,
      action: () => navigate('/trades'),
    } : null,
    coverage.source_missing_count ? {
      icon: <ExclamationCircleOutlined />,
      tone: 'muted',
      title: `${coverage.source_missing_count} 笔交易缺少来源信息`,
      detail: '补全来源有助于后续归因分析',
      action: () => navigate('/trades'),
    } : null,
  ].filter(Boolean);

  const todayLabel = `${dayjs().format('YYYY年M月D日')} · 星期${'日一二三四五六'[dayjs().day()]}`;

  return (
    <div className="trading-home">
      <div className="trading-home-shell">
        <header className="trading-home-header">
          <div>
            <span className="trading-home-date">{todayLabel}</span>
            <h1>交易工作台</h1>
            <p>看清当前状态，处理今天最重要的交易事项。</p>
          </div>
          <button className="trading-home-create" onClick={() => navigate('/trades/new')}>
            <PlusOutlined /> 记录一笔交易
          </button>
        </header>

        <nav className="trading-home-shortcuts" aria-label="快捷入口">
          <button onClick={() => navigate('/plans')}>
            <span><ProjectOutlined /></span><div><strong>交易计划</strong><small>{activePlans.length} 个待处理</small></div><ArrowRightOutlined />
          </button>
          <button onClick={() => navigate('/research')}>
            <span><FileSearchOutlined /></span><div><strong>研究资料</strong><small>继续完善交易逻辑</small></div><ArrowRightOutlined />
          </button>
          <button onClick={() => navigate('/dashboard')}>
            <span><FundOutlined /></span><div><strong>绩效分析</strong><small>查看完整统计与归因</small></div><ArrowRightOutlined />
          </button>
        </nav>

        <section className="trading-home-overview">
          <div>
            <span>当前持仓</span>
            <strong>{loading ? '—' : positions.length}</strong>
            <small>个品种方向</small>
          </div>
          <div>
            <span>本月净利润</span>
            <strong className={pnlClass(currentMonthPnl)}>{loading ? '—' : formatMoney(currentMonthPnl)}</strong>
            <small>已平仓交易汇总</small>
          </div>
          <div>
            <span>交易胜率</span>
            <strong>{loading ? '—' : `${Number(overview.win_rate || 0).toFixed(1)}%`}</strong>
            <small>{overview.closed_trades || 0} 笔已平仓</small>
          </div>
          <div>
            <span>待执行计划</span>
            <strong>{loading ? '—' : activePlans.length}</strong>
            <small>{overduePlans.length ? `${overduePlans.length} 个已过期` : '暂无过期计划'}</small>
          </div>
        </section>

        <div className="trading-home-grid">
          <main className="trading-home-main">
            <section className="trading-home-section">
              <div className="trading-home-section-head">
                <div><span>风险敞口</span><h2>当前持仓</h2></div>
                <button onClick={() => navigate('/trades')}>查看持仓 <ArrowRightOutlined /></button>
              </div>
              {loading ? <HomeSkeleton rows={2} /> : positions.length ? (
                <div className="trading-home-position-list">
                  {positions.slice(0, 6).map((position, index) => (
                    <div key={`${position.symbol}-${position.contract}-${position.side}-${index}`}>
                      <span className={`trading-home-side ${position.side === '做空' ? 'short' : 'long'}`}>{position.side}</span>
                      <div>
                        <strong>{formatInstrumentDisplay(position.symbol, position.contract)}</strong>
                        <small>均价 {position.avg_open_price ?? '-'} · {position.open_since ? `${position.open_since} 建仓` : '持仓中'}</small>
                      </div>
                      <SwapOutlined />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="trading-home-empty"><SafetyCertificateOutlined /><strong>当前没有持仓</strong><span>风险敞口已清空，可以从交易计划开始。</span></div>
              )}
            </section>

            <section className="trading-home-section">
              <div className="trading-home-section-head">
                <div><span>最近活动</span><h2>交易记录</h2></div>
                <button onClick={() => navigate('/trades')}>全部记录 <ArrowRightOutlined /></button>
              </div>
              {loading ? <HomeSkeleton rows={5} /> : trades.length ? (
                <div className="trading-home-trades">
                  {trades.map((trade) => (
                    <button key={trade.id} onClick={() => navigate(`/trades/${trade.id}/edit`)}>
                      <span className={`trading-home-direction ${trade.direction === '做空' ? 'short' : 'long'}`}>{trade.direction || '-'}</span>
                      <div><strong>{formatInstrumentDisplay(trade.symbol, trade.contract)}</strong><small>{relativeDate(trade.open_time)} · {trade.source_display || '手动记录'}</small></div>
                      <span className="trading-home-trade-status">{trade.status === 'open' ? '持仓中' : trade.has_trade_review ? '已复盘' : '待复盘'}</span>
                      <b className={pnlClass(trade.pnl)}>{trade.status === 'open' ? '—' : formatMoney(trade.pnl)}</b>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="trading-home-empty"><FormOutlined /><strong>还没有交易记录</strong><button onClick={() => navigate('/trades/new')}>记录第一笔交易</button></div>
              )}
            </section>

            {researchDocs.length ? (
              <section className="trading-home-section trading-home-research">
                <div className="trading-home-section-head">
                  <div><span>交易认知</span><h2>最近研究</h2></div>
                  <button onClick={() => navigate('/research')}>进入研究 <ArrowRightOutlined /></button>
                </div>
                <div className="trading-home-research-list">
                  {researchDocs.map((doc) => (
                    <button key={doc.id} onClick={() => navigate('/research')}>
                      <FileSearchOutlined />
                      <span><strong>{doc.title || '无标题'}</strong><small>{doc.word_count || 0} 字 · {relativeDate(doc.updated_at)}</small></span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </main>

          <aside className="trading-home-side-column">
            <section className="trading-home-aside trading-home-plans">
              <div className="trading-home-section-head">
                <div><span>执行准备</span><h2>近期计划</h2></div>
                <button onClick={() => navigate('/plans')}>管理</button>
              </div>
              {loading ? <HomeSkeleton rows={3} /> : activePlans.length ? (
                <div className="trading-home-plan-list">
                  {activePlans.slice(0, 5).map((plan) => (
                    <button key={plan.id} onClick={() => navigate('/plans')}>
                      <span className={`trading-home-plan-priority ${plan.priority || 'medium'}`} />
                      <div><strong>{plan.title || `交易计划 #${plan.id}`}</strong><small>{plan.symbol || '未指定品种'} · {plan.plan_date || '-'}</small></div>
                      <em>{PLAN_STATUS_LABELS[plan.status] || plan.status}</em>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="trading-home-empty compact"><CheckCircleOutlined /><strong>没有待处理计划</strong><button onClick={() => navigate('/plans')}>创建计划</button></div>
              )}
            </section>

            <section className="trading-home-aside trading-home-attention">
              <div className="trading-home-section-head">
                <div><span>需要关注</span><h2>今日提醒</h2></div>
              </div>
              {loading ? <HomeSkeleton rows={2} /> : attentionItems.length ? (
                <div className="trading-home-attention-list">
                  {attentionItems.map((item) => (
                    <button key={item.title} onClick={item.action}>
                      <span className={item.tone}>{item.icon}</span>
                      <div><strong>{item.title}</strong><small>{item.detail}</small></div>
                      <ArrowRightOutlined />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="trading-home-empty compact"><CheckCircleOutlined /><strong>当前没有需要处理的提醒</strong><span>交易记录和计划状态都很完整。</span></div>
              )}
            </section>

            <button className="trading-home-analysis-link" onClick={() => navigate('/dashboard')}>
              <span><RiseOutlined /></span>
              <div><strong>打开完整绩效分析</strong><small>权益曲线、盈亏分布、行为与归因分析</small></div>
              <ArrowRightOutlined />
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}
