import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Input, Modal, Space, Spin } from 'antd';
import { DeleteOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api, chinaNow, today, previewAchievement, gradeLabels, dayLabels } from './api';
import { createAutoSaver } from './autoSave';
import PlanSlots from './PlanSlots';
import RoutineHistory, { RoutineScope } from './RoutineHistory';
import { suggestTimeSlot, validateRoutineSlots } from './routineSlots';

function SlotEditor({ slots, onChange }) {
  const suggested=suggestTimeSlot(slots);
  const change = (index, field, value) => onChange(slots.map((slot,i)=>i===index ? {...slot,[field]:value} : slot));
  return <div className="slot-editor"><p className="muted">设置时间和主要活动主题，选择参与统计的时段；时间段不能重叠。</p>
    {slots.map((slot,index)=><div className="editor-row" key={slot.id}>
      <input type="time" aria-label={`时段${index+1}开始`} value={slot.start} onChange={e=>change(index,'start',e.target.value)}/><span>—</span>
      <input type="time" aria-label={`时段${index+1}结束`} value={slot.end} onChange={e=>change(index,'end',e.target.value)}/>
      <Input aria-label={`时段${index+1}主题`} value={slot.theme} placeholder="时段主题" maxLength={100} onChange={e=>change(index,'theme',e.target.value)}/>
      <Checkbox checked={slot.included} onChange={e=>change(index,'included',e.target.checked)}>计入统计</Checkbox>
      <Button type="text" danger aria-label={`删除时段${index+1}`} icon={<DeleteOutlined/>} onClick={()=>onChange(slots.filter((_,i)=>i!==index))}/>
    </div>)}
    <Button icon={<PlusOutlined/>} disabled={slots.length>=48 || !suggested} onClick={()=>onChange([...slots,{id:crypto.randomUUID(),...suggested,theme:'',included:true,status:'pending',notes:''}])}>添加时间段</Button>
    {!suggested && <p className="muted">没有可用的空闲时间，请先调整或删除现有时段。</p>}
  </div>;
}

