import { createContext, lazy, Suspense, useContext } from 'react'
import { Alert, ConfigProvider, theme as antdTheme } from 'antd'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import IconSidebar from './components/IconSidebar'
import LoadingBlock from './components/LoadingBlock'
import useAuthGuard from './hooks/useAuthGuard'
import useAuditPageView from './hooks/useAuditPageView'
import useTheme from './hooks/useTheme'
import { antdThemeToken } from './styles/theme'
import './styles/tokens.css'
import './App.css'

export const ThemeContext = createContext({
  isDark: false,
  toggleTheme: () => {},
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
  const { isDark, toggleTheme, compact, toggleCompact } = useTheme()

  const algorithms = isDark
    ? compact
      ? [antdTheme.darkAlgorithm, antdTheme.compactAlgorithm]
      : [antdTheme.darkAlgorithm]
    : compact
    ? [antdTheme.compactAlgorithm]
    : [antdTheme.defaultAlgorithm]

  const darkTokenOverrides = isDark
    ? {
        colorBgContainer: '#1e293b',
        colorBgElevated: '#1e293b',
        colorBgLayout: '#0f172a',
        colorText: '#f1f5f9',
        colorTextSecondary: '#94a3b8',
        colorBorder: '#2d3f58',
        colorBorderSecondary: '#2d3f58',
      }
    : {}

  const themeConfig = {
    algorithm: algorithms,
    token: { ...antdThemeToken, ...darkTokenOverrides },
  }

  if (checking) {
    return <LoadingBlock text="正在校验登录状态..." />
  }

  if (!user) {
    return null
  }

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, compact, toggleCompact }}>
      <ConfigProvider theme={themeConfig}>
        <BrowserRouter basename="/ledger">
          <AppLayout />
        </BrowserRouter>
      </ConfigProvider>
    </ThemeContext.Provider>
  )
}
