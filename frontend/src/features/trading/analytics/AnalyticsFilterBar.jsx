import { Card, Col, DatePicker, Row, Select, Space } from 'antd';
import { FUTURES_SYMBOL_OPTIONS } from '../../../utils/futures';

const { RangePicker } = DatePicker;

export default function AnalyticsFilterBar({
  sourceOptions,
  filterValues,
  onSetDateRange,
  onSetSymbol,
  onSetSource,
}) {
  return (
    <Card className="analytics-filter-card">
      <Row justify="space-between" align="middle" gutter={[12, 12]}>
        <Col>
          <Space wrap>
            <RangePicker value={filterValues.dateRange} onChange={onSetDateRange} />
            <Select
              placeholder="品种"
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: 170 }}
              options={FUTURES_SYMBOL_OPTIONS}
              value={filterValues.symbols}
              onChange={onSetSymbol}
            />
            <Select
              placeholder="券商来源"
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: 190 }}
              options={sourceOptions}
              value={filterValues.sources}
              onChange={onSetSource}
            />
          </Space>
        </Col>
      </Row>
    </Card>
  );
}