export default function DailyPlan() {
  const [date, setDate] = useState(today);
  const [now, setNow] = useState(chinaNow);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState(null);
  const [saveState, setSaveState] = useState('idle');
  const [saveError, setSaveError] = useState('');
  const [editor, setEditor] = useState(null);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const saver = useRef(null);
  const readOnly = !access?.write || !plan?.editable || date !== now.format('YYYY-MM-DD');
  useEffect(()=>{
    let alive=true;
    fetch('/api/auth/check').then(r=>r.json()).then(data=>{
      if (!data.authenticated) {window.location.href='/login';return;}
      if(alive) setAccess({allowed:data.is_admin || data.module_permissions?.includes('discipline'),write:data.is_admin || data.data_permissions?.discipline !== 'read_only'});
    }).catch(()=>{if(alive) {setError('无法校验登录状态');setLoading(false);}});
    return ()=>{alive=false;};
  },[]);
  useEffect(()=>{
    const timer=setInterval(()=>{
      const value=chinaNow(); setNow(value);
      if (!saver.current?.dirty) setDate(value.format('YYYY-MM-DD'));
    },1000);
    return ()=>clearInterval(timer);
  },[]);
  useEffect(()=>{
    if (!access) return;
    if (!access.allowed) {setError('当前账号没有自律养成模块权限');setLoading(false);return;}
    let alive=true;
    setLoading(true);setError('');setPlan(null);setSaveError('');
    api(`days/${date}`).then(value=>{
      if(!alive) return;
      setPlan(value);setSaveState(value.saved ? 'saved' : 'idle');
      saver.current=createAutoSaver({initial:value,save:body=>api(`days/${date}`,body),onChange:setPlan,onState:(state,message='')=>{setSaveState(state);setSaveError(message);}});
    }).catch(e=>{if(alive) setError(e.message);}).finally(()=>{if(alive) setLoading(false);});
    return ()=>{alive=false;saver.current?.dispose();saver.current=null;};
  },[access,date,reload]);
  useEffect(()=>{
    const warn=event=>{if(saver.current?.dirty) {event.preventDefault();event.returnValue='';}};
    const flush=()=>{saver.current?.flush().catch(()=>{});};
    const visibility=()=>{if(document.visibilityState==='hidden') flush();};
    const navigate=event=>{
      if(event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor=event.target.closest('a[href]');
      if(!anchor || anchor.target==='_blank' || !saver.current?.dirty) return;
      if(new URL(anchor.href).origin!==location.origin) return;
      event.preventDefault();
      saver.current.flush().then(()=>{window.location.href=anchor.href;}).catch(()=>{});
    };
    window.addEventListener('beforeunload',warn);document.addEventListener('visibilitychange',visibility);document.addEventListener('click',navigate);
    return ()=>{window.removeEventListener('beforeunload',warn);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('click',navigate);};
  },[]);
  function updateSlot(index,field,value) {
    if(readOnly || templateBusy || !saver.current) return;
    saver.current.enqueue(saver.current.value.slots.map((slot,i)=>i===index ? {...slot,[field]:value} : slot));
  }
  async function openTemplate() {
    setTemplateBusy(true);setError('');
    try {await saver.current?.flush();setEditor(await api('template'));} catch(e) {setError(e.message);} finally {setTemplateBusy(false);}
  }
  async function saveTemplate() {
    const validationError=validateRoutineSlots(editor.slots);
    if(validationError) {Modal.error({title:'请检查时段安排',content:validationError});return;}
    setTemplateBusy(true);
    try {
      await saver.current.flush();
      const value=await api('template',{...editor,day_revision:saver.current.value.revision});
      saver.current.replace(value.day);setEditor(null);
    } catch(e) {Modal.error({title:'默认作息未保存',content:e.message});} finally {setTemplateBusy(false);}
  }
  const slots=plan?.slots || [];
  const achievement=saver.current?.dirty ? previewAchievement(slots,plan?.day_type) : plan?.achievement;
  const stateText={idle:'修改后自动保存',pending:'等待自动保存…',saving:'正在保存…',saved:'已自动保存',error:'保存失败，输入已保留'}[saveState];
  return <main className="daily-workspace"><header className="plan-toolbar"><span className="muted">{dayjs(date).format('YYYY 年 M 月 D 日')} · 北京时间</span><Space wrap><span className={`autosave-state ${saveState}`} role="status">{stateText}</span><Button disabled={!plan} onClick={()=>setHistoryOpen(true)}>调整记录</Button><Button icon={<SettingOutlined/>} disabled={!plan || !access?.write || templateBusy} loading={templateBusy} onClick={openTemplate}>默认作息</Button></Space></header>
    {error && <Alert type="error" title={error} action={<Button onClick={()=>setReload(v=>v+1)}>重新加载</Button>}/>}
    {saveError && <Alert type="error" title={saveError} description="尚未保存的内容保留在当前页面，请勿直接关闭。" action={<Button onClick={()=>saver.current?.retry().catch(()=>{})}>重试保存</Button>}/>}
    {loading ? <div className="loading"><Spin/></div> : plan && <>
      <section className="day-overview"><div><p className="eyebrow">{dayLabels[plan.day_type]}</p><h1>每日计划执行</h1><p className="muted">评价时段主题，按需记录具体内容，修改会自动保存。</p></div><div className={`day-stats score-${achievement?.grade}`}><strong>{achievement?.rate==null ? '—' : `${achievement.rate}%`}</strong><span>{gradeLabels[achievement?.grade]} · 截至当前</span><span>{achievement?.selected || 0} 段参与统计 · {slots.filter(slot=>slot.status!=='pending').length} / {slots.length} 段已评价</span></div></section>
      {readOnly && <Alert type="info" title={date!==today() ? '已跨过北京时间零点，该日记录已锁定，未保存内容仍保留在页面' : '当前账号为只读权限'}/>}
      <div className="plan-scroll"><PlanSlots slots={slots} editable={!readOnly && !templateBusy} onChange={updateSlot} currentTime={now.format('HH:mm')}/><p className="plan-footnote">修改默认作息后同步当天；历史快照不变。具体记录按需填写。</p></div>
    </>}
    <Modal title="默认作息" open={!!editor} width={800} confirmLoading={templateBusy} onCancel={()=>{if(!templateBusy) setEditor(null);}} onOk={saveTemplate} okText="保存作息" cancelText="取消" destroyOnHidden><RoutineScope/>{editor && <SlotEditor slots={editor.slots} onChange={slots=>setEditor({...editor,slots})}/>}</Modal>
    <RoutineHistory open={historyOpen} onClose={()=>setHistoryOpen(false)}/>
  </main>;
}
