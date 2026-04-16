import { Col, Row, Statistic } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';

export default function OverviewKpis({ overview }) {
  const cards = [
    { title: '总交易数', value: overview.total_trades },
    { title: '已平仓', value: overview.closed_trades },
    { title: '持仓中', value: overview.open_trades },
    { title: '胜率', value: overview.win_rate, suffix: '%', precision: 2 },
    { title: '净利润', value: overview.total_pnl, pnl: true, precision: 2 },
    { title: '单笔期望', value: overview.expectancy_per_trade, precision: 2 },
    { title: '平均盈利', value: overview.avg_win },
    { title: '平均亏损', value: overview.avg_loss },
    { title: '盈亏因子', value: overview.profit_factor, precision: 4 },
    { title: '夏普比率', value: overview.sharpe_ratio, precision: 4 },
    { title: '手续费/净利润', value: overview.commission_to_net_profit_ratio, precision: 4 },
    { title: '盈利占比', value: overview.profit_share_rate, suffix: '%', precision: 2 },
    { title: '总手续费', value: overview.total_commission, precision: 2 },
    { title: '毛利润', value: overview.gross_profit, pnl: true, precision: 2 },
    { title: '毛亏损', value: overview.gross_loss, pnl: true, precision: 2 },
    { title: '最大回撤', value: overview.max_drawdown, precision: 2 },
    { title: '当前持仓品种数', value: overview.open_position_count },
  ];

  return (
    <Row gutter={[12, 12]}>
      {cards.map((c) => {
        const isNumber = typeof c.value === 'number' && Number.isFinite(c.value);
        const precision = c.precision ?? (isNumber && !Number.isInteger(c.value) ? 2 : 0);
        const displayValue = isNumber ? c.value : '-';
        return (
          <Col key={c.title} xs={12} sm={8} md={6} xl={4}>
            <div className="ink-kpi-item">
              <Statistic
                title={c.title}
                value={displayValue}
                suffix={c.suffix}
                precision={isNumber ? precision : undefined}
                prefix={
                  c.pnl && isNumber
                    ? c.value >= 0
                      ? <ArrowUpOutlined />
                      : <ArrowDownOutlined />
                    : undefined
                }
                valueStyle={
                  c.pnl && isNumber
                    ? { color: c.value >= 0 ? '#cf1322' : '#3f8600' }
                    : undefined
                }
              />
            </div>
          </Col>
        );
      })}
    </Row>
  );
}
