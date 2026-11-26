import { Tooltip } from 'antd';
import dayjs from 'dayjs';
import { categories, deviceColor, duration } from './screenStats';

function Stacks({values, series, total, height}) {
  return <div className="sc-stack" style={{height}}>{series.map(s=>values[s.key]>0 && <span key={s.key} style={{height:`${values[s.key]/total*100}%`,background:s.color}}/>)}</div>;
}

export function UsageChart({rows,devices,group='device',onDay,hourly=false}) {
  const series=group==='device' ? devices.map(d=>({key:d.key,name:d.name,color:deviceColor(d.kind)}))
    : Object.entries(categories).map(([key,value])=>({key,...value}));
  const maximum=Math.max(...rows.map(r=>r.seconds || 0),3600);
  const ceiling=Math.ceil(maximum/3600)*3600;
  const activeSeries=series.filter(s=>rows.some(r=>(group==='device' ? r.devices : r.categories)[s.key]>0));
  return <>
    <div className="sc-chart-layout" role="group" aria-label={hourly ? '每小时累计使用时长' : '每日使用时长，可点击日期查看'}>
      <div className="sc-y-axis">{[1,.75,.5,.25,0].map(n=><span key={n}>{Math.round(ceiling*n/3600*10)/10}h</span>)}</div>
      <div className="sc-plot-scroll"><div className="sc-plot" style={{gridTemplateColumns:`repeat(${rows.length},minmax(0,1fr))`,minWidth:!hourly && rows.length>28 ? rows.length*9 : undefined}}>
        <div className="sc-grid-lines" aria-hidden="true">{[0,1,2,3,4].map(n=><i key={n}/>)}</div>
        {rows.map((r,index)=>{
          const values=group==='device' ? r.devices : r.categories;
          const label=hourly ? `${String(r.hour).padStart(2,'0')}:00` : dayjs(r.date).format('M月D日');
          const text=r.seconds===null ? '暂无使用记录' : duration(r.seconds);
          const content=<div className="sc-chart-tip"><strong>{label} · {text}</strong>{activeSeries.map(s=>values[s.key]>0 && <span key={s.key}>{s.name}<b>{duration(values[s.key])}</b></span>)}{r.anomalies>0 && <span>另有 {r.anomalies} 段异常，未计入</span>}</div>;
          return <Tooltip key={r.date ?? r.hour} title={content}>
            <button type="button" className={`sc-bar-column${r.seconds===null ? ' is-missing' : ''}`} onClick={()=>!hourly && onDay?.(r.date)} aria-label={`${label} ${text}${!hourly ? '，查看当天' : ''}`}>
              <div className="sc-bar-space"><Stacks values={values} series={activeSeries} total={r.seconds || 1} height={r.seconds ? `${r.seconds/ceiling*100}%` : '0%'}/>{r.seconds===null && <span className="sc-missing-mark">—</span>}</div>
              <span className="sc-bar-label">{hourly ? (index%4===0 ? `${r.hour}时` : '') : rows.length<10 || index%Math.ceil(rows.length/10)===0 || index===rows.length-1 ? dayjs(r.date).locale('zh-cn').format(rows.length<10 ? 'ddd' : 'D') : ''}</span>
            </button>
          </Tooltip>;
        })}
      </div></div>
    </div>
    <div className="sc-chart-legend">{activeSeries.map(s=><span key={s.key}><i style={{background:s.color}}/>{s.name}</span>)}{rows.some(r=>r.seconds===null) && <span>— 暂无记录</span>}</div>
  </>;
}

export function CategoryBreakdown({items,total}) {
  let cursor=0;
  const arcs=items.map(item=>{
    const from=cursor;cursor+=item.seconds/total*100;
    return `${categories[item.key].color} ${from}% ${cursor}%`;
  });
  return <div className="sc-category-content">
    <div className="sc-donut" style={{background:total ? `conic-gradient(${arcs.join(',')})` : 'var(--nk-color-surface-2)'}} role="img" aria-label={items.map(i=>`${i.name} ${duration(i.seconds)}`).join('，')}><div><strong>{items.length}</strong><span>应用分类</span></div></div>
    <div className="sc-category-list">{items.map(item=><div key={item.key}><span><i style={{background:categories[item.key].color}}/>{item.name}</span><b>{duration(item.seconds)}</b><small>{(item.seconds/total*100).toFixed(1)}%</small></div>)}</div>
  </div>;
}
