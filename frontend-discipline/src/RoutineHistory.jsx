import { useEffect, useState } from 'react';
import { Alert, Button, Empty, Modal, Space, Spin, Tabs, Tag } from 'antd';
import { api } from './api';
import PlanSlots from './PlanSlots';
import dayjs from 'dayjs';

export function RoutineScope() {
  return <div className="routine-scope"><p><strong>历史日期：</strong>不改写时段、评价、备注或达成率。</p><p><strong>当天：</strong>严格同步最新作息；保留时段的评价和备注继续保留，删除时段从当天移除，其原有内容留存在调整前快照。新建时段从未评价开始，当天达成率重新计算。</p><p><strong>未来日期：</strong>尚未生成记录，按届时最新作息展示和生成；查看未来日期不会创建记录。</p><p><strong>留存记录：</strong>每次保存保留作息新旧版本与当天同步前后快照。历史版本只读。</p></div>;
}

function RoutineSnapshot({ slots }) {
  if (!slots?.length) return <Empty description="没有时段"/>;
  return slots.map(slot=><div className="routine-snapshot-row" key={slot.id}><span>{slot.start}—{slot.end}</span><strong>{slot.theme}</strong><Tag>{slot.included ? '计入统计' : '不计入统计'}</Tag></div>);
}

function DaySnapshot({ plan }) {
  if (!plan) return <Empty description="该版本没有留存当天同步快照"/>;
  return <><p className="muted">{plan.today} · {plan.saved ? '已保存的当天记录' : '当时未保存的当天预览'} · {plan.achievement.rate === null ? '不统计' : `达成率 ${plan.achievement.rate}%`}</p><PlanSlots slots={plan.slots}/></>;
}

export default function RoutineHistory({ open, onClose }) {
  const [offset,setOffset]=useState(0);
  const [listing,setListing]=useState(null);
  const [selected,setSelected]=useState(null);
  const [detail,setDetail]=useState(null);
  const [listError,setListError]=useState('');
  const [detailError,setDetailError]=useState('');
  const [retry,setRetry]=useState(0);
  useEffect(()=>{if(!open) {setOffset(0);setSelected(null);setDetail(null);}},[open]);
  useEffect(()=>{
    if(!open) return;
    let alive=true;setListing(null);setListError('');setSelected(null);setDetail(null);
    api(`template/history?offset=${offset}&limit=10`).then(value=>{if(alive) {setListing(value);setSelected(value.items[0]?.revision ?? null);}}).catch(e=>{if(alive) setListError(e.message);});
    return ()=>{alive=false;};
  },[open,offset,retry]);
  useEffect(()=>{
    if(!open || selected===null) return;
    let alive=true;setDetail(null);setDetailError('');
    api(`template/history/${selected}`).then(value=>{if(alive) setDetail(value);}).catch(e=>{if(alive) setDetailError(e.message);});
    return ()=>{alive=false;};
  },[open,selected,retry]);
  const stamp=value=>value ? dayjs(value).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss') : '原调整时间未记录';
  const items=detail ? [
    {key:'after',label:'作息快照',children:<RoutineSnapshot slots={detail.slots}/>},
    ...(detail.before_slots ? [{key:'before',label:'调整前作息',children:<RoutineSnapshot slots={detail.before_slots}/>}]:[]),
    ...(detail.kind==='change' ? [{key:'day-before',label:'当天同步前',children:<DaySnapshot plan={detail.day_before}/>},{key:'day-after',label:'当天同步后',children:<DaySnapshot plan={detail.day_after}/>}]:[]),
  ] : [];
  return <Modal title="默认作息 · 调整记录" open={open} onCancel={onClose} width={1000} footer={<Button onClick={onClose}>关闭</Button>} destroyOnHidden>
    <p className="muted">北京时间。现存版本基线只保留当时已存在的配置，此前未记录的调整无法还原。</p>
    {listError && <Alert type="error" title={listError} action={<Button onClick={()=>setRetry(v=>v+1)}>重试</Button>}/>}
    {!listing && !listError && <Spin/>}
    {listing && <div className="routine-history-layout"><div className="routine-version-list">{listing.items.map(item=><button type="button" key={item.revision} className={`routine-version-item${selected===item.revision ? ' active' : ''}`} onClick={()=>setSelected(item.revision)}>版本 {item.revision} · {item.kind==='baseline' ? '现存版本基线' : '作息调整'}<small>{stamp(item.changed_at)}</small><small>{item.slot_count} 个时段 · {item.included_count} 个计入统计{item.effective_date ? ` · 同步 ${item.effective_date}` : ''}</small></button>)}<Space><Button size="small" disabled={!offset} onClick={()=>setOffset(offset-10)}>上一页</Button><Button size="small" disabled={offset+10>=listing.total} onClick={()=>setOffset(offset+10)}>下一页</Button></Space></div>
      <section>{detailError && <Alert type="error" title={detailError} action={<Button onClick={()=>setRetry(v=>v+1)}>重试</Button>}/>}{!detail && !detailError && selected!==null && <Spin/>}{detail && <><p className="muted">版本 {detail.revision} · {stamp(detail.changed_at)}</p>{detail.kind==='baseline' && <Alert type="info" title="基线快照，不代表一次可追溯的历史修改"/>}<Tabs key={selected} items={items}/></>}</section>
    </div>}
  </Modal>;
}
