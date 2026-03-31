import { Input, Button, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, PushpinOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

export default function NoteList({
  notes, activeNote, onSelect, onCreate, onDelete, keyword, onKeywordChange, mode,
}) {
  return (
    <div className="middle-panel">
      <div className="middle-header">
        <div className="middle-header-row">
          <span style={{ fontWeight: 500 }}>
            {mode === 'diary' ? '日记' : '文档'} ({notes.length})
          </span>
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={onCreate}>
            {mode === 'diary' ? '写日记' : '新文档'}
          </Button>
        </div>
        <Input.Search
          placeholder="搜索笔记..."
          size="small"
          value={keyword}
          onChange={e => onKeywordChange(e.target.value)}
          allowClear
        />
      </div>
      <div className="note-list">
        {notes.map(note => (
          <div
            key={note.id}
            className={`note-item ${activeNote?.id === note.id ? 'active' : ''}`}
            onClick={() => onSelect(note)}
          >
            <div className="note-title">
              {note.is_pinned && <PushpinOutlined className="pin-icon" />}{' '}
              {note.title || '无标题'}
            </div>
            <div className="note-meta">
              <span>{dayjs(note.updated_at).format('YYYY-MM-DD HH:mm')}</span>
              {note.word_count > 0 && <span>{note.word_count} 字</span>}
              <Popconfirm title="确定删除？" onConfirm={(e) => { e.stopPropagation(); onDelete(note.id); }}>
                <DeleteOutlined
                  style={{ marginLeft: 'auto', color: '#ccc' }}
                  onClick={e => e.stopPropagation()}
                />
              </Popconfirm>
            </div>
          </div>
        ))}
        {notes.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: '#ccc' }}>暂无笔记</div>
        )}
      </div>
    </div>
  );
}
