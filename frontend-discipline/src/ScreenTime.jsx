import { useEffect, useRef, useState } from 'react';
import { Alert, Button, DatePicker, Drawer, Empty, Input, Modal, Segmented, Select, Skeleton, Space, Tooltip, message } from 'antd';
import { AppstoreOutlined, ArrowDownOutlined, ArrowUpOutlined, ClockCircleOutlined, CloudUploadOutlined, DownloadOutlined, EditOutlined, InfoCircleOutlined, LaptopOutlined, LeftOutlined, MobileOutlined, ReloadOutlined, RightOutlined, SearchOutlined, TabletOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { chinaNow } from './api';
import { categories, deviceColor, duration, periodRange, screenApi, screenSelection } from './screenStats';
import { CategoryBreakdown, UsageChart } from './ScreenCharts';
import ScreenDetails from './ScreenDetails';
import ScreenCollectors from './ScreenCollectors';
import './ScreenTime.css';

const deviceIcon = kind => kind==='mac' ? <LaptopOutlined/> : kind==='ipad' ? <TabletOutlined/> : <MobileOutlined/>;
const dateTime = value => value ? dayjs(value).tz('Asia/Shanghai').format('MM-DD HH:mm') : '暂无记录';

function UsageNumber({seconds}) {
  if(seconds===null) return <strong className="sc-number">—</strong>;
  const minutes=Math.round(seconds/60);
  return <strong className="sc-number">{minutes>=60 && <>{Math.floor(minutes/60)}<small>小时</small></>}{minutes%60 || minutes<60 ? <>{minutes%60}<small>分钟</small></> : null}</strong>;
}

export default function ScreenTime() {
  const [params,setParams]=useSearchParams();
  const {mode,anchor,device}=screenSelection(params);
  const [start,end]=periodRange(mode,anchor);
  const query=new URLSearchParams({start,end,...(device ? {device} : {})}).toString();
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [reload,setReload]=useState(0);
  const [write,setWrite]=useState(false);
  const [sources,setSources]=useState(false);
  const [details,setDetails]=useState(null);
  const [editor,setEditor]=useState(null);
  const [saving,setSaving]=useState(false);
  const [importing,setImporting]=useState(false);
  const [pendingImport,setPendingImport]=useState(null);
  const [search,setSearch]=useState('');
  const [sort,setSort]=useState('seconds');
  const [appLimit,setAppLimit]=useState(8);
  const [group,setGroup]=useState('device');
  const file=useRef(null);
  const [notice,contextHolder]=message.useMessage();
  useEffect(()=>{
    let alive=true;
    fetch('/api/auth/check').then(r=>r.json()).then(value=>{
      if(alive) setWrite(Boolean(value.authenticated && (value.is_admin || value.data_permissions?.discipline!=='read_only')));
    }).catch(()=>{});
    return ()=>{alive=false;};
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setError('');setData(null);
    screenApi(`overview?${query}`,{signal:controller.signal}).then(value=>{
      if(!controller.signal.aborted) setData(value);
    }).catch(e=>{if(!controller.signal.aborted) setError(e.message);}).finally(()=>{if(!controller.signal.aborted) setLoading(false);});
    return ()=>controller.abort();
  },[query,reload]);
  function select(changes) {
    setDetails(null);setSearch('');setAppLimit(8);
    setParams(current=>{
      const next=new URLSearchParams(current);
      for(const [key,value] of Object.entries(changes)) value ? next.set(key,value) : next.delete(key);
      return next;
    });
  }
  function move(direction) {
    const unit=mode==='day' ? 'day' : mode==='week' ? 'week' : 'month';
    const next=dayjs(anchor).add(direction,unit);
    if(next.year()>=2001 && next.year()<=2100) select({date:next.format('YYYY-MM-DD')});
  }
  async function chooseFile(event) {
    const selected=event.target.files?.[0];
    event.target.value='';
    if(!selected) return;
    if(selected.size>20*1024*1024) {notice.error('文件过大，请将记录拆分为不超过20MB的批次');return;}
    try {
      const body=JSON.parse(await selected.text());
      if(body.version!==1 || !Array.isArray(body.devices) || !Array.isArray(body.events) || !body.events.length || body.events.length>50000) throw new Error('请选择有效的屏幕记录文件，单次支持1—50000条事件');
      setPendingImport({body,name:selected.name});
    } catch(e) {notice.error(e instanceof SyntaxError ? '文件不是有效的JSON，请选择屏幕记录文件' : e.message);}
  }
  async function importFile() {
    setImporting(true);
    try {
      const result=await screenApi('imports',{method:'POST',body:pendingImport.body});
      notice.success(`已新增 ${result.added} 条事件，跳过 ${result.duplicates} 条重复记录`);
      setPendingImport(null);setReload(r=>r+1);
    } catch(e) {notice.error(e.message);} finally {setImporting(false);}
  }
  async function saveEditor() {
    if(!editor.name.trim()) {notice.error('名称不能为空');return;}
    setSaving(true);
    try {
      await screenApi(editor.type==='device' ? `devices/${encodeURIComponent(editor.key)}` : 'apps',{
        method:'PUT',body:editor.type==='device' ? {name:editor.name} : {app:editor.app,name:editor.name,category:editor.category}});
      setDetails(current=>current?.app===editor.app ? {...current,name:editor.name,category:editor.category} : current);
      setEditor(null);setReload(r=>r+1);notice.success('已保存');
    } catch(e) {notice.error(e.message);} finally {setSaving(false);}
  }
  const summary=data?.summary;
  const activeDevice=data?.devices.find(d=>d.key===device);
  const apps=(data?.apps || []).filter(app=>`${app.name} ${app.app} ${categories[app.category].name}`.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>b[sort]-a[sort] || a.name.localeCompare(b.name));
  const periodTitle=mode==='day' ? dayjs(anchor).format('M月D日') : mode==='week' ? `${dayjs(start).format('M月D日')} — ${dayjs(end).format('M月D日')}` : dayjs(anchor).format('YYYY年M月');
  const latest=data?.quality.latest_event;
  const comparison=data?.comparison.delta_percent;
  return <main className="screen-workspace">
    {contextHolder}
    <input type="file" accept="application/json,.json" ref={file} hidden onChange={chooseFile}/>
    <header className="sc-page-header"><div><p className="eyebrow">看见时间的去向</p><h1>屏幕统计</h1><p className="muted">了解设备使用的节奏，把时间留给在意的事。</p></div><Space wrap><Button icon={<ReloadOutlined/>} loading={loading} aria-label="刷新屏幕统计" onClick={()=>setReload(r=>r+1)}/><Button icon={<InfoCircleOutlined/>} onClick={()=>setSources(true)}>设备与数据</Button><Button icon={<DownloadOutlined/>} disabled={!summary?.seconds} href={summary?.seconds ? `/api/discipline/screen/export?${query}` : undefined}>导出</Button></Space></header>
    <div className="sc-period-toolbar"><Segmented aria-label="统计周期" value={mode} options={[{value:'day',label:'日'},{value:'week',label:'周'},{value:'month',label:'月'}]} onChange={view=>select({view})}/><div className="sc-date-controls"><Button aria-label="上一个周期" icon={<LeftOutlined/>} onClick={()=>move(-1)}/><DatePicker picker={mode==='month' ? 'month' : 'date'} allowClear={false} value={dayjs(anchor)} onChange={value=>select({date:value.format('YYYY-MM-DD')})} format={mode==='month' ? 'YYYY年M月' : 'YYYY年M月D日'} disabledDate={value=>value.year()<2001 || value.year()>2100}/><Button aria-label="下一个周期" icon={<RightOutlined/>} onClick={()=>move(1)}/><Button type="text" onClick={()=>select({view:'day',date:chinaNow().subtract(1,'day').format('YYYY-MM-DD')})}>昨天</Button><Button type="text" onClick={()=>select({view:'day',date:chinaNow().format('YYYY-MM-DD')})}>今天</Button></div></div>
    {error && <Alert type="error" showIcon title={error} action={<Space><Button onClick={()=>select({device:''})}>查看全部设备</Button><Button onClick={()=>setReload(r=>r+1)}>重试</Button></Space>}/>}
    {loading && <section className="sc-panel"><Skeleton active paragraph={{rows:8}}/></section>}
    {data && <>
      <div className="sc-device-selector" role="group" aria-label="筛选设备">
        <button className={`sc-device-card${!device ? ' selected' : ''}`} aria-pressed={!device} onClick={()=>select({device:''})}><span className="sc-device-icon"><AppstoreOutlined/></span><span><b>全部设备</b><small>{data.devices.filter(d=>d.has_data).length} 台有记录的设备</small></span></button>
        {data.devices.filter(d=>d.has_data).map(d=><button key={d.key} className={`sc-device-card${device===d.key ? ' selected' : ''}`} aria-pressed={device===d.key} onClick={()=>select({device:d.key})}><span className="sc-device-icon" style={{color:deviceColor(d.kind)}}>{deviceIcon(d.kind)}</span><span><b>{d.name}</b><small>{duration(d.seconds)}{d.seconds===null ? ' 暂无记录' : ''}</small></span></button>)}
      </div>
      {!summary.seconds ? <section className="sc-panel sc-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={data.quality.has_events ? '这个时间范围还没有可统计的使用记录' : '还没有屏幕使用记录'}/><p className="muted">{data.quality.has_events ? `已有记录覆盖 ${dateTime(data.quality.first_event)} 至 ${dateTime(latest)}。` : '导入设备的屏幕记录后，即可查看使用趋势、应用排行与详细轨迹。'}</p><Space wrap>{latest && <Button type="primary" onClick={()=>select({view:'day',date:dayjs(latest).tz('Asia/Shanghai').format('YYYY-MM-DD')})}>查看最近记录</Button>}{write && <Button icon={<CloudUploadOutlined/>} onClick={()=>file.current?.click()}>导入记录</Button>}{summary.anomalies>0 && <Button onClick={()=>setDetails({anomaly:true})}>查看 {summary.anomalies} 段异常</Button>}</Space></section> : <>
        <section className="sc-overview"><div className="sc-total"><div className="sc-total-label"><span>{periodTitle} · {activeDevice?.name || '全部设备'}</span><Tooltip title="多设备同时使用分别累计；去重使用时长合并了所有重叠区间。"><InfoCircleOutlined/></Tooltip></div><UsageNumber seconds={summary.seconds}/><div className="sc-total-footer"><span>设备累计时长</span>{comparison!==null && comparison!==undefined ? <span className={`sc-comparison ${comparison>0 ? 'increased' : 'decreased'}`}>{comparison>0 ? <ArrowUpOutlined/> : <ArrowDownOutlined/>}{Math.abs(comparison).toFixed(1)}% 较上一同长周期</span> : <span className="sc-comparison">{data.comparison.comparable ? '上一周期暂无可比较时长' : '上一周期记录不足，暂不比较'}</span>}</div></div>
          <div className="sc-stats-grid"><div><Tooltip title="把多设备同时使用的区间合并后计算，不代表持续专注时长"><span>去重使用时长</span></Tooltip><strong>{duration(summary.unique_seconds)}</strong><small>重叠使用 {duration(summary.overlap_seconds)}</small></div><div><span>有记录日均</span><strong>{duration(summary.daily_average)}</strong><small>{summary.observed_days} / {summary.days} 天有使用记录</small></div><div><span>夜间使用</span><strong>{duration(summary.night_seconds)}</strong><small>23:00 — 次日 06:00</small></div><div><span>使用片段</span><strong>{summary.sessions}<em> 段</em></strong><small>{summary.apps} 个应用 · 最长 {duration(summary.longest_seconds)}</small></div></div>
        </section>
        {summary.anomalies>0 && <div className="sc-quality-note"><InfoCircleOutlined/><span>{summary.anomalies} 段异常或未闭合记录未计入，使用时长可能少计。</span><button onClick={()=>setDetails({anomaly:true})}>查看记录 <RightOutlined/></button></div>}
        <section className="sc-panel"><div className="sc-panel-heading"><div><h2>{mode==='day' ? '一天的使用节奏' : '使用趋势'}</h2><p>{mode==='day' ? '按北京时间汇总每小时的使用时长' : '点击日期查看当天使用情况，空白日期表示暂无记录'}</p></div><Segmented size="small" aria-label="图表分组" value={group} options={[{value:'device',label:'按设备'},{value:'category',label:'按分类'}]} onChange={setGroup}/></div><UsageChart rows={mode==='day' ? data.hourly : data.daily} devices={data.devices} group={group} hourly={mode==='day'} onDay={date=>select({view:'day',date})}/></section>
        <div className="sc-analysis-grid"><section className="sc-panel sc-apps-panel"><div className="sc-panel-heading"><div><h2><AppstoreOutlined/> 应用排行</h2><p>点击应用查看使用轨迹，分类可按个人习惯调整</p></div><span className="sc-count-label">{summary.apps} 个应用</span></div><div className="sc-app-filters"><Input aria-label="搜索应用" prefix={<SearchOutlined/>} placeholder="搜索应用或分类" value={search} allowClear onChange={e=>{setSearch(e.target.value);setAppLimit(8);}}/><Select aria-label="应用排序" value={sort} onChange={setSort} options={[{value:'seconds',label:'按使用时长'},{value:'sessions',label:'按使用片段'}]}/></div>
          <div className="sc-app-list">{apps.slice(0,appLimit).map((app,index)=><div className="sc-app-row" key={app.app}><button className="sc-app-open" onClick={()=>setDetails(app)} aria-label={`查看${app.name}，${duration(app.seconds)}`}><span className="sc-rank">{index+1}</span><span className="sc-app-glyph" style={{'--app-color':categories[app.category].color}}>{app.name.slice(0,1).toUpperCase()}</span><span className="sc-app-info"><b>{app.name}</b><span className="sc-app-track"><i style={{width:`${app.seconds/Math.max(...apps.map(a=>a.seconds),1)*100}%`,background:categories[app.category].color}}/></span><small>{app.sessions} 个片段 · {(app.seconds/summary.seconds*100).toFixed(1)}%</small></span><strong>{duration(app.seconds)}</strong></button><button className="sc-category-button" disabled={!write} onClick={()=>setEditor({type:'app',...app})} aria-label={`修改${app.name}名称和分类`}>{categories[app.category].name}{write && <EditOutlined/>}</button></div>)}</div>
          {!apps.length && <Empty description="没有匹配的应用" image={Empty.PRESENTED_IMAGE_SIMPLE}/>}{apps.length>appLimit && <Button block type="text" onClick={()=>setAppLimit(value=>value+20)}>展开更多应用（还有 {apps.length-appLimit} 个）</Button>}
        </section><div className="sc-side-stack"><section className="sc-panel"><div className="sc-panel-heading"><div><h2>时间花在哪里</h2><p>分类为初始建议，可在应用列表中调整</p></div></div><CategoryBreakdown items={data.categories} total={summary.seconds}/></section><section className="sc-panel sc-observations"><h2>值得留意</h2><div><span className="sc-observation-icon"><ClockCircleOutlined/></span><p>使用最集中的钟点<strong>{String(summary.peak_hour).padStart(2,'0')}:00 — {String(summary.peak_hour+1).padStart(2,'0')}:00</strong><small>累计 {duration(data.hourly[summary.peak_hour].seconds)}</small></p></div><div><span className="sc-observation-icon"><AppstoreOutlined/></span><p>使用最多的应用<strong>{data.apps[0].name}</strong><small>占设备累计时长 {(data.apps[0].seconds/summary.seconds*100).toFixed(1)}%</small></p></div><Button block onClick={()=>setDetails({all:true})}>查看全部使用时段 <RightOutlined/></Button></section></div></div>
        {mode!=='day' && <section className="sc-panel"><div className="sc-panel-heading"><div><h2>时段分布</h2><p>将所选日期按钟点汇总，发现常用设备的时间习惯</p></div><span className="sc-count-label">所选 {summary.days} 天累计</span></div><UsageChart rows={data.hourly} devices={data.devices} group={group} hourly/></section>}
        <div className="sc-data-footnote"><span><i/> 最新记录：{dateTime(activeDevice?.last_event || latest)}</span><button onClick={()=>setSources(true)}>统计口径与数据来源 <RightOutlined/></button></div>
      </>}
    </>}
    <Drawer title="设备与数据" open={sources} onClose={()=>setSources(false)} size="min(560px, 94vw)" className="sc-drawer">
      <ScreenCollectors active={sources} canWrite={write}/>
      <p className="muted">数据来自设备的前台应用活动记录。手机和平板的记录到达 Mac 的时间可能晚于实际使用时间。</p>
      {data?.devices.map(d=><div className="sc-source-device" key={d.key}><span className="sc-device-icon" style={{color:deviceColor(d.kind)}}>{deviceIcon(d.kind)}</span><div><h3>{d.name}{write && <Button type="text" size="small" icon={<EditOutlined/>} aria-label={`重命名${d.name}`} onClick={()=>setEditor({type:'device',...d})}/>}</h3><p>最新事件 {dateTime(d.last_event)}</p><p>最近入库 {dateTime(d.imported_at)}</p><small>{d.has_data ? `起始记录 ${dateTime(d.first_event)}` : '此设备暂未提供可解析的事件'}</small></div></div>)}
      <div className="sc-source-section"><h3>统计口径</h3>{data && <p>所选范围内已还原 {data.summary.sessions} 个正常使用片段；另外排除 {data.quality.system} 个系统状态区间、{data.quality.short} 个不足1秒的片段，保留 {data.summary.anomalies} 个异常或未闭合区间。</p>}<p>前台使用片段在1秒至4小时之间才计入统计；锁屏、屏保和待机界面不计入。Mac前台记录可能包含空闲时间，不能直接等同于专注时间。</p><p>所有时间按北京时间切分。日均只计算有正常使用记录的日期。跨设备同时使用在设备累计时长中分别计入，在去重使用时长中只计一次。</p><p>夜间指23:00—次日06:00。未闭合和异常长区间保留但不计入，后续补充事件后可重新计算。通知次数、拿起次数和网页细分不属于当前数据范围。</p><p>每日计划的评价独立保存，不会被屏幕统计自动修改。</p></div>
      <div className="sc-source-section"><h3>更新记录</h3><p>导入已解析的屏幕记录文件，重复事件会自动跳过，迟到记录会补入对应日期。本页不会自动连接苹果账户或读取本机文件。</p>{write && <Button icon={<CloudUploadOutlined/>} onClick={()=>file.current?.click()}>导入记录</Button>}{data?.imports.map(row=><div className="sc-import-row" key={row.id}><span>{dateTime(row.imported_at)}</span><span>新增 {row.added} / 接收 {row.received} 条</span></div>)}</div>
    </Drawer>
    <Drawer title={details?.anomaly ? '异常记录' : details?.all ? '使用明细' : details?.name || '应用详情'} open={Boolean(details)} onClose={()=>setDetails(null)} size="min(740px, 94vw)" className="sc-drawer" destroyOnHidden>
      {details && <ScreenDetails key={`${query}-${details.app || (details.anomaly ? 'anomaly' : 'all')}`} query={query} app={details.app ? details : null} anomaly={details.anomaly} onEdit={write ? app=>setEditor({type:'app',...app}) : undefined}/>}
    </Drawer>
    <Modal title={editor?.type==='device' ? '设备名称' : '应用名称与分类'} open={Boolean(editor)} onCancel={()=>!saving && setEditor(null)} onOk={saveEditor} confirmLoading={saving} okText="保存" cancelText="取消" destroyOnHidden>
      {editor && <div className="sc-editor"><label>显示名称<Input value={editor.name} maxLength={80} onChange={e=>setEditor({...editor,name:e.target.value})}/></label>{editor.type==='app' && <><label>应用分类<Select aria-label="应用分类" value={editor.category} options={Object.entries(categories).map(([value,category])=>({value,label:category.name}))} onChange={category=>setEditor({...editor,category})}/></label><p className="muted">修改仅影响你自己的显示名称与分类，历史统计将按新分类展示。</p></>}</div>}
    </Modal>
    <Modal title="导入屏幕记录" open={Boolean(pendingImport)} onCancel={()=>!importing && setPendingImport(null)} onOk={importFile} confirmLoading={importing} okText="确认导入" cancelText="取消">
      {pendingImport && <><p>{pendingImport.name}</p><p className="muted">包含 {pendingImport.body.devices.length} 个设备、{pendingImport.body.events.length} 条事件，将保存到当前账户。重复事件不会重复累计。</p></>}
    </Modal>
  </main>;
}
