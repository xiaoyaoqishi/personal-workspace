import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
export const chinaNow = () => dayjs().tz('Asia/Shanghai');
export const today = () => chinaNow().format('YYYY-MM-DD');
export const gradeLabels = {good:'执行良好', improve:'有待改进', failed:'执行失败', untracked:'未选择统计时段', excluded:'不纳入统计', pending:'今日待记录', future:'尚未开始', not_started:'未开始记录'};
export const dayLabels = {workday:'正常工作日', weekend:'周末', holiday:'节假日', unknown_calendar:'节假日表待更新'};
export async function api(path, body) {
  const response = await fetch(`/api/discipline/${path}`, { credentials:'same-origin', ...(body ? {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)} : {}) });
  const data = await response.json();
  if (response.status === 401) { window.location.href='/login'; throw new Error('请先登录'); }
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '请检查时间段：主题必填、结束晚于开始，且不能重叠');
  return data;
}

export function previewAchievement(slots, dayType) {
  const selected = slots.filter(slot => slot.included);
  const total = selected.reduce((sum, slot) => sum + ({aligned:100, partial:50}[slot.status] || 0), 0);
  const grade = !selected.length ? 'untracked' : total >= 75 * selected.length ? 'good' : total >= 40 * selected.length ? 'improve' : 'failed';
  return {rate:dayType === 'workday' && selected.length ? Math.round(total / selected.length * 10) / 10 : null,
    grade:dayType === 'workday' ? grade : 'excluded', selected:selected.length};
}
