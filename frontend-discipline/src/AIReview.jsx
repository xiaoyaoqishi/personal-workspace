import { useEffect, useRef, useState } from 'react';
import { Alert, Button, DatePicker, Empty, Segmented, Select, Skeleton, Space, Spin, Tag, message } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, BulbOutlined, CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined, CopyOutlined, DownloadOutlined, FileSearchOutlined, HistoryOutlined, LeftOutlined, LineChartOutlined, ReloadOutlined, RightOutlined, SettingOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router';
import dayjs from 'dayjs';
import { chinaNow } from './api';
import { aiApi, detailLabels, duration, focusLabels, latestAnchor, monday, rangeLabel, reportText } from './reviewUtils';
import { EvidenceDrawer, HistoryDrawer, SettingsDrawer, stamp } from './AIReviewPanels';
import './AIReview.css';

const sections=[['strengths','值得保持','让有效的部分继续发生',CheckCircleOutlined],['attention','留意一下','找到值得调整的小地方',FileSearchOutlined],['patterns','发现的规律','把几条记录放在一起看',LineChartOutlined],['actions','下一步行动','选一件最容易开始的事',ArrowRightOutlined]];

function ReviewContent({report,onEvidence}) {
  return <>
    <article className="ai-report-intro"><div className="ai-report-label"><span className="ai-spark"><BulbOutlined/></span><span>这次复盘</span><Tag variant="filled">{focusLabels[report.options.focus]}</Tag></div>
      <h2>{report.content.title}</h2><p>{report.content.summary}</p><div className="ai-report-foot"><span>{stamp(report.updated_at)} 生成</span><span>基于当时的记录快照</span></div>
    </article>
    {sections.map(([key,title,subtitle,Icon])=>report.content[key]?.length>0 && <section className={`ai-section ai-section-${key}`} key={key}>
      <header><span className="ai-section-icon"><Icon/></span><div><h2>{title}</h2><p>{subtitle}</p></div><span className="ai-section-count">{String(report.content[key].length).padStart(2,'0')}</span></header>
      <div className="ai-insight-grid">{report.content[key].map((card,index)=><article className="ai-insight" key={index}>
        <div className="ai-insight-title">{key==='actions' && <span className="ai-action-number">{index+1}</span>}<h3>{card.title}</h3></div><p>{card.body}</p>
        <footer>{card.kind==='hypothesis' && <span className="ai-hypothesis">建议核对</span>}<button onClick={()=>onEvidence(card.evidence_ids)}><FileSearchOutlined/> 查看 {card.evidence_ids.length} 条依据 <RightOutlined/></button></footer>
      </article>)}</div>
    </section>)}
  </>;
}

