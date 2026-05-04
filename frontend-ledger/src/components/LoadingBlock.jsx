import React from 'react';
import { Spin } from 'antd';

/**
 * LoadingBlock
 * Props:
 *   tip     {string} — 加载文案，默认"加载中..."
 *   minHeight {number} — 最小高度 px，默认 220
 */
export default function LoadingBlock({ tip = '加载中...', minHeight = 220 }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight,
        color: 'var(--lk-color-text-muted)',
        gap: 12,
      }}
    >
      <Spin size="large" />
      <span style={{ fontSize: 14, color: 'var(--lk-color-text-secondary)' }}>{tip}</span>
    </div>
  );
}
