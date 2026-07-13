import { Button, Col, DatePicker, Row, Segmented, Select, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

const { RangePicker } = DatePicker;

export default function TradeWorkspaceFilterBar({
  viewMode,
  setViewMode,
  symbolOptions,
  onSetDateRange,
  onUpdateFilter,
  onCreateTrade,
}) {
  return (
    <div className="ink-filter-bar trade-control-bar">
      <Row justify="space-between" align="middle" gutter={[12, 12]}>
        <Col>
          <Segmented
            value={viewMode}
            onChange={setViewMode}
            options={[
              { label: '成交流水', value: 'fills' },
              { label: '当前持仓', value: 'positions' },
            ]}
          />
        </Col>

        {viewMode === 'fills' && (
          <Col flex="auto">
            <Space wrap className="trade-filter-controls">
              <RangePicker onChange={onSetDateRange} />
              <Select
                placeholder="交易类型"
                allowClear
                style={{ width: 120 }}
                options={['期货', '加密货币', '股票', '外汇'].map((v) => ({ label: v, value: v }))}
                onChange={(v) => onUpdateFilter('instrument_type', v)}
              />
              <Select
                placeholder="品种"
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ width: 170 }}
                options={symbolOptions || []}
                onChange={(v) => onUpdateFilter('symbol', v)}
              />
              <Select
                placeholder="方向"
                allowClear
                style={{ width: 100 }}
                options={[
                  { label: '做多', value: '做多' },
                  { label: '做空', value: '做空' },
                ]}
                onChange={(v) => onUpdateFilter('direction', v)}
              />
              <Select
                placeholder="状态"
                allowClear
                style={{ width: 100 }}
                options={[
                  { label: '持仓', value: 'open' },
                  { label: '已平', value: 'closed' },
                ]}
                onChange={(v) => onUpdateFilter('status', v)}
              />
            </Space>
          </Col>
        )}

        <Col className="trade-primary-action">
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreateTrade}>
            新建交易
          </Button>
        </Col>
      </Row>
    </div>
  );
}
