import { useEffect, useState } from 'react';
import { Alert, Button, Input, Popconfirm, Space, message } from 'antd';
import { CopyOutlined, KeyOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { screenApi } from './screenStats';

const when = value => value ? dayjs(value).tz('Asia/Shanghai').format('MM-DD HH:mm') : '尚未上传';

export default function ScreenCollectors({active,canWrite}) {
  const [items,setItems]=useState([]);
  const [name,setName]=useState('我的 Mac');
  const [issued,setIssued]=useState(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const [notice,holder]=message.useMessage();
  useEffect(()=>{
    if(!active) {setIssued(null);return;}
    const controller=new AbortController();
    screenApi('collectors',{signal:controller.signal}).then(value=>{if(!controller.signal.aborted) setItems(value.items);})
      .catch(e=>{if(!controller.signal.aborted) setError(e.message);});
    return ()=>controller.abort();
  },[active,refresh]);
  async function create() {
    if(!name.trim()) return;
    setBusy(true);setError('');
    try {setIssued(await screenApi('collectors',{method:'POST',body:{name}}));setRefresh(v=>v+1);}
    catch(e) {setError(e.message);} finally {setBusy(false);}
  }
  async function revoke(key) {
    setBusy(true);
    try {await screenApi(`collectors/${encodeURIComponent(key)}`,{method:'DELETE'});setIssued(null);setRefresh(v=>v+1);notice.success('已撤销，采集器将无法继续上传');}
    catch(e) {setError(e.message);} finally {setBusy(false);}
  }
  async function copy() {
    try {await navigator.clipboard.writeText(issued.token);notice.success('已复制');}
    catch {notice.info('请选中凭证后手动复制');}
  }
  return <section className="sc-source-section">
    {holder}<h3><KeyOutlined/> 自动采集连接</h3>
    <p>Mac 采集器每天同步一次。凭证仅允许上传屏幕记录和检查同步状态，可随时撤销。凭证只在创建后显示一次。</p>
    {error && <Alert type="error" title={error} action={<Button onClick={()=>{setError('');setRefresh(v=>v+1);}}>重试</Button>}/>}
    {canWrite && <Space.Compact block><Input aria-label="采集器名称" value={name} maxLength={80} onChange={e=>setName(e.target.value)}/><Button loading={busy} disabled={Boolean(issued) || !name.trim()} onClick={create}>创建凭证</Button></Space.Compact>}
    {issued && <div className="sc-issued-token"><Alert type="info" showIcon title="请保存到 Mac 采集器，关闭后不再显示"/><Input.Password aria-label="新建采集凭证" value={issued.token} readOnly autoComplete="off"/><Button icon={<CopyOutlined/>} onClick={copy}>复制凭证</Button></div>}
    {items.map(item=><div className="sc-collector-row" key={item.id}><div><b>{item.name}</b><small>{item.revoked_at ? '已撤销' : `最近成功上传 ${when(item.last_upload_at)}`}</small><small>累计新增 {item.events_added} 条事件</small></div>{!item.revoked_at && canWrite && <Popconfirm title="撤销此采集凭证？" description="已保存的历史记录会继续保留。" onConfirm={()=>revoke(item.id)} okText="撤销" cancelText="取消"><Button type="text" danger disabled={busy}>撤销</Button></Popconfirm>}</div>)}
  </section>;
}
