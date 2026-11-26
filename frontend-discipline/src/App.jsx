import { ConfigProvider, Dropdown, theme as antdTheme } from 'antd';
import { HomeOutlined, CalendarOutlined, DesktopOutlined, BulbOutlined, FormatPainterOutlined, CompressOutlined, ExpandOutlined, LogoutOutlined } from '@ant-design/icons';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import useTheme from './hooks/useTheme';
import { antdThemeToken, darkThemeToken, inkThemeToken, techThemeToken } from './styles/theme';
import './styles/tokens.css';
import './App.css';
import HomePage from './HomePage';
import DailyPlan from './DailyPlan';
import ScreenTime from './ScreenTime';


function Sidebar({ appearance }) {
  const location = useLocation();
  return <aside className="nk-sidebar">
    <a href="/" className="sidebar-brand" title="返回工作台"><span className="sidebar-brand-icon">律</span></a>
    <nav className="sidebar-nav"><div className="sidebar-group"><span className="sidebar-group-label">自律</span>
      <a href="/discipline/" className={`icon-tab${location.pathname === '/' ? ' active' : ''}`} title="自律首页"><span className="tab-icon"><HomeOutlined /></span><span className="tab-label">首页</span></a>
      <a href="/discipline/plan" className={`icon-tab${location.pathname === '/plan' ? ' active' : ''}`} title="每日计划执行"><span className="tab-icon"><CalendarOutlined /></span><span className="tab-label">每日计划</span></a>
      <a href="/discipline/screen" className={`icon-tab${location.pathname === '/screen' ? ' active' : ''}`} title="屏幕统计"><span className="tab-icon"><DesktopOutlined /></span><span className="tab-label">屏幕统计</span></a>
      <button className="icon-tab" disabled title="AI 分析与总结（尚未开放）"><span className="tab-icon"><BulbOutlined /></span><span className="tab-label">AI 总结</span></button>
    </div></nav>
    <div className="sidebar-bottom">
      <Dropdown menu={{ items: [{key:'light',label:'浅色'}, {key:'ink',label:'水墨山水'}, {key:'tech',label:'科技'}, {key:'dark',label:'暗色'}], selectable:true, selectedKeys:[appearance.theme], onClick:({key}) => appearance.setTheme(key) }} trigger={['click']} placement="topRight"><button className="sidebar-theme-btn" title="切换主题"><span className="tab-icon"><FormatPainterOutlined /></span><span>主题</span></button></Dropdown>
      <button className="sidebar-compact-btn" onClick={appearance.toggleCompact} title="切换布局密度"><span className="tab-icon">{appearance.compact ? <ExpandOutlined /> : <CompressOutlined />}</span><span>{appearance.compact ? '宽松' : '紧凑'}</span></button>
      <a className="sidebar-logout-btn" href="/" title="返回工作台"><span className="tab-icon"><LogoutOutlined /></span><span>返回</span></a>
    </div>
  </aside>;
}

export default function App() {
  const appearance = useTheme();
  const tokens = {light:antdThemeToken,dark:{...antdThemeToken,...darkThemeToken},ink:inkThemeToken,tech:techThemeToken};
  const base = appearance.isDark || appearance.theme === 'tech' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm;
  return <ConfigProvider theme={{token:tokens[appearance.theme], algorithm:appearance.compact ? [base, antdTheme.compactAlgorithm] : [base]}}><BrowserRouter basename="/discipline"><div className="app-layout"><Sidebar appearance={appearance}/><Routes><Route path="/" element={<HomePage/>}/><Route path="/plan" element={<DailyPlan/>}/><Route path="/screen" element={<ScreenTime/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></div></BrowserRouter></ConfigProvider>;
}
