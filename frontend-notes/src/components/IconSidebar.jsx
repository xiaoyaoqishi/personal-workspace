import { useMemo } from 'react';
import { Dropdown } from 'antd';
import { NavLink, useLocation } from 'react-router-dom';
import {
  HomeOutlined,
  EditOutlined,
  FileTextOutlined,
  CheckSquareOutlined,
  DeleteOutlined,
  LogoutOutlined,
  MoonOutlined,
  SunOutlined,
  ThunderboltOutlined,
  FormatPainterOutlined,
  CompressOutlined,
  ExpandOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { useThemeContext } from '../App';

const NAV_GROUPS = [
  {
    key: 'main',
    label: '笔记',
    items: [
      { key: '/', icon: <HomeOutlined />, label: '首页', end: true },
      { key: '/diary', icon: <EditOutlined />, label: '日记' },
      { key: '/doc', icon: <FileTextOutlined />, label: '文档' },
    ],
  },
  {
    key: 'tools',
    label: '工具',
    items: [
      { key: '/todo', icon: <CheckSquareOutlined />, label: '待办' },
      { key: '/recycle', icon: <DeleteOutlined />, label: '回收站' },
    ],
  },
];

export default function IconSidebar() {
  const location = useLocation();
  const { theme, setTheme, compact, toggleCompact } = useThemeContext();

  const themeMetaMap = useMemo(
    () => ({
      light: { icon: <SunOutlined />, label: '浅色' },
      dark: { icon: <MoonOutlined />, label: '暗色' },
      ink: { icon: <FormatPainterOutlined />, label: '水墨山水' },
      tech: { icon: <ThunderboltOutlined />, label: '科技' },
    }),
    [],
  );

  const currentThemeMeta = themeMetaMap[theme] ?? themeMetaMap.light;

  const themeMenuItems = useMemo(
    () => ['light', 'ink', 'tech', 'dark'].map((key) => ({
      key,
      icon: themeMetaMap[key].icon,
      label: (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>{themeMetaMap[key].label}</span>
          {theme === key ? <CheckOutlined /> : null}
        </span>
      ),
    })),
    [theme, themeMetaMap],
  );

  const activePath = useMemo(() => {
    const p = location.pathname;
    const keys = NAV_GROUPS.flatMap(g => g.items.map(i => i.key));
    if (p === '/') return '/';
    return keys.find(k => k !== '/' && (p === k || p.startsWith(k + '/'))) ?? '/';
  }, [location.pathname]);

  return (
    <aside className="nk-sidebar">
      <a href="/" className="sidebar-brand" title="返回工作台">
        <span className="sidebar-brand-icon">笔</span>
      </a>

      <nav className="sidebar-nav">
        {NAV_GROUPS.map(group => (
          <div key={group.key} className="sidebar-group">
            <span className="sidebar-group-label">{group.label}</span>
            {group.items.map(item => (
              <NavLink
                key={item.key}
                to={item.key}
                className={`icon-tab${activePath === item.key ? ' active' : ''}`}
                end={item.end}
              >
                <span className="tab-icon">{item.icon}</span>
                <span className="tab-label">{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <Dropdown
          menu={{
            items: themeMenuItems,
            selectable: true,
            selectedKeys: [theme],
            onClick: ({ key }) => setTheme(key),
          }}
          trigger={['click']}
          placement="topRight"
        >
          <button
            type="button"
            className="sidebar-theme-btn"
            title={`当前主题：${currentThemeMeta.label}`}
          >
            <span className="tab-icon">{currentThemeMeta.icon}</span>
            <span className="tab-label">{currentThemeMeta.label}</span>
          </button>
        </Dropdown>
        <button
          type="button"
          className="sidebar-compact-btn"
          onClick={toggleCompact}
          title={compact ? '切换宽松模式' : '切换紧凑模式'}
        >
          <span className="tab-icon">
            {compact ? <ExpandOutlined /> : <CompressOutlined />}
          </span>
          <span className="tab-label">{compact ? '宽松' : '紧凑'}</span>
        </button>
        <a className="sidebar-logout-btn" href="/" title="退出">
          <span className="tab-icon"><LogoutOutlined /></span>
          <span className="tab-label">退出</span>
        </a>
      </div>
    </aside>
  );
}
