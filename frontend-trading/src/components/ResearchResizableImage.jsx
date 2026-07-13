import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { useCallback, useRef, useState } from 'react';

function ImageResizeView({ node, updateAttributes, selected }) {
  const [resizing, setResizing] = useState(false);
  const imageRef = useRef(null);

  const startResize = useCallback((event, direction) => {
    event.preventDefault();
    event.stopPropagation();
    setResizing(true);
    const startX = event.clientX;
    const startWidth = imageRef.current?.offsetWidth || 300;
    const onMove = (moveEvent) => {
      const distance = direction === 'right' ? moveEvent.clientX - startX : startX - moveEvent.clientX;
      updateAttributes({ width: Math.max(50, startWidth + distance) });
    };
    const onUp = () => {
      setResizing(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [updateAttributes]);

  return (
    <NodeViewWrapper as="span" className="research-resizable-image-wrapper">
      <span
        className={`research-resizable-image${selected ? ' selected' : ''}${resizing ? ' resizing' : ''}`}
        style={{ width: node.attrs.width ? `${node.attrs.width}px` : 'auto' }}
      >
        <img ref={imageRef} src={node.attrs.src} alt={node.attrs.alt || ''} title={node.attrs.title || ''} draggable={false} />
        <span className="research-resize-handle left" onMouseDown={(event) => startResize(event, 'left')} />
        <span className="research-resize-handle right" onMouseDown={(event) => startResize(event, 'right')} />
      </span>
    </NodeViewWrapper>
  );
}

const ResearchResizableImage = Node.create({
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
        parseHTML: (element) => {
          const width = element.getAttribute('width') || element.getAttribute('data-width') || element.style.width;
          return width ? parseInt(width, 10) || null : null;
        },
        renderHTML: (attributes) => attributes.width
          ? { width: attributes.width, style: `width: ${attributes.width}px` }
          : {},
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
      setImage: (options) => ({ commands }) => commands.insertContent({ type: this.name, attrs: options }),
    };
  },
});

export default ResearchResizableImage;