export default function AIReview() {
  const [params,setParams]=useSearchParams();
  const period=params.get('period')==='week' ? 'week' : 'day';
  const anchor=params.get('date') || latestAnchor(period),version=params.get('report');
  const [data,setData]=useState(null),[error,setError]=useState(''),[reload,setReload]=useState(0),[generating,setGenerating]=useState(false);
  const [options,setOptions]=useState({focus:'balanced',detail:'concise'}),[canWrite,setCanWrite]=useState(false);
  const [historyOpen,setHistoryOpen]=useState(false),[settingsOpen,setSettingsOpen]=useState(false),[evidence,setEvidence]=useState(null);
  const initialized=useRef(false),loadedKey=useRef('');
  const [notice,holder]=message.useMessage();
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/auth/check',{signal:controller.signal}).then(r=>r.json()).then(value=>{if(!controller.signal.aborted)setCanWrite(Boolean(value.is_admin || (value.module_permissions?.includes('discipline') && value.data_permissions?.discipline!=='read_only')));}).catch(()=>{});
    return ()=>controller.abort();
  },[]);
  useEffect(()=>{
    const controller=new AbortController(),key=`${period}/${anchor}/${version || ''}`;
    if(loadedKey.current!==key) {setData(null);setEvidence(null);loadedKey.current=key;}
    setError('');
    const request=version ? Promise.all([aiApi(`reports/${encodeURIComponent(version)}`,{signal:controller.signal}),aiApi('settings',{signal:controller.signal})]).then(([report,settings])=>({source:report.snapshot,report:report.status==='success' ? report : null,latest_attempt:report,settings,stale:report.stale,active:null}))
      : aiApi(`overview?period=${period}&anchor=${encodeURIComponent(anchor)}`,{signal:controller.signal});
    request.then(value=>{
      if(controller.signal.aborted)return;
      setData(value);
      if(!initialized.current) {setOptions({focus:value.settings.focus,detail:value.settings.detail});initialized.current=true;}
    }).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return ()=>controller.abort();
  },[period,anchor,version,reload]);
  useEffect(()=>{if(!data?.active)return;const timer=setTimeout(()=>setReload(value=>value+1),2500);return ()=>clearTimeout(timer);},[data]);
  function navigate(nextPeriod,value) {setParams({period:nextPeriod,date:(nextPeriod==='week' ? monday(value) : dayjs(value)).format('YYYY-MM-DD')});}
  function showEvidence(ids) {const source=data.report?.snapshot || data.source;setEvidence({items:ids ? source.evidence.filter(item=>ids.includes(item.id)) : source.evidence,period,start:source.start});}
  async function generate(force=false) {
    const submittedKey=loadedKey.current;
    setGenerating(true);setError('');
    try {
      const report=await aiApi('reports',{method:'POST',body:{period,anchor,...options,regenerate:force}});
      if(loadedKey.current!==submittedKey) {notice.info('复盘已在后台处理，可在复盘档案中查看');return;}
      if(version)setParams({period,date:anchor});
      setData(value=>({...value,active:report.status==='queued' || report.status==='running' ? report : null}));
      setReload(value=>value+1);
      if(report.reused && report.status==='success')notice.success('已使用相同数据生成的报告');
    } catch(e){setError(e.message);}finally{setGenerating(false);}
  }
  async function copy() {try{await navigator.clipboard.writeText(reportText(data.report));notice.success('报告和依据已复制');}catch{notice.error('复制失败，可使用下载保存报告');}}
  function download() {const blob=new Blob([reportText(data.report)],{type:'text/markdown;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`复盘-${data.report.start}-${period}.md`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const report=data?.report,source=report?.snapshot || data?.source,metrics=source?.metrics,active=data?.active;
  const failed=data?.latest_attempt?.status==='failed',busy=Boolean(active || generating);
  const next=dayjs(anchor).add(period==='week' ? 7 : 1,'day');
  const atLatest=period==='week' ? !monday(next).isBefore(dayjs(latestAnchor(period)).add(1,'day'),'day') : next.isAfter(dayjs(latestAnchor(period)),'day');
  return <main className="ai-workspace">
    {holder}<header className="ai-page-header"><div><p className="ai-eyebrow"><BulbOutlined/> 记录之后，再向前一步</p><h1>AI 总结<span>复盘，让改变更具体</span></h1><p className="ai-page-description">把计划与实际放在一起，发现值得保持的事，找到下一步的小调整。</p></div>
      <Space className="ai-header-buttons"><Button aria-label="复盘档案" title="复盘档案" icon={<HistoryOutlined/>} onClick={()=>setHistoryOpen(true)}><span className="ai-button-label">复盘档案</span></Button><Button aria-label="复盘设置" icon={<SettingOutlined/>} disabled={!data} onClick={()=>setSettingsOpen(true)}/></Space>
    </header>
    <section className="ai-toolbar"><div className="ai-period-controls"><Segmented aria-label="复盘周期" value={period} options={[{label:'日复盘',value:'day'},{label:'周复盘',value:'week'}]} onChange={value=>navigate(value,latestAnchor(value))}/>
      <div className="ai-date-controls"><Button aria-label="上一个周期" icon={<LeftOutlined/>} onClick={()=>navigate(period,dayjs(anchor).subtract(period==='week' ? 7 : 1,'day'))}/><DatePicker value={dayjs(anchor)} allowClear={false} inputReadOnly format="YYYY-MM-DD" disabledDate={value=>(period==='week' ? monday(value).add(6,'day') : value).isAfter(chinaNow().subtract(1,'day'),'day')} onChange={value=>navigate(period,value)}/><Button aria-label="下一个周期" disabled={atLatest} icon={<RightOutlined/>} onClick={()=>navigate(period,next)}/><Button onClick={()=>navigate(period,latestAnchor(period))}>{period==='week' ? '上一周' : '昨天'}</Button></div>
    </div><div className="ai-generation-controls"><Select aria-label="复盘重点" value={options.focus} options={Object.entries(focusLabels).map(([value,label])=>({value,label}))} onChange={focus=>setOptions({...options,focus})}/><Select aria-label="内容长度" value={options.detail} options={Object.entries(detailLabels).map(([value,label])=>({value,label}))} onChange={detail=>setOptions({...options,detail})}/>
      <Button type="primary" icon={busy ? <Spin size="small"/> : <ThunderboltOutlined/>} loading={generating} disabled={!canWrite || busy || !data?.settings.configured || !data?.source.has_data} onClick={()=>generate(false)}>{busy ? '正在生成' : report ? '生成所选复盘' : '生成复盘'}</Button></div></section>
    {error && <Alert type="error" closable title={error} onClose={()=>setError('')} action={<Button onClick={()=>setReload(value=>value+1)}>刷新</Button>}/>}
    {version && <Alert type="info" title="正在查看历史版本，数据与建议保留生成时的快照" action={<Button onClick={()=>navigate(period,anchor)}>返回最新版本</Button>}/>}
    {!data && !error && <section className="ai-loading"><Skeleton active paragraph={{rows:6}}/></section>}
    {data && <>
      {!data.settings.configured && <Alert type="info" title="AI 服务尚未就绪" description="已有统计可照常查看，接入服务后即可生成复盘。"/>}
      {data.stale && <Alert type="warning" title="已有新数据，这份复盘可更新" description="下方保留原报告及其依据，可重新生成以纳入后来同步的记录。" action={<Button disabled={!canWrite || busy} onClick={()=>generate(true)}>更新复盘</Button>}/>}
      {failed && <Alert type="warning" title={data.latest_attempt.error_message || '本次复盘未生成成功'} description={report ? '上一份成功的报告继续保留。' : '事实数据已保留，可以稍后再试。'} action={<Button disabled={busy || !canWrite} onClick={()=>generate(true)}>重试生成</Button>}/>}
      {active && <div className="ai-generating"><Spin/><div><b>正在把记录整理成复盘</b><p>你可以离开页面，完成后报告会保存在复盘档案。</p></div></div>}
      <div className="ai-report-heading"><div><h2>{rangeLabel(period,anchor)}</h2><span>{period==='week' ? '完整自然周 · 周一至周日' : '已结束的一天'} · 北京时间</span></div>{report && <Space size={3}><Button type="text" icon={<CopyOutlined/>} onClick={copy}>复制</Button><Button type="text" aria-label="下载复盘" icon={<DownloadOutlined/>} onClick={download}/><Button type="text" aria-label="重新生成当前复盘" disabled={!canWrite || busy} icon={<ReloadOutlined/>} onClick={()=>generate(true)}/></Space>}</div>
      <section className="ai-metrics">{[
        ['计划达成率',metrics.plan_rate==null ? '—' : `${metrics.plan_rate}%`,`${metrics.plan_scored_days} 个计分日 · 按原有规则`],
        ['设备累计使用',duration(metrics.screen_seconds),'跨设备重叠分别累计'],
        ['合并后使用',duration(metrics.unique_seconds),'合并重叠区间后的时长'],
        ['夜间使用',duration(metrics.night_seconds),'23:00—次日06:00'],
      ].map(([label,value,caption])=><article className="ai-metric" key={label}><span>{label}</span><strong>{value}</strong><small>{caption}</small></article>)}</section>
      <div className="ai-report-layout"><div className="ai-main-column">{report?.content ? <ReviewContent report={report} onEvidence={showEvidence}/> : <section className="ai-empty"><span className="ai-empty-icon"><BulbOutlined/></span><h2>{data.source.has_data ? '记录已就绪，开始这次复盘' : '从一份真实记录开始'}</h2><p>{data.source.has_data ? '选择复盘重点和内容长度，看看这段时间有哪些值得保持的小习惯。每个建议都能展开查看依据。' : '这个周期暂无已入库记录。同步屏幕统计或保存每日计划后，即可生成复盘。'}</p><Button type="primary" disabled={!canWrite || busy || !data.settings.configured || !data.source.has_data} onClick={()=>generate(false)}>生成{period==='week' ? '本周' : '这一天的'}复盘</Button></section>}
        <p className="ai-report-note">AI 根据已有记录提供观察与建议，无法判断应用内的实际活动或真实专注度。计划评分始终沿用你的自主评价。</p>
      </div><aside className="ai-context-column"><section className="ai-context-card"><header><span><FileSearchOutlined/></span><h3>本次依据</h3></header><div className="ai-coverage"><b>{metrics.observed_screen_days}<small> / {metrics.days} 天</small></b><span>有正常屏幕记录</span></div><div className="ai-source-row"><span>计划记录</span><strong>{metrics.plan_recorded_days} / {metrics.days} 天</strong></div><div className="ai-source-row"><span>已评价时段</span><strong>{metrics.plan_evaluated} / {metrics.plan_selected}</strong></div><div className="ai-source-row"><span>应用</span><strong>{metrics.apps} 个</strong></div><div className="ai-source-row"><span>数据异常片段</span><strong>{source.quality.anomalies} 个</strong></div>
        {(source.quality.missing_screen_days.length>0 || source.quality.missing_plan_days.length>0) && <p className="ai-coverage-note">部分日期缺少记录，缺失不表示零使用或执行失败。</p>}
        <Button block icon={<FileSearchOutlined/>} onClick={()=>showEvidence()}>查看全部依据</Button><p className="ai-context-timestamp">入库更新 {stamp(source.data_as_of)}</p>
      </section><section className="ai-context-card ai-days-card"><header><span><CalendarOutlined/></span><h3>周期速览</h3></header>{source.days.map(day=><div className="ai-day-row" key={day.date}><span>{dayjs(day.date).format('MM-DD')}</span><div><div className="ai-day-track"><i style={{width:`${day.rate || 0}%`}}/></div><small>{day.rate==null ? '不计分' : `${day.rate}%`} · {day.saved ? '已记录' : '未记录'}</small></div></div>)}</section>
      <section className="ai-context-card ai-auto-card"><ClockCircleOutlined/><h3>{data.settings.automatic ? '下一次，自动为你整理' : '让复盘成为日常'}</h3><p>{data.settings.automatic ? '每日同步后生成昨日复盘，周一再回顾上一周。' : '开启自动生成，在数据同步后留下一份复盘。'}</p><Button type="link" disabled={!canWrite} onClick={()=>setSettingsOpen(true)}>{data.settings.automatic ? '管理自动复盘' : '设置自动复盘'} <ArrowRightOutlined/></Button></section></aside></div>
    </>}
    <EvidenceDrawer value={evidence} onClose={()=>setEvidence(null)}/>
    <HistoryDrawer open={historyOpen} onClose={()=>setHistoryOpen(false)} onSelect={item=>{setParams({period:item.period,date:item.start,report:item.id});setHistoryOpen(false);}}/>
    <SettingsDrawer open={settingsOpen} value={data?.settings} canWrite={canWrite} options={options} onClose={()=>setSettingsOpen(false)} onSaved={value=>{setData(current=>({...current,settings:value}));setReload(value=>value+1);notice.success('复盘设置已保存');}}/>
  </main>;
}
