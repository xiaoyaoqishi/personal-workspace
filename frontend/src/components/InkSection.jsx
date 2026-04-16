import { Spin } from 'antd';
import './InkSection.css';

export default function InkSection({ title, extra, loading, className, size, children, style }) {
  const cls = ['ink-section', size === 'small' && 'ink-section-sm', className].filter(Boolean).join(' ');
  return (
    <div className={cls} style={style}>
      {title && (
        <div className="ink-section-header">
          <span className="ink-section-title">{title}</span>
          {extra && <div className="ink-section-extra">{extra}</div>}
        </div>
      )}
      {loading ? (
        <Spin spinning>{children}</Spin>
      ) : (
        children
      )}
    </div>
  );
}
