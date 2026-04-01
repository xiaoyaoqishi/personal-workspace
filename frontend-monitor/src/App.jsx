import { useState, useEffect, useRef } from 'react';
import { Card, Progress, Table, Tag, Tooltip } from 'antd';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { fetchRealtime, fetchHistory } from './api';

const POLL_MS = 3000;

function formatUptime(s) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}天`);
  if (h) parts.push(`${h}时`);
  parts.push(`${m}分`);
  return parts.join(' ');
}

function GaugeCard({ title, percent, sub, color }) {
  return (
    <Card className="gauge-card" size="small">
      <div className="gauge-title">{title}</div>
      <Progress
        type="dashboard"
        percent={percent}
        strokeColor={percent > 90 ? '#ff4d4f' : percent > 70 ? '#faad14' : (color || '#1890ff')}
        format={(p) => <span className="gauge-value">{p}%</span>}
        size={120}
      />
      {sub && <div className="gauge-sub">{sub}</div>}
    </Card>
  );
}

function ServiceDot({ name, running }) {
  return (
    <div className="svc-item">
      <span className={`svc-dot ${running ? 'on' : 'off'}`} />
      <span className="svc-name">{name}</span>
      <Tag color={running ? 'green' : 'red'}>{running ? '运行中' : '未运行'}</Tag>
    </div>
  );
}

const procColumns = [
  { title: 'PID', dataIndex: 'pid', key: 'pid', width: 80 },
  { title: '进程名', dataIndex: 'name', key: 'name', ellipsis: true },
  { title: '用户', dataIndex: 'user', key: 'user', width: 100, ellipsis: true },
  {
    title: 'CPU%', dataIndex: 'cpu', key: 'cpu', width: 80, sorter: (a, b) => a.cpu - b.cpu,
    render: v => <span style={{ color: v > 50 ? '#ff4d4f' : v > 20 ? '#faad14' : '#52c41a' }}>{v}</span>,
  },
  {
    title: '内存%', dataIndex: 'mem', key: 'mem', width: 80, sorter: (a, b) => a.mem - b.mem,
    render: v => <span style={{ color: v > 50 ? '#ff4d4f' : v > 20 ? '#faad14' : '#52c41a' }}>{v}</span>,
  },
];

export default function App() {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const timerRef = useRef(null);

  useEffect(() => {
    fetchHistory().then(r => setHistory(r.data)).catch(() => {});
    const poll = () => {
      fetchRealtime().then(r => {
        setData(r.data);
        setHistory(prev => {
          const next = [...prev, {
            ts: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            cpu: r.data.cpu.percent,
            mem: r.data.memory.percent,
            net_down: r.data.network.speed_down,
            net_up: r.data.network.speed_up,
          }];
          return next.length > 720 ? next.slice(-720) : next;
        });
      }).catch(() => {});
    };
    poll();
    timerRef.current = setInterval(poll, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, []);

  if (!data) {
    return <div className="loading">正在连接服务器...</div>;
  }

  const { system, cpu, memory, disk, network, processes, services } = data;

  return (
    <div className="monitor-app">
      <header className="monitor-header">
        <div className="header-left">
          <a href="/" className="back-link">← 返回工作台</a>
          <h1>服务器监控</h1>
        </div>
        <div className="header-right">
          <span className="live-dot" />
          <span>实时监控中</span>
        </div>
      </header>

      <section className="sys-info-bar">
        <div className="sys-tag">🖥 {system.hostname}</div>
        <div className="sys-tag">📦 {system.os}</div>
        <div className="sys-tag">🧬 {system.kernel}</div>
        <div className="sys-tag">⏱ 运行 {formatUptime(system.uptime_seconds)}</div>
        <div className="sys-tag">🕐 {system.time}</div>
      </section>

      <section className="gauge-row">
        <GaugeCard
          title="CPU 使用率"
          percent={cpu.percent}
          sub={`${cpu.cores_physical}核${cpu.cores_logical}线程 · 负载 ${cpu.load_1}/${cpu.load_5}/${cpu.load_15}`}
        />
        <GaugeCard
          title="内存使用率"
          percent={memory.percent}
          color="#722ed1"
          sub={`${memory.used_fmt} / ${memory.total_fmt}`}
        />
        <Card className="gauge-card" size="small">
          <div className="gauge-title">磁盘</div>
          <div className="disk-list">
            {disk.partitions.map(p => (
              <div key={p.mountpoint} className="disk-item">
                <div className="disk-label">
                  <span>{p.mountpoint}</span>
                  <span>{p.used_fmt} / {p.total_fmt}</span>
                </div>
                <Progress
                  percent={p.percent}
                  strokeColor={p.percent > 90 ? '#ff4d4f' : p.percent > 70 ? '#faad14' : '#52c41a'}
                  size="small"
                />
              </div>
            ))}
          </div>
          <div className="disk-io">IO: 读 {disk.io_read_speed} MB/s · 写 {disk.io_write_speed} MB/s</div>
        </Card>
        <Card className="gauge-card" size="small">
          <div className="gauge-title">网络</div>
          <div className="net-speeds">
            <div className="net-item">
              <span className="net-arrow up">↑</span>
              <span className="net-val">{network.speed_up_fmt}</span>
            </div>
            <div className="net-item">
              <span className="net-arrow down">↓</span>
              <span className="net-val">{network.speed_down_fmt}</span>
            </div>
          </div>
          <div className="net-total">
            累计 ↑ {network.bytes_sent_fmt} · ↓ {network.bytes_recv_fmt}
          </div>
        </Card>
      </section>

      {cpu.per_cpu && cpu.per_cpu.length > 1 && (
        <section className="per-cpu-section">
          <Card size="small" title="各核心 CPU 使用率">
            <div className="per-cpu-grid">
              {cpu.per_cpu.map((pct, i) => (
                <Tooltip key={i} title={`核心 ${i}: ${pct}%`}>
                  <div className="per-cpu-item">
                    <Progress
                      percent={pct}
                      size="small"
                      strokeColor={pct > 90 ? '#ff4d4f' : pct > 70 ? '#faad14' : '#1890ff'}
                      format={() => `C${i}`}
                    />
                  </div>
                </Tooltip>
              ))}
            </div>
          </Card>
        </section>
      )}

      <section className="chart-section">
        <Card size="small" title="CPU / 内存趋势（最近1小时）">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={history} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1890ff" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#1890ff" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#722ed1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#722ed1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="ts" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <RTooltip />
              <Legend />
              <Area type="monotone" dataKey="cpu" name="CPU%" stroke="#1890ff" fill="url(#cpuGrad)" />
              <Area type="monotone" dataKey="mem" name="内存%" stroke="#722ed1" fill="url(#memGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </section>

      <section className="chart-section">
        <Card size="small" title="网络速率趋势 (KB/s)">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={history} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="ts" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} unit=" KB/s" />
              <RTooltip />
              <Legend />
              <Area type="monotone" dataKey="net_down" name="下行" stroke="#52c41a" fill="#52c41a" fillOpacity={0.15} />
              <Area type="monotone" dataKey="net_up" name="上行" stroke="#faad14" fill="#faad14" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </section>

      <section className="bottom-row">
        <Card size="small" title="Top 10 进程" className="proc-card">
          <Table
            dataSource={processes}
            columns={procColumns}
            rowKey="pid"
            size="small"
            pagination={false}
            scroll={{ y: 320 }}
          />
        </Card>

        <Card size="small" title="服务状态" className="svc-card">
          {Object.entries(services).map(([name, running]) => (
            <ServiceDot key={name} name={name} running={running} />
          ))}
          {cpu.temps && Object.keys(cpu.temps).length > 0 && (
            <div className="temp-section">
              <div className="gauge-title" style={{ marginTop: 16 }}>温度传感器</div>
              {Object.entries(cpu.temps).map(([label, temp]) => (
                <div key={label} className="temp-item">
                  <span>{label}</span>
                  <Tag color={temp > 80 ? 'red' : temp > 60 ? 'orange' : 'green'}>{temp}°C</Tag>
                </div>
              ))}
            </div>
          )}
          {memory.swap_total > 0 && (
            <div className="swap-section">
              <div className="gauge-title" style={{ marginTop: 16 }}>Swap</div>
              <Progress
                percent={memory.swap_percent}
                size="small"
                strokeColor={memory.swap_percent > 80 ? '#ff4d4f' : '#1890ff'}
              />
              <div className="gauge-sub">{memory.swap_used_fmt} / {memory.swap_total_fmt}</div>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
