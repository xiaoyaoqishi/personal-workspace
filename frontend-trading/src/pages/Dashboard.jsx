import { useEffect, useMemo, useState } from 'react';
import { Col, Collapse, Empty, Row, Spin, Tabs, Typography } from 'antd';
import {
  LineChartOutlined,
  PieChartOutlined,
  AuditOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { tradeApi } from '../api';
import './Dashboard.css';
import AnalyticsFilterBar from '../features/trading/analytics/AnalyticsFilterBar';
import OverviewKpis from '../features/trading/analytics/OverviewKpis';
import TimeSeriesPanel from '../features/trading/analytics/TimeSeriesPanel';
import DimensionPanel from '../features/trading/analytics/DimensionPanel';
import StructuredReviewPanels from '../features/trading/analytics/StructuredReviewPanels';
import BehaviorPanels from '../features/trading/analytics/BehaviorPanels';
import CoverageAndPositions from '../features/trading/analytics/CoverageAndPositions';
import EquityCurvePanel from '../features/trading/analytics/EquityCurvePanel';
import PnlDistributionPanel from '../features/trading/analytics/PnlDistributionPanel';
import MonthlyReturnsGrid from '../features/trading/analytics/MonthlyReturnsGrid';
import StreaksPanel from '../features/trading/analytics/StreaksPanel';
import DisciplinePanel from '../features/trading/analytics/DisciplinePanel';
import HoldingAnalysisPanel from '../features/trading/analytics/HoldingAnalysisPanel';
import { formatSymbolDimensionKey } from '../features/trading/display';

const DIRECTION_ZH = { 做多: '做多', 做空: '做空', 买入: '买入', 卖出: '卖出' };

export default function Dashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const [sourceOptions, setSourceOptions] = useState([]);

  useEffect(() => {
    setLoading(true);
    tradeApi.analytics(filters)
      .then((res) => setAnalytics(res.data || null))
      .catch(() => setAnalytics(null))
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => {
    tradeApi.sources()
      .then((res) => setSourceOptions((res.data?.items || []).map((v) => ({ label: v, value: v }))))
      .catch(() => setSourceOptions([]));
  }, []);

  const parseCsv = (v) => String(v || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

  const filterValues = useMemo(() => {
    const hasDate = filters.date_from && filters.date_to;
    return {
      dateRange: hasDate ? [dayjs(filters.date_from), dayjs(filters.date_to)] : null,
      symbols: parseCsv(filters.symbol),
      sources: parseCsv(filters.source_keyword),
    };
  }, [filters]);

  const symbolOptions = useMemo(() => {
    const rows = analytics?.dimensions?.by_symbol || [];
    return rows
      .map((row) => {
        const key = String(row?.key || '').trim();
        if (!key) return null;
        return { value: key, label: formatSymbolDimensionKey(key) };
      })
      .filter(Boolean);
  }, [analytics]);

  const setDateRange = (dates) => {
    setFilters((prev) => {
      if (dates) {
        return { ...prev, date_from: dates[0].format('YYYY-MM-DD'), date_to: dates[1].format('YYYY-MM-DD') };
      }
      const { date_from, date_to, ...rest } = prev;
      return rest;
    });
  };

  const setSymbol = (values) => {
    setFilters((prev) => {
      if (!values || values.length === 0) {
        const { symbol, ...rest } = prev;
        return rest;
      }
      return { ...prev, symbol: values.join(',') };
    });
  };

  const setSource = (values) => {
    setFilters((prev) => {
      if (!values || values.length === 0) {
        const { source_keyword, ...rest } = prev;
        return rest;
      }
      return { ...prev, source_keyword: values.join(',') };
    });
  };

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!analytics) return <Empty description="暂无数据" />;

  const overview = analytics.overview || {};
  const dimensions = analytics.dimensions || {};
  const behavior = analytics.behavior || {};
  const coverage = analytics.coverage || {};
  const positions = analytics.positions || {};
  const timeSeries = analytics.time_series || {};

  const tabItems = [
    {
      key: 'performance',
      label: (
        <span><LineChartOutlined /> 绩效总览</span>
      ),
      children: (
        <div className="analytics-workspace">
          <OverviewKpis overview={overview} />
          <EquityCurvePanel data={analytics.equity_curve} />
          <TimeSeriesPanel series={timeSeries} />
        </div>
      ),
    },
    {
      key: 'dimensions',
      label: (
        <span><PieChartOutlined /> 维度分析</span>
      ),
      children: (
        <div className="analytics-workspace">
          <Row gutter={[12, 12]}>
            <Col xs={24} xl={12}>
              <DimensionPanel
                title="品种维度"
                rows={dimensions.by_symbol || []}
                keyLabel="品种"
                valueFormatter={formatSymbolDimensionKey}
                tablePageSize={5}
                pageSizeOptions={[5, 10, 20, 50, 100]}
              />
            </Col>
            <Col xs={24} xl={12}>
              <DimensionPanel title="来源维度" rows={dimensions.by_source || []} keyLabel="来源" />
            </Col>
          </Row>
          <DimensionPanel
            title="方向维度"
            rows={(dimensions.by_direction || []).map((r) => ({
              ...r,
              key_display: DIRECTION_ZH[r.key] || r.key,
            }))}
            keyLabel="方向"
            valueFormatter={(key) => DIRECTION_ZH[key] || key}
          />
          <MonthlyReturnsGrid data={analytics.monthly_grid} />
        </div>
      ),
    },
    {
      key: 'review',
      label: (
        <span><AuditOutlined /> 复盘与纪律</span>
      ),
      children: (
        <div className="analytics-workspace">
          <StructuredReviewPanels byReviewField={dimensions.by_review_field || {}} />
          <BehaviorPanels behavior={behavior} />
          <DisciplinePanel data={analytics.discipline} />
          <CoverageAndPositions coverage={coverage} positions={positions} hidePositions />
        </div>
      ),
    },
    {
      key: 'risk',
      label: (
        <span><SafetyCertificateOutlined /> 风控与持仓</span>
      ),
      children: (
        <div className="analytics-workspace">
          <PnlDistributionPanel data={analytics.pnl_distribution} />
          <StreaksPanel data={analytics.streaks} />
          <HoldingAnalysisPanel data={analytics.holding_analysis} />
          <CoverageAndPositions coverage={coverage} positions={positions} hideCoverage />
        </div>
      ),
    },
  ];

  return (
    <div className="analytics-workspace">
      <div className="analytics-header">
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            交易分析工作台
          </Typography.Title>
          <Typography.Text type="secondary">
            多维复盘视角：绩效、维度、复盘纪律与风控持仓。
          </Typography.Text>
        </div>
      </div>

      <AnalyticsFilterBar
        symbolOptions={symbolOptions}
        sourceOptions={sourceOptions}
        filterValues={filterValues}
        onSetDateRange={setDateRange}
        onSetSymbol={setSymbol}
        onSetSource={setSource}
      />

      <Tabs
        className="analytics-tabs"
        defaultActiveKey="performance"
        items={tabItems}
        destroyInactiveTabPane={false}
      />

      <Collapse
        ghost
        size="small"
        items={[
          {
            key: 'notes',
            label: '口径说明',
            children: (
              <div className="analytics-note-list">
                <div>1. 结构化复盘分类字段的标准键保持英文，界面统一显示中文标签。</div>
                <div>2. 来源展示优先使用来源元数据，旧备注仅作兼容回退。</div>
                <div>3. 本页不改变粘贴导入、平仓匹配、统计/持仓业务语义。</div>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
