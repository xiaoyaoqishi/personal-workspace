import { Empty, Tooltip } from 'antd';
import InkSection from '../../../components/InkSection';

const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

function pnlColor(pnl, maxAbs) {
  if (!maxAbs || maxAbs < 1e-9) return 'var(--td-color-bg-container)';
  const ratio = Math.min(Math.abs(pnl) / maxAbs, 1);
  const alpha = 0.15 + ratio * 0.7;
  return pnl > 0 ? `rgba(207, 19, 34, ${alpha})` : pnl < 0 ? `rgba(63, 134, 0, ${alpha})` : 'var(--td-color-bg-container)';
}

export default function MonthlyReturnsGrid({ data }) {
  if (!data || data.length === 0) return null;

  const years = [...new Set(data.map((d) => d.year))].sort();
  const lookup = {};
  let maxAbs = 0;
  for (const d of data) {
    lookup[`${d.year}-${d.month}`] = d;
    if (Math.abs(d.pnl) > maxAbs) maxAbs = Math.abs(d.pnl);
  }

  return (
    <InkSection title="月度收益矩阵">
      {data.length === 0 ? (
        <Empty description="暂无数据" />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="monthly-grid-table">
            <thead>
              <tr>
                <th>年份</th>
                {MONTH_LABELS.map((m) => (
                  <th key={m}>{m}</th>
                ))}
                <th>全年</th>
              </tr>
            </thead>
            <tbody>
              {years.map((year) => {
                const yearTotal = data.filter((d) => d.year === year).reduce((s, d) => s + d.pnl, 0);
                return (
                  <tr key={year}>
                    <td className="monthly-grid-year">{year}</td>
                    {Array.from({ length: 12 }, (_, i) => {
                      const cell = lookup[`${year}-${i + 1}`];
                      const pnl = cell?.pnl ?? 0;
                      return (
                        <td key={i} style={{ background: cell ? pnlColor(pnl, maxAbs) : undefined }}>
                          {cell ? (
                            <Tooltip title={`${cell.count}笔 | 胜率${cell.win_rate}%`}>
                              <span className={`monthly-grid-val ${pnl >= 0 ? 'pnl-pos' : 'pnl-neg'}`}>
                                {pnl.toFixed(0)}
                              </span>
                            </Tooltip>
                          ) : (
                            <span className="monthly-grid-empty">-</span>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ background: pnlColor(yearTotal, maxAbs), fontWeight: 600 }}>
                      <span className={yearTotal >= 0 ? 'pnl-pos' : 'pnl-neg'}>{yearTotal.toFixed(0)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </InkSection>
  );
}
