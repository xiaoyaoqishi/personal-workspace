import { useState, useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import ImageExt from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Highlight from '@tiptap/extension-highlight';
import dayjs from 'dayjs';

function Toolbar({ editor }) {
  if (!editor) return null;

  const btn = (label, action, isActive) => (
    <button
      className={`toolbar-btn ${isActive ? 'is-active' : ''}`}
      onClick={action}
      title={label}
    >
      {label}
    </button>
  );

  return (
    <div className="editor-toolbar">
      {btn('B', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'))}
      {btn('I', () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'))}
      {btn('U', () => editor.chain().focus().toggleUnderline().run(), editor.isActive('underline'))}
      {btn('S', () => editor.chain().focus().toggleStrike().run(), editor.isActive('strike'))}
      {btn('高亮', () => editor.chain().focus().toggleHighlight().run(), editor.isActive('highlight'))}
      <div className="toolbar-divider" />
      {btn('H1', () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }))}
      {btn('H2', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }))}
      {btn('H3', () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive('heading', { level: 3 }))}
      <div className="toolbar-divider" />
      {btn('无序', () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'))}
      {btn('有序', () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'))}
      {btn('引用', () => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote'))}
      {btn('代码', () => editor.chain().focus().toggleCodeBlock().run(), editor.isActive('codeBlock'))}
      <div className="toolbar-divider" />
      {btn('左', () => editor.chain().focus().setTextAlign('left').run(), editor.isActive({ textAlign: 'left' }))}
      {btn('中', () => editor.chain().focus().setTextAlign('center').run(), editor.isActive({ textAlign: 'center' }))}
      {btn('右', () => editor.chain().focus().setTextAlign('right').run(), editor.isActive({ textAlign: 'right' }))}
      <div className="toolbar-divider" />
      {btn('图片', () => {
        const url = prompt('输入图片 URL');
        if (url) editor.chain().focus().setImage({ src: url }).run();
      }, false)}
      {btn('链接', () => {
        const url = prompt('输入链接 URL');
        if (url) editor.chain().focus().setLink({ href: url }).run();
      }, editor.isActive('link'))}
      {btn('分割线', () => editor.chain().focus().setHorizontalRule().run(), false)}
    </div>
  );
}

export default function NoteEditor({ note, onUpdate }) {
  const [title, setTitle] = useState(note?.title || '');

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: '开始写作...' }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      ImageExt,
      Link.configure({ openOnClick: false }),
      Highlight,
    ],
    content: note?.content || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const text = editor.getText();
      onUpdate(note.id, { content: html, word_count: text.length });
    },
  });

  useEffect(() => {
    setTitle(note?.title || '');
    if (editor && note) {
      const currentContent = editor.getHTML();
      if (currentContent !== (note.content || '')) {
        editor.commands.setContent(note.content || '');
      }
    }
  }, [note?.id]);

  const handleTitleChange = (e) => {
    const val = e.target.value;
    setTitle(val);
    onUpdate(note.id, { title: val });
  };

  return (
    <div className="editor-panel">
      <div className="editor-header">
        <input
          className="editor-title-input"
          placeholder="输入标题..."
          value={title}
          onChange={handleTitleChange}
        />
      </div>
      <Toolbar editor={editor} />
      <div className="editor-content">
        <EditorContent editor={editor} />
      </div>
      <div className="editor-footer">
        <span>{note.word_count || 0} 字</span>
        <span>最后编辑: {dayjs(note.updated_at).format('YYYY-MM-DD HH:mm')}</span>
      </div>
    </div>
  );
}
