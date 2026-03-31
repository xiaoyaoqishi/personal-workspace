import { useState, useEffect, useCallback, useRef } from 'react';
import { message } from 'antd';
import NotebookSider from './components/NotebookSider';
import NoteList from './components/NoteList';
import NoteEditor from './components/NoteEditor';
import { notebookApi, noteApi } from './api';

export default function App() {
  const [notebooks, setNotebooks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [activeNotebook, setActiveNotebook] = useState(null);
  const [activeNote, setActiveNote] = useState(null);
  const [mode, setMode] = useState('diary');
  const [keyword, setKeyword] = useState('');
  const saveTimer = useRef(null);

  const loadNotebooks = useCallback(async () => {
    try {
      const res = await notebookApi.list();
      setNotebooks(res.data);
      if (!activeNotebook && res.data.length > 0) {
        setActiveNotebook(res.data[0].id);
      }
    } catch { message.error('加载笔记本失败'); }
  }, []);

  const loadNotes = useCallback(async () => {
    const params = {};
    if (mode === 'diary') {
      params.note_type = 'diary';
    } else {
      params.note_type = 'doc';
      if (activeNotebook) params.notebook_id = activeNotebook;
    }
    if (keyword) params.keyword = keyword;
    try {
      const res = await noteApi.list(params);
      setNotes(res.data);
    } catch { message.error('加载笔记失败'); }
  }, [mode, activeNotebook, keyword]);

  useEffect(() => { loadNotebooks(); }, [loadNotebooks]);
  useEffect(() => { loadNotes(); }, [loadNotes]);

  const handleCreateNote = async () => {
    const data = {
      notebook_id: activeNotebook || notebooks[0]?.id,
      title: mode === 'diary'
        ? new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' 日记'
        : '无标题文档',
      content: '',
      note_type: mode === 'diary' ? 'diary' : 'doc',
      note_date: mode === 'diary' ? new Date().toISOString().split('T')[0] : null,
    };
    if (!data.notebook_id) { message.warning('请先创建笔记本'); return; }
    try {
      const res = await noteApi.create(data);
      setActiveNote(res.data);
      loadNotes();
    } catch { message.error('创建失败'); }
  };

  const handleUpdateNote = useCallback(async (id, updates) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await noteApi.update(id, updates);
        setActiveNote(res.data);
        loadNotes();
      } catch { /* silent */ }
    }, 800);
  }, [loadNotes]);

  const handleDeleteNote = async (id) => {
    try {
      await noteApi.delete(id);
      if (activeNote?.id === id) setActiveNote(null);
      loadNotes();
      message.success('已删除');
    } catch { message.error('删除失败'); }
  };

  const handleSelectDate = async (dateStr) => {
    try {
      const res = await noteApi.list({ note_type: 'diary', note_date: dateStr });
      setNotes(res.data);
      if (res.data.length > 0) setActiveNote(res.data[0]);
    } catch { /* silent */ }
  };

  return (
    <div className="app-layout">
      <NotebookSider
        notebooks={notebooks}
        activeNotebook={activeNotebook}
        onSelect={setActiveNotebook}
        mode={mode}
        onModeChange={setMode}
        onReload={loadNotebooks}
        onSelectDate={handleSelectDate}
      />
      <NoteList
        notes={notes}
        activeNote={activeNote}
        onSelect={setActiveNote}
        onCreate={handleCreateNote}
        onDelete={handleDeleteNote}
        keyword={keyword}
        onKeywordChange={setKeyword}
        mode={mode}
      />
      {activeNote ? (
        <NoteEditor
          note={activeNote}
          onUpdate={handleUpdateNote}
        />
      ) : (
        <div className="empty-editor">选择或新建一篇笔记开始写作</div>
      )}
    </div>
  );
}
