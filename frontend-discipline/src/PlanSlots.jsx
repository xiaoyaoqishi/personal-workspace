import { useState } from 'react';
import { Checkbox, Empty, Input, Select, Tag } from 'antd';

export const STATUS = [{value:'pending',label:'尚未评价'}, {value:'aligned',label:'符合主题'}, {value:'partial',label:'部分符合'}, {value:'off_track',label:'偏离主题'}];

export default function PlanSlots({ slots, editable = false, onChange, currentTime }) {
  const [expanded, setExpanded] = useState({});
  if (!slots.length) return <Empty description="该日期没有保存记录"/>;
  return slots.map((slot, index) => <section className={`plan-slot${slot.included ? ` slot-score-${slot.status}` : ''}${currentTime >= slot.start && currentTime < slot.end ? ' is-current' : ''}`} key={slot.id}>
    <div className="slot-time"><span>{slot.start}</span><span className="muted">{slot.end}</span></div>
    <div className="slot-body"><div className="slot-top"><div className="slot-heading"><h2>{slot.theme}</h2>
      {editable ? <Checkbox checked={slot.included} onChange={e=>onChange(index,'included',e.target.checked)}>计入统计</Checkbox> : <Tag>{slot.included ? '计入统计' : '不计入统计'}</Tag>}
    </div>{editable ? <Select aria-label={`${slot.start} ${slot.theme}执行情况`} value={slot.status} options={STATUS} onChange={value=>onChange(index,'status',value)} className="status-select"/> : <Tag>{STATUS.find(item=>item.value===slot.status)?.label}</Tag>}</div>
    {editable ? <><button className="record-toggle" aria-expanded={!!expanded[slot.id]} onClick={()=>setExpanded({...expanded,[slot.id]:!expanded[slot.id]})}>{expanded[slot.id] ? '收起记录' : slot.notes ? '查看 / 编辑记录' : '＋ 记录具体内容（可选）'}</button>
      {expanded[slot.id] ? <Input.TextArea aria-label={`${slot.start}具体内容`} value={slot.notes} maxLength={5000} autoSize={{minRows:2,maxRows:8}} placeholder="这段时间做了什么？可选填写具体内容或感受。" onChange={e=>onChange(index,'notes',e.target.value)}/> : slot.notes && <p className="slot-preview">{slot.notes}</p>}
    </> : slot.notes && <p className="slot-preview">{slot.notes}</p>}
    </div>
  </section>);
}
