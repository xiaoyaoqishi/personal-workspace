import { useEffect, useMemo, useState } from 'react';
import { Button, Col, Empty, Form, Input, Popconfirm, Row, Space, Table, Typography, message } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import InkSection from '../components/InkSection';
import { brokerApi } from '../api';
import './BrokerManage.css';

const { Search, TextArea } = Input;

function normalizeBrokerPayload(values) {
  return {
    name: values.name?.trim() || '',
    account: values.account?.trim() || null,
    password: values.password?.trim() || null,
    extra_info: values.extra_info?.trim() || null,
    notes: values.notes?.trim() || null,
  };
}

export default function InfoMaintain() {
  const [form] = Form.useForm();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);

  const selected = useMemo(() => rows.find((row) => row.id === selectedId) || null, [rows, selectedId]);
  const filteredRows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) => [row.name, row.account, row.extra_info, row.notes]
      .some((value) => String(value || '').toLowerCase().includes(keyword)));
  }, [query, rows]);

  const loadRows = async (preferredId = selectedId) => {
    setLoading(true);
    try {
      const res = await brokerApi.list();
      const nextRows = Array.isArray(res.data) ? res.data : [];
      setRows(nextRows);
      const nextId = nextRows.some((row) => row.id === preferredId) ? preferredId : (nextRows[0]?.id || null);
      setSelectedId(nextId);
    } catch {
      message.error('券商列表加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRows(null); }, []);

  useEffect(() => {
    if (!editing) return;
    form.setFieldsValue({
      name: selected?.name || '',
      account: selected?.account || '',
      password: selected?.password || '',
      extra_info: selected?.extra_info || '',
      notes: selected?.notes || '',
    });
  }, [editing, selected, form]);

  const startCreate = () => {
    setSelectedId(null);
    form.resetFields();
    setEditing(true);
  };

  const startEdit = () => {
    if (selected) setEditing(true);
  };

  const save = async () => {
    try {
      const values = await form.validateFields();
      const payload = normalizeBrokerPayload(values);
      setSaving(true);
      const res = selectedId
        ? await brokerApi.update(selectedId, payload)
        : await brokerApi.create(payload);
      message.success(selectedId ? '券商信息已更新' : '券商信息已创建');
      setEditing(false);
      await loadRows(res.data?.id || selectedId);
    } catch (error) {
      if (error?.errorFields) return;
      message.error(error.response?.data?.detail || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selectedId) return;
    try {
      await brokerApi.delete(selectedId);
      message.success('券商信息已移入回收站');
      setEditing(false);
      await loadRows(null);
    } catch (error) {
      message.error(error.response?.data?.detail || '删除失败');
    }
  };

  const columns = [
    { title: '券商', dataIndex: 'name', key: 'name' },
    { title: '账号', dataIndex: 'account', key: 'account', render: (value) => value || '--' },
  ];

  return (
    <div className="maintain-workspace">
      <div className="maintain-header-card maintain-header-main">
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>信息维护</Typography.Title>
          <Typography.Text type="secondary">统一维护交易导入与来源标记使用的券商信息。</Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={startCreate}>新建券商</Button>
      </div>

      <div className="maintain-module-body">
        <Row gutter={16}>
          <Col xs={24} lg={9}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Search allowClear value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索券商名称/账号/备注" />
              <InkSection title="券商来源目录" className="maintain-list-card" loading={loading}>
                <Table
                  rowKey="id"
                  size="small"
                  columns={columns}
                  dataSource={filteredRows}
                  pagination={false}
                  locale={{ emptyText: <Empty description="暂无券商来源" /> }}
                  rowClassName={(row) => row.id === selectedId ? 'ant-table-row-selected' : ''}
                  onRow={(row) => ({ onClick: () => { setSelectedId(row.id); setEditing(false); } })}
                />
              </InkSection>
            </Space>
          </Col>

          <Col xs={24} lg={15}>
            <InkSection title={selectedId ? `券商来源 #${selectedId}` : '新建券商来源'}>
              {editing ? (
                <Form form={form} layout="vertical">
                  <Row gutter={12}>
                    <Col span={12}><Form.Item name="name" label="券商名称" rules={[{ required: true, message: '请输入券商名称' }]}><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="account" label="账号"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item name="password" label="密码"><Input.Password /></Form.Item></Col>
                    <Col span={12}><Form.Item name="extra_info" label="其他信息"><Input /></Form.Item></Col>
                    <Col span={24}><Form.Item name="notes" label="备注"><TextArea rows={5} /></Form.Item></Col>
                  </Row>
                  <Space>
                    <Button type="primary" loading={saving} onClick={save}>保存</Button>
                    <Button onClick={() => setEditing(false)}>取消</Button>
                  </Space>
                </Form>
              ) : selected ? (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Row gutter={[12, 12]}>
                    <Col span={12}><Typography.Text type="secondary">券商名称</Typography.Text><div>{selected.name || '--'}</div></Col>
                    <Col span={12}><Typography.Text type="secondary">账号</Typography.Text><div>{selected.account || '--'}</div></Col>
                    <Col span={12}><Typography.Text type="secondary">其他信息</Typography.Text><div>{selected.extra_info || '--'}</div></Col>
                    <Col span={24}><Typography.Text type="secondary">备注</Typography.Text><div>{selected.notes || '--'}</div></Col>
                  </Row>
                  <Space>
                    <Button type="primary" onClick={startEdit}>编辑</Button>
                    <Popconfirm title="确认移入回收站？" onConfirm={remove}>
                      <Button danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                  </Space>
                </Space>
              ) : (
                <Empty description="请选择左侧券商或新建" />
              )}
            </InkSection>
          </Col>
        </Row>
      </div>
    </div>
  );
}
