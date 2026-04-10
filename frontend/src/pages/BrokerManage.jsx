import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  Input,
  List,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { DeleteOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { brokerApi, knowledgeApi } from '../api';
import {
  KNOWLEDGE_CATEGORY_ZH,
  KNOWLEDGE_PRIORITY_ZH,
  KNOWLEDGE_STATUS_ZH,
  dictToOptions,
  mapLabel,
} from '../features/trading/localization';
import './BrokerManage.css';

const { TextArea, Search } = Input;

const KNOWLEDGE_STATUS_OPTIONS = dictToOptions(KNOWLEDGE_STATUS_ZH);
const KNOWLEDGE_PRIORITY_OPTIONS = dictToOptions(KNOWLEDGE_PRIORITY_ZH);

function normalizeKnowledgePayload(values) {
  return {
    ...values,
    category: values.category || 'pattern_dictionary',
    title: values.title?.trim() || '',
    summary: values.summary?.trim() || null,
    content: values.content?.trim() || null,
    tags: values.tags?.trim() || null,
    related_symbol: values.related_symbol?.trim() || null,
    related_pattern: values.related_pattern?.trim() || null,
    related_regime: values.related_regime?.trim() || null,
    status: values.status || 'active',
    priority: values.priority || 'medium',
    next_action: values.next_action?.trim() || null,
    source_ref: values.source_ref?.trim() || null,
    due_date: values.due_date ? values.due_date.format('YYYY-MM-DD') : null,
  };
}

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
  const [moduleKey, setModuleKey] = useState('knowledge');

  const [knowledgeRows, setKnowledgeRows] = useState([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeSaving, setKnowledgeSaving] = useState(false);
  const [selectedKnowledgeId, setSelectedKnowledgeId] = useState(null);
  const [knowledgeFilters, setKnowledgeFilters] = useState({ category: undefined, status: 'active', q: '' });
  const [knowledgeCategories, setKnowledgeCategories] = useState([]);
  const [knowledgeForm] = Form.useForm();

  const [brokerRows, setBrokerRows] = useState([]);
  const [brokerLoading, setBrokerLoading] = useState(false);
  const [brokerSaving, setBrokerSaving] = useState(false);
  const [selectedBrokerId, setSelectedBrokerId] = useState(null);
  const [brokerForm] = Form.useForm();

  const selectedKnowledge = useMemo(
    () => knowledgeRows.find((x) => x.id === selectedKnowledgeId) || null,
    [knowledgeRows, selectedKnowledgeId]
  );

  const selectedBroker = useMemo(
    () => brokerRows.find((x) => x.id === selectedBrokerId) || null,
    [brokerRows, selectedBrokerId]
  );

  const knowledgeCategoryOptions = useMemo(() => {
    const map = { ...KNOWLEDGE_CATEGORY_ZH };
    for (const item of knowledgeCategories) {
      if (item && !map[item]) map[item] = item;
    }
    return Object.entries(map).map(([value, label]) => ({ value, label }));
  }, [knowledgeCategories]);

  const loadKnowledgeCategories = async () => {
    try {
      const res = await knowledgeApi.categories();
      setKnowledgeCategories(res.data?.items || []);
    } catch {
      setKnowledgeCategories([]);
    }
  };

  const loadKnowledge = async (nextSelectedId = null) => {
    setKnowledgeLoading(true);
    try {
      const params = { size: 200 };
      if (knowledgeFilters.category) params.category = knowledgeFilters.category;
      if (knowledgeFilters.status) params.status = knowledgeFilters.status;
      if (knowledgeFilters.q?.trim()) params.q = knowledgeFilters.q.trim();
      const res = await knowledgeApi.list(params);
      const rows = res.data || [];
      setKnowledgeRows(rows);
      const target = nextSelectedId ?? selectedKnowledgeId;
      if (!rows.length) {
        setSelectedKnowledgeId(null);
        return;
      }
      if (target && rows.some((x) => x.id === target)) {
        setSelectedKnowledgeId(target);
      } else {
        setSelectedKnowledgeId(rows[0].id);
      }
    } catch {
      message.error('知识条目加载失败');
    } finally {
      setKnowledgeLoading(false);
    }
  };

  const loadBrokers = async (nextSelectedId = null) => {
    setBrokerLoading(true);
    try {
      const res = await brokerApi.list();
      const rows = res.data || [];
      setBrokerRows(rows);
      const target = nextSelectedId ?? selectedBrokerId;
      if (!rows.length) {
        setSelectedBrokerId(null);
        return;
      }
      if (target && rows.some((x) => x.id === target)) {
        setSelectedBrokerId(target);
      } else {
        setSelectedBrokerId(rows[0].id);
      }
    } catch {
      message.error('券商列表加载失败');
    } finally {
      setBrokerLoading(false);
    }
  };

  useEffect(() => {
    loadKnowledgeCategories();
    loadKnowledge();
    loadBrokers();
  }, []);

  useEffect(() => {
    loadKnowledge();
  }, [knowledgeFilters.category, knowledgeFilters.status]);

  useEffect(() => {
    if (!selectedKnowledge) {
      knowledgeForm.resetFields();
      knowledgeForm.setFieldsValue({
        category: 'pattern_dictionary',
        status: 'active',
        priority: 'medium',
      });
      return;
    }
    knowledgeForm.setFieldsValue({
      ...selectedKnowledge,
      due_date: selectedKnowledge.due_date ? dayjs(selectedKnowledge.due_date) : null,
    });
  }, [selectedKnowledge, knowledgeForm]);

  useEffect(() => {
    if (!selectedBroker) {
      brokerForm.resetFields();
      return;
    }
    brokerForm.setFieldsValue({
      name: selectedBroker.name || '',
      account: selectedBroker.account || '',
      password: selectedBroker.password || '',
      extra_info: selectedBroker.extra_info || '',
      notes: selectedBroker.notes || '',
    });
  }, [selectedBroker, brokerForm]);

  const createKnowledge = () => {
    setSelectedKnowledgeId(null);
    knowledgeForm.resetFields();
    knowledgeForm.setFieldsValue({
      category: knowledgeFilters.category || 'pattern_dictionary',
      status: 'active',
      priority: 'medium',
    });
  };

  const saveKnowledge = async () => {
    try {
      const values = await knowledgeForm.validateFields();
      const payload = normalizeKnowledgePayload(values);
      if (!payload.title) {
        message.warning('标题不能为空');
        return;
      }
      setKnowledgeSaving(true);
      let saved;
      if (selectedKnowledgeId) {
        const res = await knowledgeApi.update(selectedKnowledgeId, payload);
        saved = res.data;
      } else {
        const res = await knowledgeApi.create(payload);
        saved = res.data;
      }
      message.success(selectedKnowledgeId ? '知识条目已更新' : '知识条目已创建');
      await loadKnowledge(saved.id);
      setSelectedKnowledgeId(saved.id);
      await loadKnowledgeCategories();
    } catch (e) {
      if (!e?.errorFields) {
        message.error(e?.response?.data?.detail || '保存失败');
      }
    } finally {
      setKnowledgeSaving(false);
    }
  };

  const deleteKnowledge = async () => {
    if (!selectedKnowledgeId) return;
    try {
      await knowledgeApi.delete(selectedKnowledgeId);
      message.success('知识条目已删除');
      await loadKnowledge();
      await loadKnowledgeCategories();
    } catch {
      message.error('删除失败');
    }
  };

  const createBroker = () => {
    setSelectedBrokerId(null);
    brokerForm.resetFields();
  };

  const saveBroker = async () => {
    try {
      const values = await brokerForm.validateFields();
      const payload = normalizeBrokerPayload(values);
      if (!payload.name) {
        message.warning('名称不能为空');
        return;
      }
      setBrokerSaving(true);
      let saved;
      if (selectedBrokerId) {
        const res = await brokerApi.update(selectedBrokerId, payload);
        saved = res.data;
      } else {
        const res = await brokerApi.create(payload);
        saved = res.data;
      }
      message.success(selectedBrokerId ? '券商信息已更新' : '券商信息已创建');
      await loadBrokers(saved.id);
      setSelectedBrokerId(saved.id);
    } catch (e) {
      if (!e?.errorFields) {
        message.error(e?.response?.data?.detail || '保存失败');
      }
    } finally {
      setBrokerSaving(false);
    }
  };

  const deleteBroker = async () => {
    if (!selectedBrokerId) return;
    try {
      await brokerApi.delete(selectedBrokerId);
      message.success('券商信息已删除');
      await loadBrokers();
    } catch {
      message.error('删除失败');
    }
  };

  return (
    <div className="maintain-workspace">
      <Card className="maintain-toolbar" bodyStyle={{ padding: 12 }}>
        <div className="maintain-toolbar-inner">
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>信息维护工作台</Typography.Title>
            <Typography.Text type="secondary">把复盘结论沉淀为可复用知识，券商维护作为来源兼容能力保留。</Typography.Text>
          </div>
          <Segmented
            value={moduleKey}
            onChange={setModuleKey}
            options={[
              { label: '知识库', value: 'knowledge' },
              { label: '券商来源', value: 'broker' },
            ]}
          />
        </div>
      </Card>

      {moduleKey === 'knowledge' && (
        <>
          <Card className="maintain-filter-card" bodyStyle={{ padding: 12 }}>
            <Space wrap>
              <Select
                allowClear
                value={knowledgeFilters.category}
                options={knowledgeCategoryOptions}
                placeholder="分类"
                style={{ width: 220 }}
                onChange={(v) => setKnowledgeFilters((p) => ({ ...p, category: v }))}
              />
              <Select
                allowClear
                value={knowledgeFilters.status}
                options={KNOWLEDGE_STATUS_OPTIONS}
                placeholder="状态"
                style={{ width: 140 }}
                onChange={(v) => setKnowledgeFilters((p) => ({ ...p, status: v }))}
              />
              <Search
                allowClear
                placeholder="搜索标题/标签/内容"
                style={{ width: 280 }}
                onSearch={(v) => setKnowledgeFilters((p) => ({ ...p, q: v }))}
              />
              <Button onClick={createKnowledge} icon={<PlusOutlined />}>新建知识</Button>
              <Button type="primary" loading={knowledgeSaving} icon={<SaveOutlined />} onClick={saveKnowledge}>保存</Button>
              <Popconfirm title="确认删除当前知识条目？" onConfirm={deleteKnowledge} disabled={!selectedKnowledgeId}>
                <Button danger icon={<DeleteOutlined />} disabled={!selectedKnowledgeId}>删除</Button>
              </Popconfirm>
            </Space>
          </Card>

          <Row gutter={12}>
            <Col xs={24} xl={8}>
              <Card title="知识条目" className="maintain-list-card" loading={knowledgeLoading}>
                <List
                  dataSource={knowledgeRows}
                  locale={{ emptyText: <Empty description="暂无知识条目" /> }}
                  renderItem={(item) => (
                    <List.Item
                      className={`maintain-list-item ${item.id === selectedKnowledgeId ? 'active' : ''}`}
                      onClick={() => setSelectedKnowledgeId(item.id)}
                    >
                      <div className="maintain-list-main">
                        <div className="maintain-list-title">{item.title}</div>
                        <div className="maintain-list-meta">
                          <Tag color="blue">{mapLabel(KNOWLEDGE_CATEGORY_ZH, item.category)}</Tag>
                          <Tag>{mapLabel(KNOWLEDGE_STATUS_ZH, item.status)}</Tag>
                          <Tag color="gold">{mapLabel(KNOWLEDGE_PRIORITY_ZH, item.priority)}</Tag>
                        </div>
                        <Typography.Paragraph className="maintain-list-summary" ellipsis={{ rows: 2 }}>
                          {item.summary || item.next_action || item.tags || '无摘要'}
                        </Typography.Paragraph>
                      </div>
                    </List.Item>
                  )}
                />
              </Card>
            </Col>

            <Col xs={24} xl={16}>
              <Card title={selectedKnowledgeId ? `编辑知识 #${selectedKnowledgeId}` : '新建知识条目'} className="maintain-editor-card">
                <Form form={knowledgeForm} layout="vertical" initialValues={{ category: 'pattern_dictionary', status: 'active', priority: 'medium' }}>
                  <Row gutter={12}>
                    <Col span={10}><Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}><Input placeholder="例如：趋势启动回调判定" /></Form.Item></Col>
                    <Col span={7}><Form.Item name="category" label="分类"><Select options={knowledgeCategoryOptions} /></Form.Item></Col>
                    <Col span={7}><Form.Item name="status" label="状态"><Select options={KNOWLEDGE_STATUS_OPTIONS} /></Form.Item></Col>
                    <Col span={8}><Form.Item name="priority" label="优先级"><Select options={KNOWLEDGE_PRIORITY_OPTIONS} /></Form.Item></Col>
                    <Col span={8}><Form.Item name="related_symbol" label="关联品种"><Input placeholder="IF / AU" /></Form.Item></Col>
                    <Col span={8}><Form.Item name="related_pattern" label="关联结构"><Input placeholder="failed_breakout_reversal" /></Form.Item></Col>
                    <Col span={8}><Form.Item name="related_regime" label="关联环境"><Input placeholder="high-vol directional" /></Form.Item></Col>
                    <Col span={24}><Form.Item name="tags" label="标签"><Input placeholder="逗号分隔，例如：trend,pullback,risk" /></Form.Item></Col>
                    <Col span={24}><Form.Item name="summary" label="摘要"><TextArea rows={2} /></Form.Item></Col>
                    <Col span={24}><Form.Item name="content" label="正文"><TextArea rows={6} /></Form.Item></Col>
                    <Col span={12}><Form.Item name="next_action" label="下一步动作"><TextArea rows={2} /></Form.Item></Col>
                    <Col span={6}><Form.Item name="due_date" label="截止日期"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
                    <Col span={6}><Form.Item name="source_ref" label="来源引用"><Input placeholder="链接/来源" /></Form.Item></Col>
                  </Row>
                </Form>
              </Card>
            </Col>
          </Row>
        </>
      )}

      {moduleKey === 'broker' && (
        <Row gutter={12}>
          <Col xs={24} xl={8}>
            <Card
              title="券商来源"
              className="maintain-list-card"
              loading={brokerLoading}
              extra={<Button onClick={createBroker} icon={<PlusOutlined />}>新建</Button>}
            >
              <List
                dataSource={brokerRows}
                locale={{ emptyText: <Empty description="暂无券商" /> }}
                renderItem={(item) => (
                  <List.Item
                    className={`maintain-list-item ${item.id === selectedBrokerId ? 'active' : ''}`}
                    onClick={() => setSelectedBrokerId(item.id)}
                  >
                    <div className="maintain-list-main">
                      <div className="maintain-list-title">{item.name}</div>
                      <Typography.Text type="secondary">{item.account || '无账号信息'}</Typography.Text>
                    </div>
                  </List.Item>
                )}
              />
            </Card>
          </Col>

          <Col xs={24} xl={16}>
            <Card
              title={selectedBrokerId ? `编辑券商 #${selectedBrokerId}` : '新建券商'}
              className="maintain-editor-card"
              extra={(
                <Space>
                  <Button type="primary" icon={<SaveOutlined />} loading={brokerSaving} onClick={saveBroker}>保存</Button>
                  <Popconfirm title="确认删除当前券商？" onConfirm={deleteBroker} disabled={!selectedBrokerId}>
                    <Button danger icon={<DeleteOutlined />} disabled={!selectedBrokerId}>删除</Button>
                  </Popconfirm>
                </Space>
              )}
            >
              <Form form={brokerForm} layout="vertical">
                <Row gutter={12}>
                  <Col span={12}><Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}><Input placeholder="例如：宏源期货" /></Form.Item></Col>
                  <Col span={12}><Form.Item label="账号" name="account"><Input placeholder="账号/客户号" /></Form.Item></Col>
                  <Col span={12}><Form.Item label="密码" name="password"><Input.Password placeholder="可留空" /></Form.Item></Col>
                  <Col span={12}><Form.Item label="其他信息" name="extra_info"><TextArea rows={2} placeholder="通道/风控限制等" /></Form.Item></Col>
                  <Col span={24}><Form.Item label="备注" name="notes"><TextArea rows={3} /></Form.Item></Col>
                </Row>
              </Form>
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
}
