import dayjs from 'dayjs';
import { chinaNow } from './api';

export const focusLabels = {balanced:'综合复盘',routine:'计划执行',screen:'用机习惯'};
export const detailLabels = {concise:'精简',detailed:'详细'};
export const stateLabels = {queued:'等待生成',running:'正在生成',success:'已完成',failed:'未生成成功'};
export const monday = value => dayjs(value).subtract((dayjs(value).day()+6)%7,'day');
export const latestAnchor = period => (period==='week' ? monday(chinaNow()).subtract(7,'day') : chinaNow().subtract(1,'day')).format('YYYY-MM-DD');
export function rangeLabel(period, value) {
  const start=period==='week' ? monday(value) : dayjs(value);
  return period==='week' ? `${start.format('MM月DD日')} — ${start.add(6,'day').format('MM月DD日')}` : start.format('YYYY年MM月DD日');
}
export function duration(seconds) {
  if(seconds==null) return '—';
  const minutes=Math.round(seconds/60);
  return minutes>=60 ? `${Math.floor(minutes/60)}小时${minutes%60 ? `${minutes%60}分` : ''}` : `${minutes}分钟`;
}
export async function aiApi(path, options={}) {
  const response=await fetch(`/api/discipline/ai/${path}`,{credentials:'same-origin',...options,
    ...(options.body ? {headers:{'Content-Type':'application/json'},body:JSON.stringify(options.body)} : {})});
  const value=await response.json();
  if(response.status===401) {location.href='/login';throw new Error('请先登录');}
  if(!response.ok) throw new Error(typeof value.detail==='string' ? value.detail : '暂时无法读取复盘，请稍后重试');
  return value;
}
export function reportText(report) {
  const body=report.content;
  if(!body) return '';
  const source=report.snapshot;
  let result=`# ${body.title}\n\n${rangeLabel(report.period,report.start)}\n\n${body.summary}\n`;
  for(const [key,title] of [['strengths','值得保持'],['attention','留意一下'],['patterns','发现的规律'],['actions','下一步行动']]) {
    if(!body[key]?.length) continue;
    result+=`\n## ${title}\n`;
    for(const card of body[key]) {
      result+=`\n- ${card.title}：${card.body}\n`;
      for(const id of card.evidence_ids) {
        const item=source.evidence.find(e=>e.id===id);
        if(item) result+=`  依据：${item.detail}\n`;
      }
    }
  }
  return result+`\n依据截至 ${source.data_as_of || '本次已入库记录'} 的数据；AI建议仅供复盘。\n`;
}
