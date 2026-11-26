const validTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '');
const minutes = value => Number(value.slice(0,2))*60 + Number(value.slice(3));
const format = value => `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;

export function suggestTimeSlot(slots) {
  const ordered=slots.filter(slot=>validTime(slot.start) && validTime(slot.end) && slot.start<slot.end).sort((a,b)=>a.start.localeCompare(b.start));
  if(!ordered.length) return {start:'07:00',end:'08:00'};
  const gaps=[];
  for(let i=1;i<ordered.length;i++) {
    const previousEnd=Math.max(...ordered.slice(0,i).map(slot=>minutes(slot.end)));
    if(previousEnd<minutes(ordered[i].start)) gaps.push([previousEnd,minutes(ordered[i].start)]);
  }
  const lastEnd=Math.max(...ordered.map(slot=>minutes(slot.end)));
  if(lastEnd<1439) gaps.push([lastEnd,1439]);
  if(minutes(ordered[0].start)>0) gaps.push([0,minutes(ordered[0].start)]);
  if(!gaps.length) return null;
  const [start,end]=gaps[0];
  return {start:format(start),end:format(Math.min(start+60,end))};
}

export function validateRoutineSlots(slots) {
  for(let i=0;i<slots.length;i++) {
    const slot=slots[i];
    if(!slot.theme.trim()) return `第 ${i+1} 段尚未填写主题`;
    if(!validTime(slot.start) || !validTime(slot.end)) return `第 ${i+1} 段需要填写有效的开始与结束时间`;
    if(slot.start>=slot.end) return `第 ${i+1} 段的结束时间必须晚于开始时间`;
  }
  const ordered=[...slots].sort((a,b)=>a.start.localeCompare(b.start));
  for(let i=1;i<ordered.length;i++) {
    if(ordered[i-1].end>ordered[i].start) return `「${ordered[i-1].theme}」与「${ordered[i].theme}」的时间重叠，请调整后保存`;
  }
  return '';
}
