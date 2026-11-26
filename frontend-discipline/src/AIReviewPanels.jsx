import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Drawer, Empty, Space, Spin, Switch, Tag } from 'antd';
import { ArrowRightOutlined, CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined, DesktopOutlined, FileTextOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { aiApi, focusLabels, rangeLabel, stateLabels } from './reviewUtils';
import DayDrawer from './DayDrawer';

export const stamp = value => value ? dayjs(value).tz('Asia/Shanghai').format('MM-DD HH:mm') : '尚无记录';

export function EvidenceDrawer({value,onClose}) {
  const [planDate,setPlanDate]=useState(null);
  useEffect(()=>{if(!value)setPlanDate(null);},[value]);
  return <><Drawer title="复盘依据" open={Boolean(value)} onClose={onClose} size="min(560px, 100vw)" className="ai-evidence-drawer">
    <p className="ai-help">以下为这份报告生成时的记录快照。数字由系统统计，AI 根据这些依据组织复盘。</p>
    {value?.items.map(item=><article className="ai-evidence" key={item.id}>
      <div><Tag icon={item.source==='screen' ? <DesktopOutlined/> : <CalendarOutlined/>}>{item.source==='screen' ? '屏幕统计' : '每日计划'}</Tag>{item.date && <span className="ai-help">{item.date}</span>}</div>
      <h3>{item.title}</h3><p>{item.detail}</p>
      {item.source==='screen' ? <a href={`/discipline/screen?view=${item.date ? 'day' : value.period}&date=${item.date || value.start}`}>查看屏幕统计 <ArrowRightOutlined/></a> : <Button type="link" onClick={()=>setPlanDate(item.date || value.start)}>查看当天计划 <ArrowRightOutlined/></Button>}
    </article>)}
    {!value?.items.length && <Empty description="暂无依据"/>}
  </Drawer><DayDrawer date={planDate} onClose={()=>setPlanDate(null)}/></>;
}

export function HistoryDrawer({open,onClose,onSelect}) {
  const [items,setItems]=useState(null),[error,setError]=useState('');
  useEffect(()=>{
    if(!open) return;
    const controller=new AbortController();setItems(null);setError('');
    aiApi('history?limit=40',{signal:controller.signal}).then(value=>setItems(value.items)).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return ()=>controller.abort();
  },[open]);
  return <Drawer title="复盘档案" open={open} onClose={onClose} size="min(480px, 100vw)">
    <p className="ai-help">保留每次生成的版本，回看当时的依据与建议。</p>
    {error && <Alert type="error" title={error}/>}
    {!items && !error && <Spin/>}
    {items?.length===0 && <Empty description="完成第一份复盘后，会在这里留下记录"/>}
    {items?.map(item=><button className="ai-history-row" key={item.id} onClick={()=>onSelect(item)}>
      <span className="ai-history-icon">{item.period==='week' ? <CalendarOutlined/> : <FileTextOutlined/>}</span>
      <span><strong>{rangeLabel(item.period,item.start)}</strong><small>{item.period==='week' ? '周复盘' : '日复盘'} · {focusLabels[item.options.focus]} · {stamp(item.created_at)}</small></span>
      <Tag color={item.status==='success' ? 'success' : item.status==='failed' ? 'error' : 'processing'}>{stateLabels[item.status]}</Tag>
    </button>)}
  </Drawer>;
}

export function SettingsDrawer({open,value,canWrite,onClose,onSaved,options}) {
  const [draft,setDraft]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{if(open && value)setDraft({...value});else if(!open)setDraft(null);setError('');},[open,value]);
  async function save() {
    setBusy(true);setError('');
    try {const updated=await aiApi('settings',{method:'PUT',body:{automatic:draft.automatic,include_notes:draft.include_notes,...options}});onSaved(updated);onClose();}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }
  return <Drawer title="复盘设置" open={open} onClose={onClose} size="min(440px, 100vw)" footer={<Space><Button onClick={onClose}>取消</Button><Button type="primary" loading={busy} disabled={!canWrite || !draft} onClick={save}>保存设置</Button></Space>}>
    {error && <Alert type="error" title={error}/>}
    {draft && value && <>
      <section className="ai-setting-block"><span className="ai-setting-icon"><ClockCircleOutlined/></span><h3>自动留下一份复盘</h3>
        <div className="ai-setting-toggle"><b>每日自动生成</b><Switch checked={draft.automatic} disabled={!canWrite} onChange={automatic=>setDraft({...draft,automatic})}/></div>
        <p>早上 08:00 后，当天的屏幕数据导入并稳定 90 秒后生成昨日复盘。每周一再生成上周复盘；未同步时等待数据。</p>
        <p className="ai-help">自动生成沿用当前选择的{focusLabels[options.focus]}与{options.detail==='detailed' ? '详细' : '精简'}模式。后来补入的数据会标记报告待更新，由你选择是否重新生成。</p>
      </section>
      <section className="ai-setting-block"><span className="ai-setting-icon"><FileTextOutlined/></span><h3>提供给 AI 的资料</h3>
        <p>使用本账号的计划主题、自评、应用用时和汇总数据，发送到 DeepSeek 生成复盘。</p>
        <Checkbox checked={draft.include_notes} disabled={!canWrite} onChange={e=>setDraft({...draft,include_notes:e.target.checked})}>同时使用计划中的文字备注</Checkbox>
        <p className="ai-help">默认不发送文字备注。每个选中时段最多使用 240 字；不发送窗口正文、设备标识或其他模块的数据。</p>
      </section>
      <section className="ai-setting-block"><Tag icon={<CheckCircleOutlined/>} color={value.configured ? 'success' : 'default'}>{value.configured ? 'AI 服务已配置' : 'AI 服务未配置'}</Tag>
        <p className="ai-help">报告会保存，重复查看不会调用 AI。每个账号每天最多生成 {value.daily_limit} 次。</p>
      </section>
    </>}
  </Drawer>;
}
