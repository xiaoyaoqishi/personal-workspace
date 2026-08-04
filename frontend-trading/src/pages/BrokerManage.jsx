import { useEffect, useMemo, useState } from 'react';
import { Button, Col, Empty, Form, Input, Popconfirm, Row, Select, Space, Table, Tabs, Tag, Typography, message } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import InkSection from '../components/InkSection';
import { brokerApi, instrumentApi } from '../api';
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

function BrokerManage() {
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
      <div className="module-action-bar module-action-bar--end">
        <div className="module-action-bar__actions">
          <Button type="primary" icon={<PlusOutlined />} onClick={startCreate}>新建券商</Button>
        </div>
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

const instrumentTypes = ['期货', '加密货币', '股票', '外汇'].map((value) => ({ label: value, value }));
const instrumentCategories = ['黑色', '能化', '有色', '农产品', '股指', '国债', '加密货币', '外汇', '其他']
  .map((value) => ({ label: value, value }));

function normalizeInstrumentPayload(values) {
  return {
    code: values.code?.trim().toUpperCase() || '',
    name: values.name?.trim() || '',
    instrument_type: values.instrument_type?.trim() || '',
    category: values.category?.trim() || null,
  };
}

function InstrumentManage() {
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
    return rows.filter((row) => [row.name, row.code, row.instrument_type, row.category]
      .some((value) => String(value || '').toLowerCase().includes(keyword)));
  }, [query, rows]);

  const loadRows = async (preferredId = selectedId) => {
    setLoading(true);
    try {
      const res = await instrumentApi.list();
      const nextRows = Array.isArray(res.data) ? res.data : [];
      setRows(nextRows);
      setSelectedId(nextRows.some((row) => row.id === preferredId) ? preferredId : (nextRows[0]?.id || null));
    } catch {
      message.error('品种列表加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRows(null); }, []);

  useEffect(() => {
    if (!editing) return;
    form.setFieldsValue({
      code: selected?.code || '',
      name: selected?.name || '',
      instrument_type: selected?.instrument_type || '期货',
      category: selected?.category || undefined,
    });
  }, [editing, selected, form]);

  const startCreate = () => {
    setSelectedId(null);
    form.resetFields();
    form.setFieldValue('instrument_type', '期货');
    setEditing(true);
  };

  const save = async () => {
    try {
      const payload = normalizeInstrumentPayload(await form.validateFields());
      setSaving(true);
      const res = selectedId
        ? await instrumentApi.update(selectedId, payload)
        : await instrumentApi.create(payload);
      message.success(selectedId ? '品种已更新，相关记录已同步' : '品种已创建');
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
      await instrumentApi.delete(selectedId);
      message.success('品种已删除，既有交易记录不受影响');
      setEditing(false);
      await loadRows(null);
    } catch (error) {
      message.error(error.response?.data?.detail || '删除失败');
    }
  };

  const columns = [
    { title: '品种', dataIndex: 'name', key: 'name' },
    { title: '代码', dataIndex: 'code', key: 'code', width: 92 },
    { title: '类型', dataIndex: 'instrument_type', key: 'instrument_type', width: 100 },
  ];

  return (
    <div className="maintain-workspace">
      <div className="module-action-bar module-action-bar--end">
        <div className="module-action-bar__actions">
          <Button type="primary" icon={<PlusOutlined />} onClick={startCreate}>新增品种</Button>
        </div>
      </div>
      <div className="maintain-module-body">
        <Row gutter={16}>
          <Col xs={24} lg={10}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Search allowClear value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索品种名称/代码/类型/分类" />
              <InkSection title={`品种目录 · ${filteredRows.length}`} className="maintain-list-card" loading={loading}>
                <Table
                  rowKey="id"
                  size="small"
                  columns={columns}
                  dataSource={filteredRows}
                  pagination={{ pageSize: 12, size: 'small', hideOnSinglePage: true }}
                  locale={{ emptyText: <Empty description="暂无品种" /> }}
                  rowClassName={(row) => row.id === selectedId ? 'ant-table-row-selected' : ''}
                  onRow={(row) => ({ onClick: () => { setSelectedId(row.id); setEditing(false); } })}
                />
              </InkSection>
            </Space>
          </Col>
          <Col xs={24} lg={14}>
            <InkSection title={selectedId ? `${selected?.name || '品种'} · ${selected?.code || ''}` : '新增品种'}>
              {editing ? (
                <Form form={form} layout="vertical">
                  <Row gutter={12}>
                    <Col span={12}><Form.Item name="name" label="品种名称" rules={[{ required: true, message: '请输入品种名称' }]}><Input placeholder="例如：焦煤" /></Form.Item></Col>
                    <Col span={12}><Form.Item name="code" label="品种代码" rules={[{ required: true, message: '请输入品种代码' }]}><Input placeholder="例如：JM" /></Form.Item></Col>
                    <Col span={12}><Form.Item name="instrument_type" label="交易类型" rules={[{ required: true, message: '请选择交易类型' }]}><Select options={instrumentTypes} /></Form.Item></Col>
                    <Col span={12}><Form.Item name="category" label="品种分类"><Select allowClear showSearch options={instrumentCategories} /></Form.Item></Col>
                  </Row>
                  <Space>
                    <Button type="primary" loading={saving} onClick={save}>保存</Button>
                    <Button onClick={() => setEditing(false)}>取消</Button>
                  </Space>
                </Form>
              ) : selected ? (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Row gutter={[12, 12]}>
                    <Col span={12}><Typography.Text type="secondary">品种名称</Typography.Text><div>{selected.name}</div></Col>
                    <Col span={12}><Typography.Text type="secondary">品种代码</Typography.Text><div><Tag>{selected.code}</Tag></div></Col>
                    <Col span={12}><Typography.Text type="secondary">交易类型</Typography.Text><div>{selected.instrument_type}</div></Col>
                    <Col span={12}><Typography.Text type="secondary">品种分类</Typography.Text><div>{selected.category || '--'}</div></Col>
                  </Row>
                  <Space>
                    <Button type="primary" onClick={() => setEditing(true)}>编辑</Button>
                    <Popconfirm title="确认删除该品种？" description="既有交易保留，但新建交易将不能再选择它。" onConfirm={remove}>
                      <Button danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                  </Space>
                </Space>
              ) : <Empty description="请选择左侧品种或新增" />}
            </InkSection>
          </Col>
        </Row>
      </div>
    </div>
  );
}

export default function InfoMaintain() {
  return (
    <Tabs
      defaultActiveKey="instruments"
      items={[
        { key: 'instruments', label: '品种维护', children: <InstrumentManage /> },
        { key: 'brokers', label: '券商维护', children: <BrokerManage /> },
      ]}
    />
  );
}
