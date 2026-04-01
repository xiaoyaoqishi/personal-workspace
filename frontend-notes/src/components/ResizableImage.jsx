import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { useState, useCallback, useRef } from 'react';

function ImageResizeView({ node, updateAttributes, selected }) {
  const [resizing, setResizing] = useState(false);
  const imgRef = useRef(null);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    startX.current = e.clientX;
    startWidth.current = imgRef.current?.offsetWidth || 300;

    const onMouseMove = (ev) => {
      const diff = ev.clientX - startX.current;
      const newWidth = Math.max(50, startWidth.current + diff);
      updateAttributes({ width: newWidth });
    };
    const onMouseUp = () => {
      setResizing(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [updateAttributes]);

  return (
    <NodeViewWrapper as="span" className="resizable-image-wrapper" style={{ display: 'inline-block' }}>
      <span
        className={`resizable-image-container${selected ? ' selected' : ''}${resizing ? ' resizing' : ''}`}
        style={{ display: 'inline-block', position: 'relative', width: node.attrs.width ? `${node.attrs.width}px` : 'auto' }}
      >
        <img
          ref={imgRef}
          src={node.attrs.src}
          alt={node.attrs.alt || ''}
          title={node.attrs.title || ''}
          style={{ width: '100%', display: 'block' }}
          draggable={false}
        />
        <span
          className="resize-handle resize-handle-right"
          onMouseDown={onMouseDown}
        />
        <span
          className="resize-handle resize-handle-left"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setResizing(true);
            startX.current = e.clientX;
            startWidth.current = imgRef.current?.offsetWidth || 300;
            const onMouseMove = (ev) => {
              const diff = startX.current - ev.clientX;
              const newWidth = Math.max(50, startWidth.current + diff);
              updateAttributes({ width: newWidth });
            };
            const onMouseUp = () => {
              setResizing(false);
              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
          }}
        />
      </span>
    </NodeViewWrapper>
  );
}

const ResizableImage = Node.create({
  name: 'image',
  group: 'inline',
  inline: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: {
        default: null,
        parseHTML: (el) => {
          const w = el.getAttribute('width') || el.getAttribute('data-width');
          if (w) return parseInt(w, 10) || null;
          const sw = el.style.width;
          if (sw && sw.endsWith('px')) return parseInt(sw, 10) || null;
          return null;
        },
        renderHTML: (attrs) => {
          if (!attrs.width) return {};
          return { width: attrs.width, style: `width: ${attrs.width}px` };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'img[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageResizeView);
  },

  addCommands() {
    return {
      setImage: (options) => ({ commands }) => {
        return commands.insertContent({ type: this.name, attrs: options });
      },
    };
  },
});

export default ResizableImage;
