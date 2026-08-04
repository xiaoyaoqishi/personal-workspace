import { Component, createContext, lazy, Suspense, useContext } from 'react'
import { Alert, Button, ConfigProvider, Result, Space, theme as antdTheme } from 'antd'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import IconSidebar from './components/IconSidebar'
import LoadingBlock from './components/LoadingBlock'
import useAuthGuard from './hooks/useAuthGuard'
import useAuditPageView from './hooks/useAuditPageView'
import useTheme from './hooks/useTheme'
import { antdThemeToken, darkThemeToken, inkThemeToken, techThemeToken } from './styles/theme'
import './styles/tokens.css'
import './App.css'

export const ThemeContext = createContext({
  theme: 'light',
  isDark: false,
  cycleTheme: () => {},
  setTheme: () => {},
  compact: false,
  toggleCompact: () => {},
})

export function useThemeContext() {
  return useContext(ThemeContext)
}

const ImportBatchesPage = lazy(() => import('./pages/ImportBatchesPage'))
const ImportReviewPage = lazy(() => import('./pages/ImportReviewPage'))
const MerchantDictionaryPage = lazy(() => import('./pages/MerchantDictionaryPage'))
const RulesPage = lazy(() => import('./pages/Rules'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const AssetsPage = lazy(() => import('./pages/AssetsPage'))

class LedgerErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ledger] page render failed', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <Result
        status="error"
        title="账务页面加载失败"
        subTitle="页面资源可能刚刚更新，请重新加载后再试。"
        extra={(
          <Space>
            <Button type="primary" onClick={() => window.location.reload()}>重新加载</Button>
            <Button href="/">返回首页</Button>
          </Space>
        )}
      />
    )
  }
}

function AppLayout() {
  useAuditPageView()

  return (
    <div className="ledger-layout">
      <IconSidebar />
      <div className="ledger-content-wrap">
        <Suspense fallback={<LoadingBlock text="页面加载中..." />}>
          <Routes>
            <Route path="/" element={<Navigate to="/imports" replace />} />
            <Route path="/imports" element={<ImportBatchesPage />} />
            <Route path="/imports/:batchId/review" element={<ImportReviewPage />} />
            <Route path="/merchants" element={<MerchantDictionaryPage />} />
            <Route path="/rules" element={<RulesPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/assets" element={<AssetsPage />} />
            <Route path="*" element={<Alert type="warning" showIcon message="页面不存在" />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  )
}

export default function App() {
  const { checking, user } = useAuthGuard()
  const { theme, isDark, cycleTheme, setTheme, compact, toggleCompact } = useTheme()

  const baseAlgorithm = (isDark || theme === 'tech') ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm
  const algorithms = compact ? [baseAlgorithm, antdTheme.compactAlgorithm] : [baseAlgorithm]

  const themeTokenMap = {
    light: antdThemeToken,
    dark: { ...antdThemeToken, ...darkThemeToken },
    ink: inkThemeToken,
    tech: techThemeToken,
  }

  const themeConfig = {
    algorithm: algorithms,
    token: themeTokenMap[theme] ?? antdThemeToken,
  }

  if (checking) {
    return <LoadingBlock text="正在校验登录状态..." />
  }

  if (!user) {
    return null
  }

  return (
    <ThemeContext.Provider value={{ theme, isDark, cycleTheme, setTheme, compact, toggleCompact }}>
      <ConfigProvider theme={themeConfig}>
        <LedgerErrorBoundary>
          <BrowserRouter basename="/ledger">
            <AppLayout />
          </BrowserRouter>
        </LedgerErrorBoundary>
      </ConfigProvider>
    </ThemeContext.Provider>
  )
}
