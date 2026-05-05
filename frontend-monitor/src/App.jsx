import { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import dayjs from 'dayjs';
import { Alert, Badge, Button, Card, ConfigProvider, DatePicker, Dropdown, Empty, Form, Input, InputNumber, message, Modal, Popconfirm, Progress, Select, Space, Switch, Table, Tabs, Tag, theme as antdTheme, Tooltip as AntTooltip, Typography } from 'antd';
import {
  CheckOutlined,
  DesktopOutlined,
  FileSearchOutlined,
  FormatPainterOutlined,
  GlobalOutlined,
  LogoutOutlined,
  MoonOutlined,
  ReloadOutlined,
  SunOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { authApi, monitorApi, userAdminApi, auditApi } from './api';
import useTheme from './hooks/useTheme';
import './styles/tokens.css';

const POLL_MS = 3000;
const MODULE_OPTIONS = [
  { label: '交易模块', value: 'trading' },
  { label: '笔记模块', value: 'notes' },
  { label: '账务模块', value: 'ledger' },
];
const DEFAULT_MODULES = MODULE_OPTIONS.map((x) => x.value);
const DEFAULT_DATA_PERMISSIONS = { trading: 'read_write', notes: 'read_write', ledger: 'read_write' };
const EMPTY_FILTERS = {
  username: '',
  module: '',
  event_type: '',
  keyword: '',
  date_from: '',
  date_to: '',
};
const { Paragraph } = Typography;
const THEME_META_MAP = {
  light: { icon: <SunOutlined />, label: '浅色' },
  dark: { icon: <MoonOutlined />, label: '暗色' },
  ink: { icon: <FormatPainterOutlined />, label: '水墨' },
  tech: { icon: <ThunderboltOutlined />, label: '科技' },
};

function getUsageLevel(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '暂无数据';
  if (value < 60) return '正常';
  if (value < 80) return '偏高';
  return '危险';
}

function getUsageColor(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '#94a3b8';
  if (value < 60) return '#22c55e';
  if (value < 80) return '#f59e0b';
  return '#ef4444';
}

function formatPercent(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '暂无数据';
  return `${Math.round(value)}%`;
}

function formatTime(value) {
  if (!value) return '--';
  if (typeof value === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(value)) return value;
  const parsed = dayjs(value);
  if (!parsed.isValid()) return String(value);
  return parsed.format('YYYY-MM-DD HH:mm:ss');
}

function formatDuration(seconds) {
  if (typeof seconds !== 'number' || Number.isNaN(seconds) || seconds < 0) return '暂无数据';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}天 ${hours}小时 ${minutes}分钟`;
  if (hours > 0) return `${hours}小时 ${minutes}分钟`;
  return `${minutes}分钟`;
}

function useAdminGuard() {
  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let mounted = true;
    authApi
      .check()
      .then((res) => {
        if (!mounted) return;
        const data = res.data || {};
        if (!data.authenticated || !data.is_admin) {
          window.location.href = '/';
          return;
        }
        setOk(true);
        setReady(true);
      })
      .catch(() => {
        window.location.href = '/login';
      });
    return () => {
      mounted = false;
    };
  }, []);

  return { ready, ok };
}

function ServerPanel() {
  const mountedRef = useRef(false);
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState({ realtime: '', history: '' });
  const [lastRefreshAt, setLastRefreshAt] = useState('');
  const [online, setOnline] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [samplePage, setSamplePage] = useState(1);
  const [sampleTotal, setSampleTotal] = useState(0);
  const [sampleRows, setSampleRows] = useState([]);
  const [sampleLoading, setSampleLoading] = useState(false);
  const SAMPLE_SIZE = 50;
  const [trendRange, setTrendRange] = useState('7d');
  const [trendData2, setTrendData2] = useState([]);
  const [trendLoading, setTrendLoading] = useState(false);

  const pushHistoryRow = (next) => {
    const row = {
      ts: next?.sampled_at ? dayjs(next.sampled_at).format('HH:mm:ss') : new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      cpu: Number(next?.cpu?.percent || 0),
      mem: Number(next?.memory?.percent || 0),
    };
    setHistory((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.ts === row.ts && last.cpu === row.cpu && last.mem === row.mem) return prev;
      const out = [...prev, row];
      return out.length > 180 ? out.slice(-180) : out;
    });
  };

  const loadHistory = async () => {
    try {
      const res = await monitorApi.history();
      if (!mountedRef.current) return;
      setHistory(Array.isArray(res.data) ? res.data : []);
      setError((prev) => ({ ...prev, history: '' }));
    } catch (err) {
      if (!mountedRef.current) return;
      setError((prev) => ({ ...prev, history: '最近采样加载失败，请稍后重试。' }));
    }
  };

  const loadRealtime = async () => {
    try {
      const res = await monitorApi.realtime();
      if (!mountedRef.current) return;
      const next = res.data || {};
      setData(next);
      setOnline(true);
      setLastRefreshAt(next.sampled_at || next.system?.time || new Date().toISOString());
      setError((prev) => ({ ...prev, realtime: '' }));
      pushHistoryRow(next);
    } catch (err) {
      if (!mountedRef.current) return;
      setOnline(false);
      setError((prev) => ({ ...prev, realtime: '实时状态获取失败，正在继续自动轮询。' }));
    }
  };

  const loadAll = async ({ withSpinner = false } = {}) => {
    if (withSpinner) setRefreshing(true);
    try {
      await Promise.allSettled([loadHistory(), loadRealtime()]);
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  };

  const loadSamples = async (page = 1) => {
    setSampleLoading(true);
    try {
      const res = await monitorApi.serverSamples({ page, size: SAMPLE_SIZE });
      if (!mountedRef.current) return;
      const d = res.data || {};
      setSampleRows(Array.isArray(d.items) ? d.items : []);
      setSampleTotal(Number(d.total || 0));
      setSamplePage(Number(d.page || page));
    } finally {
      if (mountedRef.current) setSampleLoading(false);
    }
  };

  const loadTrend = async (range = trendRange) => {
    setTrendLoading(true);
    const now = dayjs();
    let date_from; let date_to; let granularity;
    date_to = now.format('YYYY-MM-DD');
    if (range === '1d') {
      date_from = now.format('YYYY-MM-DD');
      granularity = 'hour';
    } else if (range === '7d') {
      date_from = now.subtract(6, 'day').format('YYYY-MM-DD');
      granularity = 'hour';
    } else {
      date_from = now.subtract(29, 'day').format('YYYY-MM-DD');
      granularity = 'day';
    }
    try {
      const res = await monitorApi.serverTrend({ granularity, date_from, date_to });
      if (!mountedRef.current) return;
      setTrendData2(Array.isArray(res.data) ? res.data : []);
    } finally {
      if (mountedRef.current) setTrendLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    loadAll();
    loadSamples();
    loadTrend();
    const timer = setInterval(() => {
      loadRealtime();
    }, POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trendData = useMemo(
    () =>
      history.slice(-30).map((item, index) => ({
        key: `${item.ts || index}-${index}`,
        ts: formatTime(item.ts),
        cpu: Number(item.cpu || 0),
        mem: Number(item.mem || 0),
      })),
    [history]
  );

  // ---- metricItems for sp-metrics grid ----
  const cpuPercent = typeof data?.cpu?.percent === 'number' ? data.cpu.percent : null;
  const memPercent = typeof data?.memory?.percent === 'number' ? data.memory.percent : null;
  const diskPercent = typeof data?.disk_percent === 'number' ? data.disk_percent : null;
  const swapPercent = typeof data?.memory?.swap_percent === 'number' ? data.memory.swap_percent : null;
  const load1 = typeof data?.load_avg?.['1m'] === 'number'
    ? data.load_avg['1m']
    : typeof data?.cpu?.load_1 === 'number' ? data.cpu.load_1 : null;
  const load5 = typeof data?.load_avg?.['5m'] === 'number'
    ? data.load_avg['5m']
    : typeof data?.cpu?.load_5 === 'number' ? data.cpu.load_5 : null;
  const load15 = typeof data?.load_avg?.['15m'] === 'number'
    ? data.load_avg['15m']
    : typeof data?.cpu?.load_15 === 'number' ? data.cpu.load_15 : null;
  const diskRead = typeof data?.disk?.io_read_speed === 'number' ? data.disk.io_read_speed : null;   // MB/s
  const diskWrite = typeof data?.disk?.io_write_speed === 'number' ? data.disk.io_write_speed : null; // MB/s
  const netUp = typeof data?.network?.speed_up === 'number' ? data.network.speed_up : null;     // KB/s
  const netDown = typeof data?.network?.speed_down === 'number' ? data.network.speed_down : null; // KB/s

  const metricItems = [
    {
      key: 'cpu',
      title: 'CPU',
      value: cpuPercent != null ? `${Math.round(cpuPercent)}%` : '—',
      percent: cpuPercent,
      note: load1 != null ? `负载 ${load1.toFixed(2)}` : `逻辑核心 ${data?.cpu?.cores_logical || '--'}`,
    },
    {
      key: 'mem',
      title: '内存',
      value: memPercent != null ? `${Math.round(memPercent)}%` : '—',
      percent: memPercent,
      note: data?.memory?.used_fmt && data?.memory?.total_fmt
        ? `${data.memory.used_fmt} / ${data.memory.total_fmt}`
        : '—',
    },
    {
      key: 'disk',
      title: '磁盘',
      value: diskPercent != null ? `${Math.round(diskPercent)}%` : '—',
      percent: diskPercent,
      note: typeof data?.disk_used_gb === 'number' && typeof data?.disk_total_gb === 'number'
        ? `${data.disk_used_gb.toFixed(1)} / ${data.disk_total_gb.toFixed(1)} GB`
        : '—',
    },
    {
      key: 'load',
      title: '负载',
      value: load1 != null ? load1.toFixed(2) : '—',
      percent: null,
      note: load5 != null && load15 != null ? `5m ${load5.toFixed(2)} / 15m ${load15.toFixed(2)}` : '—',
    },
    {
      key: 'swap',
      title: 'Swap',
      value: swapPercent != null ? `${Math.round(swapPercent)}%` : '—',
      percent: swapPercent,
      note: data?.memory?.swap_used_fmt && data?.memory?.swap_total_fmt
        ? `${data.memory.swap_used_fmt} / ${data.memory.swap_total_fmt}`
        : '—',
    },
    {
      key: 'diskio',
      title: '磁盘 IO',
      value: diskRead != null ? `${diskRead} MB/s` : '—',
      percent: null,
      note: diskWrite != null ? `写 ${diskWrite} MB/s` : '—',
    },
    {
      key: 'netup',
      title: '网络上行',
      value: data?.network?.speed_up_fmt || (netUp != null ? `${netUp} KB/s` : '—'),
      percent: null,
      note: `累计 ${data?.network?.bytes_sent_fmt || '--'}`,
    },
    {
      key: 'netdown',
      title: '网络下行',
      value: data?.network?.speed_down_fmt || (netDown != null ? `${netDown} KB/s` : '—'),
      percent: null,
      note: `累计 ${data?.network?.bytes_recv_fmt || '--'}`,
    },
  ];

  return (
    <div className="sp-root">
      {error.realtime && <Alert type="error" showIcon message={error.realtime} style={{ marginBottom: 0 }} />}
      {error.history && <Alert type="error" showIcon message={error.history} style={{ marginBottom: 0 }} />}

      {/* 状态栏 */}
      <div className="sp-statusbar">
        <div className="sp-statusbar-host">
          <div className="sp-statusbar-hostname">{data?.system?.hostname || '—'}</div>
          <div className="sp-statusbar-os">{data?.system?.os || '—'}</div>
        </div>

        <div className="sp-statusbar-services">
          {data?.services
            ? Object.entries(data.services).map(([svc, running]) => (
                <span key={svc} className="sp-svc-item">
                  <span className={`sp-svc-dot ${running ? 'up' : 'down'}`} />
                  {svc}
                </span>
              ))
            : null}
        </div>

        <div className="sp-statusbar-right">
          <Badge
            status={online === false ? 'error' : online ? 'success' : 'processing'}
            text={<span style={{ color: '#cbd5e1', fontSize: 12 }}>{online === false ? '离线' : online ? '在线' : '连接中'}</span>}
          />
          <div className="sp-meta-item">
            <span>运行时长</span>
            <strong>{data?.system?.uptime || formatDuration(data?.uptime_seconds || data?.system?.uptime_seconds) || '—'}</strong>
          </div>
          <div className="sp-meta-item">
            <span>最近刷新</span>
            <strong>{formatTime(lastRefreshAt || data?.sampled_at || data?.system?.time)}</strong>
          </div>
          <Button
            size="small"
            ghost
            icon={<ReloadOutlined />}
            loading={refreshing}
            onClick={() => loadAll({ withSpinner: true })}
            style={{ borderColor: 'rgba(255,255,255,0.25)', color: '#e2e8f0' }}
          >
            刷新
          </Button>
        </div>
      </div>

      {/* 8 格指标 */}
      <div className="sp-metrics">
        {metricItems.map((item) => {
          const lvl = getUsageLevel(item.percent);
          const lvlKey = lvl === '危险' ? 'danger' : lvl === '偏高' ? 'high' : lvl === '正常' ? 'normal' : 'na';
          const color = getUsageColor(item.percent);
          return (
            <div key={item.key} className={`sp-metric-tile level-${lvlKey}`}>
              <div className="sp-tile-header">
                <span className="sp-tile-label">{item.title}</span>
                <span className={`sp-tile-dot ${lvlKey}`} />
              </div>
              <div className={`sp-tile-value ${lvlKey}`}>{item.value}</div>
              {typeof item.percent === 'number' && (
                <Progress
                  percent={Math.max(0, Math.min(100, Math.round(item.percent)))}
                  strokeColor={color}
                  showInfo={false}
                  size="small"
                  style={{ margin: '4px 0' }}
                />
              )}
              <div className="sp-tile-note">{item.note}</div>
            </div>
          );
        })}
      </div>

      {/* 主内容 Tabs */}
      <div className="sp-main">
        <Tabs
          size="small"
          items={[
            {
              key: 'realtime',
              label: '实时趋势',
              children: trendData.length ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trendData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="ts" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="cpu" name="CPU %" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="mem" name="内存 %" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无实时数据" style={{ marginTop: 40 }} />
              ),
            },
            {
              key: 'history',
              label: '历史趋势',
              children: (
                <div>
                  <Space style={{ marginBottom: 12 }}>
                    {[{ label: '今天', value: '1d' }, { label: '近7天', value: '7d' }, { label: '近30天', value: '30d' }].map((opt) => (
                      <Button
                        key={opt.value}
                        size="small"
                        type={trendRange === opt.value ? 'primary' : 'default'}
                        onClick={() => { setTrendRange(opt.value); loadTrend(opt.value); }}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </Space>
                  {trendLoading ? (
                    <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>加载中...</div>
                  ) : trendData2.length ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={trendData2} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="ts" tick={{ fill: '#94a3b8', fontSize: 11 }} interval="preserveStartEnd" />
                        <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line type="monotone" dataKey="avg_cpu" name="CPU 均值" stroke="#3b82f6" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="max_cpu" name="CPU 峰值" stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 2" dot={false} />
                        <Line type="monotone" dataKey="avg_mem" name="内存 均值" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="max_mem" name="内存 峰值" stroke="#8b5cf6" strokeWidth={1} strokeDasharray="4 2" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无历史数据" style={{ marginTop: 40 }} />
                  )}
                </div>
              ),
            },
            {
              key: 'process',
              label: '进程',
              children: (
                <Table
                  rowKey="pid"
                  dataSource={data?.processes || []}
                  size="small"
                  pagination={false}
                  columns={[
                    { title: 'PID', dataIndex: 'pid', key: 'pid', width: 70 },
                    { title: '进程名', dataIndex: 'name', key: 'name', ellipsis: true },
                    {
                      title: 'CPU %',
                      dataIndex: 'cpu',
                      key: 'cpu',
                      width: 90,
                      render: (v) => (
                        <span style={{ color: v > 50 ? '#ef4444' : v > 20 ? '#f59e0b' : '#22c55e', fontWeight: 600 }}>
                          {v}%
                        </span>
                      ),
                    },
                    { title: '内存 %', dataIndex: 'mem', key: 'mem', width: 90, render: (v) => `${v}%` },
                    { title: '用户', dataIndex: 'user', key: 'user', ellipsis: true, width: 110 },
                  ]}
                  locale={{ emptyText: '暂无进程数据' }}
                />
              ),
            },
            {
              key: 'host',
              label: '主机信息',
              children: (
                <div className="sp-host-grid">
                  {[
                    { label: '主机名', value: data?.system?.hostname },
                    { label: '操作系统', value: data?.system?.os },
                    { label: '平台', value: data?.platform },
                    { label: '架构', value: data?.architecture || data?.system?.arch },
                    { label: 'CPU 核心', value: data?.cpu?.cores_logical ? `${data.cpu.cores_logical} 逻辑核` : null },
                    { label: 'CPU 频率', value: data?.cpu?.freq_current ? `${data.cpu.freq_current} MHz` : null },
                    { label: '运行时长', value: data?.system?.uptime || formatDuration(data?.uptime_seconds || data?.system?.uptime_seconds) },
                    { label: '启动时间', value: data?.system?.boot_time },
                    { label: '内核版本', value: data?.system?.kernel },
                    { label: '采样时间', value: formatTime(data?.sampled_at || data?.system?.time) },
                  ]
                    .filter((row) => row.value)
                    .map((row) => (
                      <div key={row.label} className="sp-host-row">
                        <span className="sp-host-key">{row.label}</span>
                        <span className="sp-host-val" title={String(row.value)}>{row.value}</span>
                      </div>
                    ))}
                </div>
              ),
            },
            {
              key: 'samples',
              label: '采样记录',
              children: (
                <Table
                  rowKey="id"
                  loading={sampleLoading}
                  dataSource={sampleRows}
                  size="small"
                  pagination={{
                    current: samplePage,
                    pageSize: SAMPLE_SIZE,
                    total: sampleTotal,
                    showTotal: (n) => `共 ${n} 条`,
                    onChange: (p) => loadSamples(p),
                  }}
                  columns={[
                    { title: '时间', dataIndex: 'ts', key: 'ts', width: 160 },
                    { title: 'CPU %', dataIndex: 'cpu', key: 'cpu', width: 80, render: (v) => v != null ? `${v}%` : '—' },
                    { title: '内存 %', dataIndex: 'mem', key: 'mem', width: 80, render: (v) => v != null ? `${v}%` : '—' },
                    { title: '上行', dataIndex: 'net_up', key: 'net_up', width: 100, render: (v) => v != null ? `${v} KB/s` : '—' },
                    { title: '下行', dataIndex: 'net_down', key: 'net_down', width: 100, render: (v) => v != null ? `${v} KB/s` : '—' },
                  ]}
                  locale={{ emptyText: '暂无采样数据' }}
                />
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}

function SitePanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', url: '', enabled: true, interval_sec: 60, timeout_sec: 8 });
  const [modalOpen, setModalOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await monitorApi.listSites();
      setRows(Array.isArray(res.data) ? res.data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      message.warning('请填写名称和 URL');
      return;
    }
    if (editing) await monitorApi.updateSite(editing.id, form);
    else await monitorApi.createSite(form);
    setEditing(null);
    setForm({ name: '', url: '', enabled: true, interval_sec: 60, timeout_sec: 8 });
    setModalOpen(false);
    await load();
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <Card
        title="巡检目标"
        extra={
          <Button
            type="primary"
            onClick={() => {
              setEditing(null);
              setForm({ name: '', url: '', enabled: true, interval_sec: 60, timeout_sec: 8 });
              setModalOpen(true);
            }}
          >
            新增站点
          </Button>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={rows}
          size="small"
          pagination={false}
          columns={[
            { title: '名称', dataIndex: 'name', key: 'name' },
            {
              title: 'URL',
              dataIndex: 'url',
              key: 'url',
              ellipsis: { showTitle: false },
              render: (_, r) => (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={r.url}
                  style={{ maxWidth: 260, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}
                >
                  {r.url}
                </a>
              ),
            },
            {
              title: '启用',
              key: 'enabled',
              render: (_, r) => <Tag color={r.enabled ? 'green' : 'red'}>{r.enabled ? '启用' : '停用'}</Tag>,
            },
            {
              title: '巡检',
              key: 'status',
              render: (_, r) =>
                r.last_ok === false ? (
                  <AntTooltip title={r.last_error || '无错误信息'}>
                    <Tag color="red">异常</Tag>
                  </AntTooltip>
                ) : r.last_ok === true ? (
                  <Tag color="green">正常</Tag>
                ) : (
                  <Tag color="default">未检</Tag>
                ),
            },
            {
              title: '状态码',
              key: 'last_status_code',
              render: (_, r) => {
                const code = r.last_status_code;
                if (code == null) return <span style={{ color: '#bbb' }}>--</span>;
                if (code >= 500) return <Tag color="error">{code}</Tag>;
                if (code >= 400) return <Tag color="warning">{code}</Tag>;
                return <Tag color="success">{code}</Tag>;
              },
            },
            {
              title: '耗时',
              key: 'last_response_ms',
              render: (_, r) => r.last_response_ms != null ? `${r.last_response_ms} ms` : '--',
            },
            {
              title: '上次检查',
              key: 'last_checked_at',
              render: (_, r) => r.last_checked_at
                ? dayjs(r.last_checked_at).format('MM-DD HH:mm')
                : <span style={{ color: '#aaa' }}>未检查</span>,
            },
            {
              title: '间隔',
              key: 'interval_sec',
              render: (_, r) => `${r.interval_sec}s`,
            },
            {
              title: '操作',
              key: 'op',
              render: (_, r) => (
                <Space>
                  <Button
                    size="small"
                    onClick={async () => {
                      await monitorApi.updateSite(r.id, { enabled: !r.enabled });
                      message.success(r.enabled ? '已停用站点' : '已启用站点');
                      await load();
                    }}
                  >
                    {r.enabled ? '停用' : '启用'}
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setEditing(r);
                      setForm({
                        name: r.name,
                        url: r.url,
                        enabled: r.enabled,
                        interval_sec: r.interval_sec,
                        timeout_sec: r.timeout_sec,
                      });
                      setModalOpen(true);
                    }}
                  >
                    编辑
                  </Button>
                  <Popconfirm
                    title="确认删除该站点？"
                    onConfirm={async () => {
                      await monitorApi.deleteSite(r.id);
                      await load();
                    }}
                  >
                    <Button size="small" danger>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        title={editing ? `编辑站点 · ${editing.name}` : '新增站点'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditing(null);
          setForm({ name: '', url: '', enabled: true, interval_sec: 60, timeout_sec: 8 });
        }}
        onOk={submit}
        okText={editing ? '保存' : '创建'}
        cancelText="取消"
        destroyOnClose
      >
        <Form layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item label="名称" required>
            <Input
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              placeholder="站点名称"
            />
          </Form.Item>
          <Form.Item label="URL" required>
            <Input
              value={form.url}
              onChange={(e) => setForm((s) => ({ ...s, url: e.target.value }))}
              placeholder="https://example.com"
            />
          </Form.Item>
          <Form.Item label="巡检间隔">
            <InputNumber
              min={10}
              max={3600}
              value={form.interval_sec}
              onChange={(v) => setForm((s) => ({ ...s, interval_sec: v ?? 60 }))}
              addonAfter="秒"
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="超时时间">
            <InputNumber
              min={1}
              max={60}
              value={form.timeout_sec}
              onChange={(v) => setForm((s) => ({ ...s, timeout_sec: v ?? 8 }))}
              addonAfter="秒"
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="启用">
            <Switch
              checked={!!form.enabled}
              checkedChildren="启用"
              unCheckedChildren="停用"
              onChange={(checked) => setForm((s) => ({ ...s, enabled: checked }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

function UserPanel() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ username: '', password: '' });
  const [editModal, setEditModal] = useState({
    open: false,
    userId: null,
    username: '',
    role: 'user',
    password: '',
    module_permissions: [...DEFAULT_MODULES],
    data_permissions: { ...DEFAULT_DATA_PERMISSIONS },
  });

  const load = async () => {
    const res = await userAdminApi.list();
    setRows(Array.isArray(res.data) ? res.data : []);
  };
  useEffect(() => {
    load();
  }, []);

  const createUser = async () => {
    if (!form.username.trim() || !form.password.trim()) return;
    await userAdminApi.create(form);
    setForm({ username: '', password: '' });
    message.success('创建成功');
    await load();
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <Card title="新增用户">
        <Space>
          <Input
            placeholder="用户名"
            value={form.username}
            onChange={(e) => setForm((s) => ({ ...s, username: e.target.value }))}
          />
          <Input.Password
            placeholder="密码"
            value={form.password}
            onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
          />
          <Button type="primary" onClick={createUser}>
            创建
          </Button>
        </Space>
      </Card>
      <Card title="用户列表">
        <Table
          rowKey="id"
          dataSource={rows}
          size="small"
          pagination={false}
          columns={[
            { title: '用户名', dataIndex: 'username', key: 'username' },
            { title: '角色', dataIndex: 'role', key: 'role' },
            {
              title: '模块可见',
              key: 'module_permissions',
              render: (_, r) => {
                if ((r.role || 'user') === 'admin') return '全部';
                const modules = Array.isArray(r.module_permissions) ? r.module_permissions : [];
                if (!modules.length) return '-';
                return modules.map((m) => MODULE_OPTIONS.find((x) => x.value === m)?.label || m).join(' / ');
              },
            },
            {
              title: '数据权限',
              key: 'data_permissions',
              render: (_, r) => {
                if ((r.role || 'user') === 'admin') return '可读写';
                const perms = r.data_permissions || {};
                return DEFAULT_MODULES.map((m) => {
                  const mode = perms[m] || 'read_write';
                  const label = MODULE_OPTIONS.find((x) => x.value === m)?.label || m;
                  return `${label}:${mode === 'read_only' ? '只读' : '可读写'}`;
                }).join('；');
              },
            },
            {
              title: '状态',
              key: 'status',
              render: (_, r) => {
                return <Tag color={r.is_active ? 'green' : 'red'}>{r.is_active ? '启用' : '停用'}</Tag>;
              },
            },
            {
              title: '操作',
              key: 'op',
              render: (_, r) => (
                <Space>
                  <Button
                    size="small"
                    disabled={r.username === 'xiaoyao'}
                    onClick={async () => {
                      await userAdminApi.toggleActive(r.id);
                      await load();
                    }}
                  >
                    {r.is_active ? '停用' : '启用'}
                  </Button>
                  <Button
                    size="small"
                    onClick={() =>
                      setEditModal({
                        open: true,
                        userId: r.id,
                        username: r.username,
                        role: r.role || 'user',
                        password: '',
                        module_permissions: Array.isArray(r.module_permissions) && r.module_permissions.length
                          ? r.module_permissions
                          : [...DEFAULT_MODULES],
                        data_permissions: {
                          ...DEFAULT_DATA_PERMISSIONS,
                          ...(r.data_permissions || {}),
                        },
                      })
                    }
                  >
                    编辑
                  </Button>
                  <Popconfirm
                    title={`确认删除用户 ${r.username}？`}
                    disabled={r.username === 'xiaoyao'}
                    onConfirm={async () => {
                      await userAdminApi.remove(r.id);
                      message.success('删除成功');
                      await load();
                    }}
                  >
                    <Button size="small" danger disabled={r.username === 'xiaoyao'}>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        title="编辑用户"
        open={editModal.open}
        onCancel={() =>
          setEditModal({
            open: false,
            userId: null,
            username: '',
            role: 'user',
            password: '',
            module_permissions: [...DEFAULT_MODULES],
            data_permissions: { ...DEFAULT_DATA_PERMISSIONS },
          })
        }
        onOk={async () => {
          if (!editModal.userId) return;
          const payload = { role: editModal.role };
          if (editModal.password.trim()) payload.password = editModal.password.trim();
          if (editModal.role !== 'admin') {
            payload.module_permissions = editModal.module_permissions;
            payload.data_permissions = editModal.data_permissions;
          }
          await userAdminApi.update(editModal.userId, payload);
          message.success('更新成功');
          setEditModal({
            open: false,
            userId: null,
            username: '',
            role: 'user',
            password: '',
            module_permissions: [...DEFAULT_MODULES],
            data_permissions: { ...DEFAULT_DATA_PERMISSIONS },
          });
          await load();
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={10}>
          <Input value={editModal.username} disabled />
          <Select
            value={editModal.role}
            onChange={(v) => setEditModal((s) => ({ ...s, role: v }))}
            options={[
              { label: '管理员', value: 'admin' },
              { label: '普通用户', value: 'user' },
            ]}
          />
          <Input.Password
            placeholder="新密码（留空则不修改）"
            value={editModal.password}
            onChange={(e) => setEditModal((s) => ({ ...s, password: e.target.value }))}
          />
          <Select
            mode="multiple"
            value={editModal.module_permissions}
            onChange={(vals) => setEditModal((s) => ({ ...s, module_permissions: vals }))}
            options={MODULE_OPTIONS}
            disabled={editModal.role === 'admin'}
            placeholder="模块可见权限"
          />
          <Space direction="vertical" style={{ width: '100%' }} size={6}>
            <div>数据权限</div>
            {DEFAULT_MODULES.map((moduleKey) => (
              <Space key={moduleKey} style={{ width: '100%', justifyContent: 'space-between' }}>
                <span>{MODULE_OPTIONS.find((x) => x.value === moduleKey)?.label || moduleKey}</span>
                <Select
                  value={editModal.data_permissions?.[moduleKey] || 'read_write'}
                  onChange={(v) =>
                    setEditModal((s) => ({
                      ...s,
                      data_permissions: { ...s.data_permissions, [moduleKey]: v },
                    }))
                  }
                  options={[
                    { label: '可读写', value: 'read_write' },
                    { label: '只读', value: 'read_only' },
                  ]}
                  disabled={editModal.role === 'admin'}
                  style={{ width: 160 }}
                />
              </Space>
            ))}
          </Space>
        </Space>
      </Modal>
    </Space>
  );
}

function AuditPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });

  const load = async (next = {}) => {
    const nextPage = next.page ?? page;
    const nextSize = next.size ?? size;
    const nextFilters = next.filters ?? filters;
    setLoading(true);
    try {
      const params = { page: nextPage, size: nextSize };
      if (nextFilters.username.trim()) params.username = nextFilters.username.trim();
      if (nextFilters.module.trim()) params.module = nextFilters.module.trim();
      if (nextFilters.event_type) params.event_type = nextFilters.event_type;
      if (nextFilters.keyword.trim()) params.keyword = nextFilters.keyword.trim();
      if (nextFilters.date_from) params.date_from = nextFilters.date_from;
      if (nextFilters.date_to) params.date_to = nextFilters.date_to;

      const res = await auditApi.list(params);
      const data = res?.data || {};
      setRows(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total || 0));
      setPage(Number(data.page || nextPage));
      setSize(Number(data.size || nextSize));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeOne = async (id) => {
    await auditApi.remove(id);
    message.success('删除成功');
    setSelectedRowKeys((prev) => prev.filter((x) => x !== id));
    await load();
  };

  const removeBatch = async () => {
    if (!selectedRowKeys.length) return;
    await Promise.all(selectedRowKeys.map((id) => auditApi.remove(id)));
    message.success(`已删除 ${selectedRowKeys.length} 条记录`);
    setSelectedRowKeys([]);
    await load();
  };

  return (
    <Card title="浏览与操作记录">
      <Space wrap style={{ marginBottom: 12 }}>
        <Input
          placeholder="按用户筛选"
          value={filters.username}
          onChange={(e) => setFilters((s) => ({ ...s, username: e.target.value }))}
          style={{ width: 140 }}
        />
        <Select
          placeholder="类型"
          value={filters.event_type || undefined}
          onChange={(v) => setFilters((s) => ({ ...s, event_type: v || '' }))}
          allowClear
          style={{ width: 120 }}
          options={[
            { label: '浏览', value: 'page_view' },
            { label: '操作', value: 'action' },
          ]}
        />
        <Select
          placeholder="模块"
          value={filters.module || undefined}
          onChange={(v) => setFilters((s) => ({ ...s, module: v || '' }))}
          allowClear
          style={{ width: 150 }}
          options={[
            { label: '登录认证', value: 'auth' },
            { label: '审计日志', value: 'audit' },
            { label: '网站监控首页', value: 'monitor_home' },
            { label: '站点巡检', value: 'monitor_site' },
            { label: '用户管理', value: 'user_admin' },
            { label: '笔记应用', value: 'notes' },
            { label: '交易记录', value: 'trading' },
          ]}
        />
        <Input
          placeholder="关键词（路径/详情）"
          value={filters.keyword}
          onChange={(e) => setFilters((s) => ({ ...s, keyword: e.target.value }))}
          style={{ width: 180 }}
        />
        <DatePicker
          placeholder="开始日期"
          value={filters.date_from ? dayjs(filters.date_from) : null}
          onChange={(_, text) => setFilters((s) => ({ ...s, date_from: text || '' }))}
        />
        <DatePicker
          placeholder="结束日期"
          value={filters.date_to ? dayjs(filters.date_to) : null}
          onChange={(_, text) => setFilters((s) => ({ ...s, date_to: text || '' }))}
        />
        <Button
          type="primary"
          onClick={async () => {
            setPage(1);
            await load({ page: 1 });
          }}
        >
          筛选
        </Button>
        <Button
          onClick={async () => {
            setFilters({ ...EMPTY_FILTERS });
            setPage(1);
            await load({ page: 1, filters: EMPTY_FILTERS });
          }}
        >
          重置
        </Button>
        <Popconfirm title={`确认删除选中的 ${selectedRowKeys.length} 条记录？`} onConfirm={removeBatch} disabled={!selectedRowKeys.length}>
          <Button danger disabled={!selectedRowKeys.length}>
            批量删除
          </Button>
        </Popconfirm>
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        size="small"
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys),
        }}
        pagination={{
          current: page,
          pageSize: size,
          total,
          showSizeChanger: true,
          showTotal: (n) => `共 ${n} 条`,
        }}
        onChange={(p) => {
          load({ page: p.current || 1, size: p.pageSize || 20 });
        }}
        columns={[
          {
            title: '时间',
            dataIndex: 'created_at',
            key: 'created_at',
            render: (_, r) => r.created_at_zh || '-',
          },
          { title: '用户', dataIndex: 'username', key: 'username' },
          { title: '角色', dataIndex: 'role', key: 'role' },
          { title: '类型', dataIndex: 'event_type_zh', key: 'event_type_zh' },
          { title: '路径', dataIndex: 'path', key: 'path', ellipsis: true },
          { title: '模块', dataIndex: 'module_zh', key: 'module_zh' },
          { title: '详情', dataIndex: 'detail_zh', key: 'detail_zh', ellipsis: true },
          {
            title: '操作',
            key: 'op',
            width: 88,
            render: (_, r) => (
              <Popconfirm title="确认删除该记录？" onConfirm={() => removeOne(r.id)}>
                <Button danger size="small">
                  删除
                </Button>
              </Popconfirm>
            ),
          },
        ]}
      />
    </Card>
  );
}

function AppLayout({ theme, setTheme }) {
  const { ready, ok } = useAdminGuard();
  const moduleItems = useMemo(
    () => [
      { key: 'server', label: '服务器监控', icon: <DesktopOutlined />, desc: '查看主机实时状态与采样', content: <ServerPanel /> },
      { key: 'site', label: '站点可用性巡检', icon: <GlobalOutlined />, desc: '管理巡检目标与健康状态', content: <SitePanel /> },
      { key: 'users', label: '用户管理', icon: <TeamOutlined />, desc: '创建账户、启停用与重置密码', content: <UserPanel /> },
      { key: 'audit', label: '浏览记录', icon: <FileSearchOutlined />, desc: '查看页面访问与关键操作审计', content: <AuditPanel /> },
    ],
    [],
  );
  const [activeKey, setActiveKey] = useState('server');

  useEffect(() => {
    if (!ok) return;
    auditApi.track({ path: '/monitor/', module: 'monitor_home', detail: 'open monitor app' }).catch(() => {});
  }, [ok]);

  if (!ready) return <div className="loading">正在验证管理员权限...</div>;

  const activeModule = moduleItems.find((m) => m.key === activeKey) || moduleItems[0];
  const currentThemeMeta = THEME_META_MAP[theme] || THEME_META_MAP.light;
  const themeMenuItems = ['light', 'ink', 'tech', 'dark'].map((key) => ({
    key,
    icon: THEME_META_MAP[key].icon,
    label: (
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span>{THEME_META_MAP[key].label}</span>
        {theme === key ? <CheckOutlined /> : null}
      </span>
    ),
  }));

  return (
    <div className="monitor-layout">
      <aside className="icon-sidebar monitor-icon-sidebar">
        <a href="/" className="icon-sidebar-back" title="返回首页">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8l-4 4 4 4M8 12h8" />
          </svg>
        </a>
        <div className="icon-sidebar-tabs">
          {moduleItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`icon-tab ${activeKey === item.key ? 'active' : ''}`}
              onClick={() => setActiveKey(item.key)}
              title={item.label}
            >
              <span className="icon-tab-icon">{item.icon}</span>
              <span className="icon-tab-label">{item.label.replace('监控', '')}</span>
            </button>
          ))}
        </div>
        <div className="icon-sidebar-bottom">
          <Dropdown
            menu={{ items: themeMenuItems, selectedKeys: [theme], onClick: ({ key }) => setTheme(key) }}
            trigger={['click']}
            placement="topRight"
          >
            <button type="button" className="icon-tab" title={`主题：${currentThemeMeta.label}`}>
              <span className="icon-tab-icon">{currentThemeMeta.icon}</span>
              <span className="icon-tab-label">{currentThemeMeta.label}</span>
            </button>
          </Dropdown>
          <button
            type="button"
            className="icon-tab"
            onClick={async () => {
              await authApi.logout();
              window.location.href = '/login';
            }}
            title="退出登录"
          >
            <span className="icon-tab-icon">
              <LogoutOutlined />
            </span>
            <span className="icon-tab-label">退出</span>
          </button>
        </div>
      </aside>

      <div className="view-container monitor-view-container">
        <main className="main-content">
          <div className="monitor-main-panel">
            <header className="monitor-main-header">
              <div>
                <h1>{activeModule.label}</h1>
                <p>{activeModule.desc}</p>
              </div>
            </header>
            <div className="monitor-main-body">{activeModule.content}</div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const { theme, setTheme } = useTheme();
  const algorithm = theme === 'dark' || theme === 'tech' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm;

  return (
    <ConfigProvider theme={{ algorithm: [algorithm] }}>
      <BrowserRouter basename="/monitor">
        <AppLayout theme={theme} setTheme={setTheme} />
      </BrowserRouter>
    </ConfigProvider>
  );
}
