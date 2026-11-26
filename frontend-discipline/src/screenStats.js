import dayjs from 'dayjs';
import { chinaNow } from './api';

export const categories = {
  work:{name:'工作',color:'var(--sc-work)'}, study:{name:'学习',color:'var(--sc-study)'},
  social:{name:'社交',color:'var(--sc-social)'}, entertainment:{name:'影音与内容',color:'var(--sc-entertainment)'},
  games:{name:'游戏',color:'var(--sc-games)'}, finance:{name:'财务',color:'var(--sc-finance)'},
  tools:{name:'工具',color:'var(--sc-tools)'}, other:{name:'未分类',color:'var(--sc-other)'},
};
export const deviceColor = kind => ({iphone:'var(--nk-color-primary)',ipad:'var(--nk-color-success)',mac:'var(--nk-color-info)'}[kind] || 'var(--nk-color-text-secondary)');
export const duration = seconds => {
  if(seconds === null || seconds === undefined) return '—';
  if(seconds < 60) return `${Math.floor(seconds)}秒`;
  const minutes=Math.round(seconds/60), hours=Math.floor(minutes/60);
  return hours ? `${hours}小时${minutes%60 ? `${minutes%60}分` : ''}` : `${minutes}分钟`;
};
export function periodRange(mode, anchor) {
  const date=dayjs(anchor);
  if(mode==='week') {
    const start=date.subtract((date.day()+6)%7,'day');
    return [start.format('YYYY-MM-DD'),start.add(6,'day').format('YYYY-MM-DD')];
  }
  if(mode==='month') return [date.startOf('month').format('YYYY-MM-DD'),date.endOf('month').format('YYYY-MM-DD')];
  return [date.format('YYYY-MM-DD'),date.format('YYYY-MM-DD')];
}
export function screenSelection(params) {
  const mode=['day','week','month'].includes(params.get('view')) ? params.get('view') : 'day';
  const raw=params.get('date');
  const anchor=raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && dayjs(raw).isValid() && dayjs(raw).format('YYYY-MM-DD')===raw && +raw.slice(0,4)>=2001 && +raw.slice(0,4)<=2100
    ? raw : chinaNow().subtract(1,'day').format('YYYY-MM-DD');
  return {mode,anchor,device:params.get('device') || ''};
}
export async function screenApi(path, {body,method,signal}={}) {
  const response=await fetch(`/api/discipline/screen/${path}`,{credentials:'same-origin',signal,
    method:method || (body ? 'PUT' : 'GET'),...(body ? {headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {})});
  if(response.status===401) {window.location.href='/login';throw new Error('请先登录');}
  const data=await response.json();
  if(!response.ok) throw new Error(data.error?.message || (typeof data.detail==='string' ? data.detail : '数据格式不正确，请检查导入文件或所选范围'));
  return data;
}
