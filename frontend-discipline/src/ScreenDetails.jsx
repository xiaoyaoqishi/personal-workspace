import { useEffect, useState } from 'react';
import { Alert, Button, Empty, Pagination, Spin, Tag } from 'antd';
import { DownloadOutlined, EditOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { categories, duration, screenApi } from './screenStats';

export default function ScreenDetails({query,app,anomaly=false,onEdit}) {
  const [page,setPage]=useState(1);
  const [data,setData]=useState(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [reload,setReload]=useState(0);
  const params=`${query}&status=${anomaly ? 'anomaly' : 'normal'}${app ? `&app=${encodeURIComponent(app.app)}` : ''}`;
  useEffect(()=>{setPage(1);},[params]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');setData(null);
    screenApi(`sessions?${params}&offset=${(page-1)*25}&limit=25`,{signal:controller.signal}).then(setData)
      .catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[params,page,reload]);
  return <div className="sc-details">
    {app && <div className="sc-detail-hero"><div><span className="sc-app-glyph" style={{'--app-color':categories[app.category].color}}>{app.name.slice(0,1).toUpperCase()}</span><div><h2>{app.name}</h2><p>{categories[app.category].name} · {app.sessions} 个使用片段</p></div></div><strong>{duration(app.seconds)}</strong></div>}
    <div className="sc-detail-actions"><span className="muted">{anomaly ? '以下记录未计入正常统计' : '按开始时间倒序 · 北京时间'}</span><div>{app && onEdit && <Button icon={<EditOutlined/>} onClick={()=>onEdit(app)}>名称与分类</Button>}{!anomaly && <Button icon={<DownloadOutlined/>} href={`/api/discipline/screen/export?${query}${app ? `&app=${encodeURIComponent(app.app)}` : ''}`}>导出</Button>}</div></div>
    {anomaly && <Alert type="info" showIcon title="保留原始记录，不推测缺失时长" description="超过4小时的连续前台区间、尚未结束的记录均暂不计入。跨日记录只显示所选范围内的部分；空闲时间与实际使用需要进一步核对。"/>}
    {error && <Alert type="error" title={error} action={<Button onClick={()=>setReload(r=>r+1)}>重试</Button>}/>}
    {loading && <div className="sc-detail-loading"><Spin/></div>}
    {data && !data.total && <Empty description={anomaly ? '所选范围没有异常记录' : '暂无使用时段'}/>}
    {data?.items.map(row=><article className="sc-session" key={row.id}>
      <div className="sc-session-time"><strong>{dayjs(row.start).tz('Asia/Shanghai').format('HH:mm')}</strong><span>{dayjs(row.start).tz('Asia/Shanghai').format('M月D日')}</span></div>
      <div className="sc-session-main"><div><b>{row.name}</b><Tag variant="filled">{row.device_name}</Tag>{row.status!=='normal' && <Tag color="warning">{row.status==='open' ? '未闭合' : '异常长区间'}</Tag>}</div>
        <p>{dayjs(row.start).tz('Asia/Shanghai').format('MM-DD HH:mm:ss')} — {row.end ? dayjs(row.end).tz('Asia/Shanghai').format('MM-DD HH:mm:ss') : '尚未结束'}{row.clipped && ' · 已按所选日期截取'}</p>
        {anomaly && <small>原始区间：{dayjs(row.original_start).tz('Asia/Shanghai').format('MM-DD HH:mm:ss')} — {row.original_end ? dayjs(row.original_end).tz('Asia/Shanghai').format('MM-DD HH:mm:ss') : '未结束'}</small>}
      </div><strong className="sc-session-duration">{duration(row.seconds)}</strong>
    </article>)}
    {data?.total>25 && <Pagination current={page} total={data.total} pageSize={25} showSizeChanger={false} onChange={setPage} showTotal={value=>`共 ${value} 个时段`}/>}
  </div>;
}
