import { createContext, lazy, Suspense, useContext } from 'react'
import { Alert, ConfigProvider, theme as antdTheme } from 'antd'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
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
        <BrowserRouter basename="/ledger">
          <AppLayout />
        </BrowserRouter>
      </ConfigProvider>
    </ThemeContext.Provider>
  )
}
