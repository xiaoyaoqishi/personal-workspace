import { createContext, lazy, Suspense, useContext, useCallback, useState, useEffect } from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import IconSidebar from './components/IconSidebar';
import useTheme from './hooks/useTheme';
import { antdThemeToken, darkThemeToken, inkThemeToken, techThemeToken } from './styles/theme';
import { notebookApi, auditApi } from './api';
import './styles/tokens.css';
import './App.css';

export const ThemeContext = createContext({
  theme: 'light',
  isDark: false,
  cycleTheme: () => {},
  setTheme: () => {},
  compact: false,
  toggleCompact: () => {},
});

export function useThemeContext() {
  return useContext(ThemeContext);
}

export const NotebooksContext = createContext({ notebooks: [], reload: () => {} });

export function useNotebooks() {
  return useContext(NotebooksContext);
}

const HomePage = lazy(() => import('./components/HomePage'));
const DiaryView = lazy(() => import('./components/DiaryView'));
const DocView = lazy(() => import('./components/DocView'));
const TodoView = lazy(() => import('./components/TodoView'));
const RecycleView = lazy(() => import('./components/RecycleView'));

function LoadingBlock() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--nk-color-text-muted)' }}>
      加载中...
    </div>
  );
}

function DiaryViewWrapper() {
  const { noteId } = useParams();
  const location = useLocation();
  const { notebooks } = useNotebooks();
  const searchParams = new URLSearchParams(location.search);
  const anchor = searchParams.get('anchor') || '';
  const action = searchParams.get('action') || '';
  const template = searchParams.get('tpl') || '';
  const parsedNoteId = noteId && /^\d+$/.test(noteId) ? Number(noteId) : null;
  return (
    <DiaryView
      initialNoteId={parsedNoteId}
      initialAnchor={anchor}
      initialAction={action}
      initialTemplate={template}
      notebooks={notebooks}
    />
  );
}

function DocViewWrapper() {
  const { noteId } = useParams();
  const location = useLocation();
  const { notebooks, reload } = useNotebooks();
  const searchParams = new URLSearchParams(location.search);
  const anchor = searchParams.get('anchor') || '';
  const action = searchParams.get('action') || '';
  const parsedNoteId = noteId && /^\d+$/.test(noteId) ? Number(noteId) : null;
  const initialDocId = action === 'new' ? `new:${Date.now()}` : parsedNoteId;
  return <DocView initialNoteId={initialDocId} initialAnchor={anchor} notebooks={notebooks} onReloadNotebooks={reload} />;
}

function TodoViewWrapper() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const action = searchParams.get('action') || '';
  const initialAction = action === 'new' ? `new:${Date.now()}` : '';
  return <TodoView onNavigate={() => {}} initialAction={initialAction} />;
}

function RecycleViewWrapper() {
  return <RecycleView onNavigate={() => {}} />;
}

function AppLayout() {
  const location = useLocation();
  const [notebooks, setNotebooks] = useState([]);

  const loadNotebooks = useCallback(async () => {
    try {
      const res = await notebookApi.list();
      setNotebooks(res.data);
    } catch {}
  }, []);

  useEffect(() => { loadNotebooks(); }, [loadNotebooks]);
  useEffect(() => {
    auditApi.track({ path: '/notes/', module: 'notes', detail: `path:${location.pathname}` }).catch(() => {});
  }, [location.pathname]);

  return (
    <NotebooksContext.Provider value={{ notebooks, reload: loadNotebooks }}>
      <div className="app-layout">
        <IconSidebar />
        <div className="app-content">
          <Suspense fallback={<LoadingBlock />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/diary" element={<DiaryViewWrapper />} />
              <Route path="/diary/:noteId" element={<DiaryViewWrapper />} />
              <Route path="/doc" element={<DocViewWrapper />} />
              <Route path="/doc/:noteId" element={<DocViewWrapper />} />
              <Route path="/todo" element={<TodoViewWrapper />} />
              <Route path="/recycle" element={<RecycleViewWrapper />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </NotebooksContext.Provider>
  );
}

export default function App() {
  const { theme, isDark, cycleTheme, setTheme, compact, toggleCompact } = useTheme();

  const baseAlgorithm = (isDark || theme === 'tech') ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm;
  const algorithms = compact ? [baseAlgorithm, antdTheme.compactAlgorithm] : [baseAlgorithm];

  const themeTokenMap = {
    light: antdThemeToken,
    dark: { ...antdThemeToken, ...darkThemeToken },
    ink: inkThemeToken,
    tech: techThemeToken,
  };

  const themeConfig = {
    algorithm: algorithms,
    token: themeTokenMap[theme] ?? antdThemeToken,
  };

  return (
    <ThemeContext.Provider value={{ theme, isDark, cycleTheme, setTheme, compact, toggleCompact }}>
      <ConfigProvider theme={themeConfig}>
        <BrowserRouter basename="/notes">
          <AppLayout />
        </BrowserRouter>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}
