import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const SCALE_FACTOR = 1.25;
const MIN_SCALE = 0.4;
const MAX_SCALE = 5;

function clampScale(value) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

export default function ImageLightbox({ src, alt = '', onClose }) {
  const [scale, setScale] = useState(1);
  const [imageSize, setImageSize] = useState(null);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [dragging, setDragging] = useState(false);
  const stageRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === '+' || event.key === '=') setScale((current) => clampScale(current * SCALE_FACTOR));
      if (event.key === '-') setScale((current) => clampScale(current / SCALE_FACTOR));
      if (event.key === '0') setScale(1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const handleResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!src) return null;

  const zoomIn = () => setScale((current) => clampScale(current * SCALE_FACTOR));
  const zoomOut = () => setScale((current) => clampScale(current / SCALE_FACTOR));
  const startPan = (event) => {
    if (scale <= 1 || !stageRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: stageRef.current.scrollLeft,
      scrollTop: stageRef.current.scrollTop,
    };
    setDragging(true);
  };
  const movePan = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !stageRef.current) return;
    event.preventDefault();
    stageRef.current.scrollLeft = drag.scrollLeft - (event.clientX - drag.x);
    stageRef.current.scrollTop = drag.scrollTop - (event.clientY - drag.y);
  };
  const stopPan = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  };
  const fittedWidth = imageSize
    ? Math.min(
      imageSize.width,
      viewport.width * 0.9,
      imageSize.width * (Math.max(80, viewport.height - 124) / Math.max(1, imageSize.height)),
    )
    : null;

  return createPortal(
    <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="图片预览" onClick={onClose}>
      <div className="image-lightbox-toolbar" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={zoomOut} disabled={scale <= MIN_SCALE} title="缩小（-）">−</button>
        <button type="button" className="image-lightbox-scale" onClick={() => setScale(1)} title="恢复为适应窗口（0）">
          {Math.round(scale * 100)}%
        </button>
        <button type="button" onClick={zoomIn} disabled={scale >= MAX_SCALE} title="放大（+）">＋</button>
        <button type="button" className="image-lightbox-close" onClick={onClose} title="关闭（Esc）">×</button>
      </div>
      <div ref={stageRef} className={`image-lightbox-stage${scale > 1 ? ' can-pan' : ''}${dragging ? ' is-dragging' : ''}`} onClick={onClose}>
        <img
          src={src}
          alt={alt}
          style={fittedWidth ? { width: `${fittedWidth * scale}px`, maxWidth: 'none', maxHeight: 'none' } : undefined}
          onLoad={(event) => setImageSize({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          })}
          draggable={false}
          onPointerDown={startPan}
          onPointerMove={movePan}
          onPointerUp={stopPan}
          onPointerCancel={stopPan}
          onClick={(event) => event.stopPropagation()}
        />
      </div>
    </div>,
    document.body,
  );
}
