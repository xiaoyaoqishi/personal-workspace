import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { ConfigProvider, Dropdown, theme as antdTheme } from 'antd';
import {
  CheckOutlined,
  CrownOutlined,
  DashboardOutlined,
  FormatPainterOutlined,
  OrderedListOutlined,
  FileTextOutlined,
  LogoutOutlined,
  MoonOutlined,
  BankOutlined,
  ProjectOutlined,
  SunOutlined,
  ThunderboltOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import Dashboard from './pages/Dashboard';
import TradeList from './pages/TradeList';
import TradeForm from './pages/TradeForm';
import ReviewList from './pages/ReviewList';
import InfoMaintain from './pages/BrokerManage';
import TradePlanList from './pages/TradePlanList';
import TradingRecycleBin from './pages/TradingRecycleBin';
import api from './api';
import useTheme from './hooks/useTheme';
import './styles/tokens.css';

const tabs = [
  { key: '/trades', icon: <OrderedListOutlined />, label: '记录' },
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/maintain', icon: <BankOutlined />, label: '信息维护' },
  { key: '/reviews', icon: <FileTextOutlined />, label: '复盘会话' },
  { key: '/plans', icon: <ProjectOutlined />, label: '计划' },
  { key: '/recycle', icon: <DeleteOutlined />, label: '回收站' },
];

const themeMetaMap = {
  classic: { icon: <CrownOutlined />, label: '经典' },
  ink: { icon: <FormatPainterOutlined />, label: '水墨山水' },
  light: { icon: <SunOutlined />, label: '浅色' },
  tech: { icon: <ThunderboltOutlined />, label: '科技' },
  dark: { icon: <MoonOutlined />, label: '暗色' },
};

function IconSidebar({ theme, setTheme }) {
  const location = useLocation();
  const current = location.pathname;
  const currentMeta = themeMetaMap[theme] || themeMetaMap.classic;
  const themeMenuItems = ['classic', 'ink', 'light', 'tech', 'dark'].map((key) => ({
    key,
    icon: themeMetaMap[key].icon,
    label: (
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span>{themeMetaMap[key].label}</span>
        {theme === key ? <CheckOutlined /> : null}
      </span>
    ),
  }));

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (_) {
      // Ignore logout failures and continue redirecting to login.
    } finally {
      window.location.href = '/login';
    }
  };

  return (
    <div className="icon-sidebar">
      <a className="icon-sidebar-back" href="/" title="返回系统首页">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 8l-4 4 4 4M8 12h8"/>
        </svg>
      </a>
      <div className="icon-sidebar-tabs">
        {tabs.map((t) => (
          <Link key={t.key} to={t.key} className={`icon-tab ${current === t.key ? 'active' : ''}`}>
            <span className="icon-tab-icon">{t.icon}</span>
            <span className="icon-tab-label">{t.label}</span>
          </Link>
        ))}
      </div>
      <div className="icon-sidebar-bottom">
        <Dropdown
          menu={{ items: themeMenuItems, selectedKeys: [theme], onClick: ({ key }) => setTheme(key) }}
          trigger={['click']}
          placement="topRight"
        >
          <button type="button" className="icon-tab icon-tab-button" title={`主题：${currentMeta.label}`}>
            <span className="icon-tab-icon">{currentMeta.icon}</span>
            <span className="icon-tab-label">{currentMeta.label}</span>
          </button>
        </Dropdown>
        <button type="button" className="icon-tab icon-tab-button" onClick={handleLogout} title="退出登录">
          <span className="icon-tab-icon"><LogoutOutlined /></span>
        </button>
      </div>
    </div>
  );
}

function AppLayout({ theme, setTheme }) {
  const location = useLocation();
  useEffect(() => {
    api.post('/audit/track', {
      path: `/trading${location.pathname || '/'}`,
      module: 'trading',
      detail: 'page view',
    }).catch(() => {});
  }, [location.pathname]);
  return (
    <div className="app-layout">
      <IconSidebar theme={theme} setTheme={setTheme} />
      <div className="app-content">
        <Routes>
          <Route path="/" element={<Navigate to="/trades" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/trades" element={<TradeList />} />
          <Route path="/trades/new" element={<TradeForm />} />
          <Route path="/trades/:id/edit" element={<TradeForm />} />
          <Route path="/maintain" element={<InfoMaintain />} />
          <Route path="/reviews" element={<ReviewList />} />
          <Route path="/plans" element={<TradePlanList />} />
          <Route path="/recycle" element={<TradingRecycleBin />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  const { theme, setTheme } = useTheme();
  const algorithm = theme === 'dark' || theme === 'tech'
    ? antdTheme.darkAlgorithm
    : antdTheme.defaultAlgorithm;

  return (
    <ConfigProvider theme={{ algorithm: [algorithm] }}>
      <BrowserRouter basename="/trading">
        <AppLayout theme={theme} setTheme={setTheme} />
      </BrowserRouter>
    </ConfigProvider>
  );
}
