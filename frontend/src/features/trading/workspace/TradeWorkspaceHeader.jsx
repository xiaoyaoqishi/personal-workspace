import { Button, Space, Typography } from 'antd';
import { ImportOutlined, PlusOutlined } from '@ant-design/icons';

export default function TradeWorkspaceHeader({ onOpenImport, onCreateTrade }) {
  return (
    <div className="trade-page-header">
      <div>
        <Typography.Title level={4} style={{ margin: 0 }}>
          交易工作台
        </Typography.Title>
        <Typography.Text type="secondary">
          成交流水、来源元数据、结构化复盘在同一页面协同处理。
        </Typography.Text>
      </div>
      <Space>
        <Button icon={<ImportOutlined />} onClick={onOpenImport}>
          粘贴导入
        </Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={onCreateTrade}>
          新建交易
        </Button>
      </Space>
    </div>
  );
}
