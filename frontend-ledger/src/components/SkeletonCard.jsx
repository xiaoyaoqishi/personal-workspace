import React from 'react';
import { Skeleton } from 'antd';

/**
 * SkeletonCard — 通用表格骨架卡片，M2/M3/M4 页面加载占位使用
 * Props:
 *   rows    {number} — 骨架行数，默认 6
 *   active  {boolean} — 是否动画，默认 true
 */
export default function SkeletonCard({ rows = 6, active = true }) {
  return (
    <div
      className="page-card"
      style={{ padding: 'var(--lk-space-5)' }}
    >
      <Skeleton active={active} paragraph={{ rows }} />
    </div>
  );
}
