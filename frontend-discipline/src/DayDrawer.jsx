import { useEffect, useState } from 'react';
import { Alert, Button, Drawer, Spin } from 'antd';
import { api, dayLabels, gradeLabels } from './api';
import PlanSlots from './PlanSlots';

export default function DayDrawer({ date, onClose }) {
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!date) return;
    let alive = true;
    setPlan(null); setError('');
    api(`days/${date}`).then(value=>{if(alive) setPlan({...value, loadedDate:date});}).catch(e=>{if(alive) setError(e.message);});
    return ()=>{alive=false;};
  }, [date, retry]);
  const ready = plan?.loadedDate === date;
  return <Drawer title={`${date || ''} · 当日记录`} open={!!date} onClose={onClose} size="min(640px, 78vw)" className="day-drawer" destroyOnHidden>
    {error && <Alert type="error" title={error} action={<Button onClick={()=>setRetry(v=>v+1)}>重试</Button>}/>}
    {!ready && !error && <div className="loading"><Spin/></div>}
    {ready && <><div className={`drawer-summary score-${plan.achievement.grade}`}><div><p className="eyebrow">{dayLabels[plan.day_type]}</p><h2>{gradeLabels[plan.achievement.grade]}</h2><p className="muted">{plan.achievement.selected} 个统计时段 · {plan.achievement.evaluated} 个已评价</p></div><strong>{plan.achievement.rate === null ? '—' : `${plan.achievement.rate}%`}</strong></div>
      <PlanSlots slots={plan.slots}/><p className="plan-footnote">此处查看日期快照；当天内容可在每日计划中记录。</p></>}
  </Drawer>;
}
