import React, { useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  ImportOutlined,
  BarChartOutlined,
  BookOutlined,
  ShopOutlined,
  ControlOutlined,
  LogoutOutlined,
  MoonOutlined,
  SunOutlined,
  CompressOutlined,
  ExpandOutlined,
} from '@ant-design/icons';
import { logout } from '../api/auth';
import { useThemeContext } from '../App';

/* ── Nav group definitions ───────────────────────────── */
const NAV_GROUPS = [
  {
    key: 'workflow',
    label: '工作流',
    items: [
      { key: '/imports',   icon: <ImportOutlined />,  label: '导入中心' },
    ],
  },
  {
    key: 'insight',
    label: '洞察',
    items: [
      { key: '/analytics', icon: <BarChartOutlined />, label: '基础分析' },
      { key: '/assets',    icon: <BookOutlined />,     label: '资产库' },
    ],
  },
  {
    key: 'config',
    label: '配置',
    items: [
      { key: '/merchants', icon: <ShopOutlined />,     label: '商户词典' },
      { key: '/rules',     icon: <ControlOutlined />,  label: '规则管理' },
    ],
  },
];

export default function IconSidebar() {
  const location = useLocation();
  const { isDark, toggleTheme, compact, toggleCompact } = useThemeContext();

  const activePath = useMemo(() => {
    const p = location.pathname;
    const keys = NAV_GROUPS.flatMap(g => g.items.map(i => i.key));
    return keys.find(k => p === k || p.startsWith(k + '/')) ?? '';
  }, [location.pathname]);

  const handleLogout = async () => {
    try { await logout(); } catch (_) { /* ignore */ }
    window.location.href = '/login';
  };

  return (
    <aside className="ledger-sidebar">
      {/* Brand */}
      <a href="/" className="sidebar-brand" title="返回工作台">
        <span className="sidebar-brand-icon">账</span>
      </a>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {NAV_GROUPS.map(group => (
          <div key={group.key} className="sidebar-group">
            <span className="sidebar-group-label">{group.label}</span>
            {group.items.map(item => (
              <NavLink
                key={item.key}
                to={item.key}
                className={`icon-tab${activePath === item.key ? ' active' : ''}`}
                end
              >
                <span className="tab-icon">{item.icon}</span>
                <span className="tab-label">{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Bottom: theme, compact, logout */}
      <div className="sidebar-bottom">
        <button
          className="sidebar-theme-btn"
          onClick={toggleTheme}
          title={isDark ? '切换浅色模式' : '切换暗色模式'}
        >
          <span className="tab-icon">
            {isDark ? <SunOutlined /> : <MoonOutlined />}
          </span>
          <span>{isDark ? '浅色' : '暗色'}</span>
        </button>
        <button
          className="sidebar-compact-btn"
          onClick={toggleCompact}
          title={compact ? '切换宽松模式' : '切换紧凑模式'}
        >
          <span className="tab-icon">
            {compact ? <ExpandOutlined /> : <CompressOutlined />}
          </span>
          <span>{compact ? '宽松' : '紧凑'}</span>
        </button>
        <button className="sidebar-logout-btn" onClick={handleLogout} title="退出登录">
          <span className="tab-icon"><LogoutOutlined /></span>
          <span>退出</span>
        </button>
      </div>
    </aside>
  );
}
