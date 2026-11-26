import { useEffect, useState } from 'react';
import { Alert, Button, DatePicker, Space, Spin } from 'antd';
import { ArrowRightOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api, chinaNow, gradeLabels, dayLabels } from './api';
import DayDrawer from './DayDrawer';

export default function HomePage() {
  const [month, setMonth] = useState(() => chinaNow().startOf('month'));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [selectedDate, setSelectedDate] = useState(null);
  useEffect(() => {
    let alive = true;
    setError(''); setData(null);
    api(`calendar?year=${month.year()}&month=${month.month()+1}`).then(value => {if(alive) setData(value);}).catch(e => {if(alive) setError(e.message);});
    return () => {alive = false;};
  }, [month, refresh]);
  useEffect(() => {
    const timer = setInterval(() => setRefresh(v=>v+1), 60000);
    const refreshOnFocus = () => setRefresh(v=>v+1);
    window.addEventListener('focus', refreshOnFocus);
    return () => {clearInterval(timer); window.removeEventListener('focus', refreshOnFocus);};
  }, []);
  const stats = data?.summary;
  const blanks = (month.startOf('month').day() + 6) % 7;
  return <main className="discipline-home">
    <header className="home-greeting"><div><p className="eyebrow">把每一天，过成自己的节奏</p><h1>自律养成</h1><p className="muted">安排主要活动，诚实评价执行情况，让长期变化清晰可见。</p></div><a className="home-primary" href="/discipline/plan">记录今天 <ArrowRightOutlined /></a></header>
    {error && <Alert type="error" title={error} action={<Button onClick={()=>setRefresh(v=>v+1)}>重试</Button>} />}
    {!data && !error && <div className="loading"><Spin/></div>}
    {data && <>
      <section className="home-metrics">
        {[['本月平均达成率', stats.average_rate === null ? '—' : `${stats.average_rate}%`, `${stats.counted_days} 个已统计工作日`], ['执行良好',stats.good_days,'达成率 ≥ 75%'], ['有待改进',stats.improve_days,'40% ≤ 达成率 < 75%'], ['执行失败',stats.failed_days,'达成率 < 40%']].map(([title,value,detail],index) => <article className={`metric-card metric-${index}`} key={title}><span>{title}</span><strong>{value}</strong><small>{detail}</small></article>)}
      </section>
      <section className="achievement-calendar">
        <div className="calendar-toolbar"><div><h2>执行日历</h2><p className="muted">点击日期查看当天安排与记录</p></div><Space size={6}><Button aria-label="上个月" icon={<LeftOutlined/>} onClick={()=>setMonth(month.subtract(1,'month'))}/><DatePicker picker="month" allowClear={false} value={month} onChange={value=>setMonth(value.startOf('month'))}/><Button aria-label="下个月" icon={<RightOutlined/>} onClick={()=>setMonth(month.add(1,'month'))}/><Button onClick={()=>setMonth(chinaNow().startOf('month'))}>本月</Button></Space></div>
        {!data.calendar_supported && <Alert type="info" title="该年份节假日表尚未维护，暂停达成率统计"/>}
        <div className="calendar-legend">{[['good','执行良好'],['improve','有待改进'],['failed','执行失败'],['excluded','周末 / 节假日'],['pending','待记录 / 未开始']].map(([grade,label])=><span key={grade}><i className={`legend-dot grade-${grade}`}/>{label}</span>)}</div>
        <div className="calendar-grid">
          {['一','二','三','四','五','六','日'].map(day=><div className="calendar-weekday" key={day}>周{day}</div>)}
          {Array.from({length:blanks},(_,index)=><div className="calendar-blank" key={`blank${index}`}/>)}
          {data.days.map(day=><button type="button" key={day.date} onClick={()=>setSelectedDate(day.date)} className={`calendar-day grade-${day.grade}${day.is_today ? ' calendar-today' : ''}`} aria-label={`${day.date} ${dayLabels[day.day_type]} ${gradeLabels[day.grade]}${day.rate === null ? '' : ` ${day.rate}%`}`}>
            <span className="calendar-day-number">{Number(day.date.slice(-2))}{day.is_today && <b>今天</b>}</span>
            <strong>{day.rate === null ? (day.day_type === 'workday' ? '—' : dayLabels[day.day_type]) : `${day.rate}%`}</strong>
            <small>{day.grade === 'excluded' ? '不计入' : gradeLabels[day.grade]}</small>
            {day.is_today && day.rate !== null && <small>截至当前</small>}
          </button>)}
        </div>
        <p className="calendar-note">北京时间 · 周一至周五扣除节假日，周末调休上班日也不计入。{data.started_on ? `自 ${data.started_on} 首次记录后，漏记工作日按 0% 保留。` : '首次保存前的日期不计入统计。'}历史记录仅供查看。</p>
      </section>
      <section className="home-rule"><h2>怎样计算达成率</h2><p>在默认作息或当天安排中，自主选择参与统计的时段。符合主题计 100%，部分符合计 50%，偏离主题计 0%；未评价暂计 0%，所有参与时段等权平均。</p><p>当天可持续更新；跨过北京时间零点后锁定。未选择任何统计时段的日期不计入平均值，周末和节假日仍可记录。</p></section>
    </>}
    <DayDrawer date={selectedDate} onClose={()=>setSelectedDate(null)}/>
  </main>;
}
