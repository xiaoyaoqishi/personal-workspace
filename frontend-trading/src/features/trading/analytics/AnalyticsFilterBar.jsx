import { Col, DatePicker, Row, Select, Space } from 'antd';

const { RangePicker } = DatePicker;

export default function AnalyticsFilterBar({
  symbolOptions,
  sourceOptions,
  filterValues,
  onSetDateRange,
  onSetInstrumentType,
  onSetSymbol,
  onSetSource,
}) {
  return (
    <div className="ink-filter-bar">
      <Row justify="space-between" align="middle" gutter={[12, 12]}>
        <Col>
          <Space wrap>
            <RangePicker value={filterValues.dateRange} onChange={onSetDateRange} />
            <Select
              placeholder="交易类型"
              allowClear
              style={{ width: 130 }}
              options={['期货', '加密货币', '股票', '外汇'].map((value) => ({ label: value, value }))}
              value={filterValues.instrumentType}
              onChange={onSetInstrumentType}
            />
            <Select
              placeholder="品种"
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: 220 }}
              options={symbolOptions}
              value={filterValues.symbols}
              onChange={onSetSymbol}
            />
            <Select
              placeholder="券商来源"
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: 220 }}
              options={sourceOptions}
              value={filterValues.sources}
              onChange={onSetSource}
            />
          </Space>
        </Col>
      </Row>
    </div>
  );
}
