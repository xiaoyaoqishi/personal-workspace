import { useEffect, useMemo, useState } from 'react';
import { Button, Empty, List, Popconfirm, Space, Tabs, Tag, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { recycleApi } from '../api';
import './ReviewList.css';

const RECYCLE_TABS = [
  {
    key: 'trades',
    label: '成交记录',
    title: (row) => `${row.trade_date || '-'} / ${row.contract || row.symbol || `交易 #${row.id}`}`,
    extra: (row) => `方向 ${row.direction || '-'} / 手数 ${row.quantity ?? '-'} / 状态 ${row.status || '-'}`,
    api: recycleApi.trades,
  },
  {
    key: 'knowledgeItems',
    label: '知识',
    title: (row) => row.title || `知识 #${row.id}`,
    extra: (row) => `分类 ${row.category || '-'} / 状态 ${row.status || '-'}`,
    api: recycleApi.knowledgeItems,
  },
  {
    key: 'tradeBrokers',
    label: '券商',
    title: (row) => row.name || `券商 #${row.id}`,
    extra: (row) => `账户 ${row.account || '-'}`,
    api: recycleApi.tradeBrokers,
  },
  {
    key: 'reviewSessions',
    label: '复盘',
    title: (row) => row.title || `复盘会话 #${row.id}`,
    extra: (row) => `类型 ${row.review_kind || '-'} / 范围 ${row.review_scope || '-'}`,
    api: recycleApi.reviewSessions,
  },
  {
    key: 'tradePlans',
    label: '计划',
    title: (row) => row.title || `交易计划 #${row.id}`,
    extra: (row) => `日期 ${row.plan_date || '-'} / 状态 ${row.status || '-'}`,
    api: recycleApi.tradePlans,
  },
];

function formatDeletedAt(value) {
  if (!value) return '-';
  const t = dayjs(value);
  return t.isValid() ? t.format('YYYY-MM-DD HH:mm:ss') : String(value);
}

export default function TradingRecycleBin() {
  const [tabKey, setTabKey] = useState('trades');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const activeTab = useMemo(
    () => RECYCLE_TABS.find((item) => item.key === tabKey) || RECYCLE_TABS[0],
    [tabKey]
  );

  const loadRows = async () => {
    setLoading(true);
    try {
      const res = await activeTab.api.list({ page: 1, size: 200 });
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch {
      message.error('回收站数据加载失败');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, [tabKey]);

  const handleRestore = async (id) => {
    try {
      await activeTab.api.restore(id);
      message.success('已恢复');
      await loadRows();
    } catch (e) {
      message.error(e.response?.data?.detail || '恢复失败');
    }
  };

  const handlePurge = async (id) => {
    try {
      await activeTab.api.purge(id);
      message.success('已彻底删除');
      await loadRows();
    } catch (e) {
      message.error(e.response?.data?.detail || '彻底删除失败');
    }
  };

  const handleClear = async () => {
    try {
      const res = await activeTab.api.clear();
      message.success(`已清空 ${res.data?.cleared || 0} 条记录`);
      await loadRows();
    } catch (e) {
      message.error(e.response?.data?.detail || '清空失败');
    }
  };

  return (
    <div className="review-workspace">
      <div className="review-toolbar">
        <div className="review-toolbar-inner">
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>交易回收站</Typography.Title>
            <Typography.Text type="secondary">删除后会先进入回收站，可恢复或彻底删除。</Typography.Text>
          </div>
          <Popconfirm
            title={`将彻底删除「${activeTab.label}」分类下所有 ${rows.length} 条记录，此操作不可恢复，确认继续？`}
            onConfirm={handleClear}
            disabled={rows.length === 0}
          >
            <Button danger disabled={rows.length === 0}>
              清空当前分类
            </Button>
          </Popconfirm>
        </div>
      </div>

      <div className="ink-content-wrap">
        <Tabs activeKey={tabKey} onChange={setTabKey} items={RECYCLE_TABS.map((item) => ({ key: item.key, label: item.label }))} />
        <List
          loading={loading}
          dataSource={rows}
          locale={{ emptyText: <Empty description="当前分类暂无已删除数据" /> }}
          renderItem={(row) => (
            <List.Item
              actions={[
                <Button key="restore" type="link" onClick={() => handleRestore(row.id)}>恢复</Button>,
                <Popconfirm
                  key="purge"
                  title="彻底删除后无法恢复，确认继续？"
                  onConfirm={() => handlePurge(row.id)}
                >
                  <Button type="link" danger>彻底删除</Button>
                </Popconfirm>,
              ]}
            >
              <Space direction="vertical" size={4}>
                <Typography.Text strong>{activeTab.title(row)}</Typography.Text>
                <Typography.Text type="secondary">{activeTab.extra(row)}</Typography.Text>
                <Space size={8}>
                  <Tag>删除时间 {formatDeletedAt(row.deleted_at)}</Tag>
                  <Tag>编号 #{row.id}</Tag>
                </Space>
              </Space>
            </List.Item>
          )}
        />
      </div>
    </div>
  );
}
