import { useState } from 'react';
import { Input, Modal, Calendar, message } from 'antd';
import { PlusOutlined, HomeOutlined } from '@ant-design/icons';
import { notebookApi } from '../api';
import dayjs from 'dayjs';

export default function NotebookSider({
  notebooks, activeNotebook, onSelect, mode, onModeChange, onReload, onSelectDate,
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await notebookApi.create({ name: newName.trim() });
      setNewName('');
      setAddOpen(false);
      onReload();
    } catch { message.error('创建失败'); }
  };

  return (
    <div className="sider">
      <div className="sider-header">
        <h3>
          <span>知识笔记</span>
          <a href="/">
            <HomeOutlined /> 首页
          </a>
        </h3>
        <div className="mode-switch">
          <button className={mode === 'diary' ? 'active' : ''} onClick={() => onModeChange('diary')}>
            日记
          </button>
          <button className={mode === 'doc' ? 'active' : ''} onClick={() => onModeChange('doc')}>
            文档
          </button>
        </div>
      </div>

      {mode === 'diary' ? (
        <div className="calendar-wrapper">
          <Calendar
            fullscreen={false}
            onSelect={(date) => onSelectDate(date.format('YYYY-MM-DD'))}
          />
        </div>
      ) : (
        <div className="notebook-list">
          <div
            className={`notebook-item ${!activeNotebook ? 'active' : ''}`}
            onClick={() => onSelect(null)}
          >
            📋 全部文档
          </div>
          {notebooks.map(nb => (
            <div
              key={nb.id}
              className={`notebook-item ${activeNotebook === nb.id ? 'active' : ''}`}
              onClick={() => onSelect(nb.id)}
            >
              {nb.icon} {nb.name}
            </div>
          ))}
          <div className="notebook-item" onClick={() => setAddOpen(true)} style={{ color: 'rgba(255,255,255,0.4)' }}>
            <PlusOutlined /> 新建笔记本
          </div>
        </div>
      )}

      <Modal title="新建笔记本" open={addOpen} onOk={handleAdd} onCancel={() => setAddOpen(false)} okText="创建" cancelText="取消">
        <Input
          placeholder="笔记本名称"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onPressEnter={handleAdd}
        />
      </Modal>
    </div>
  );
}
