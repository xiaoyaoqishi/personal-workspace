import React from 'react';
import { Empty, Button } from 'antd';

/**
 * EmptyBlock
 * Props:
 *   description  {string}   — 描述文字，默认"暂无数据"
 *   actionText   {string}   — CTA 按钮文字（不传则不显示按钮）
 *   onAction     {Function} — CTA 点击回调
 */
export default function EmptyBlock({ description = '暂无数据', actionText, onAction }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
      }}
    >
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <span style={{ color: 'var(--lk-color-text-secondary)', fontSize: 14 }}>
            {description}
          </span>
        }
      />
      {actionText && onAction && (
        <Button
          type="primary"
          onClick={onAction}
          style={{ marginTop: 16 }}
        >
          {actionText}
        </Button>
      )}
    </div>
  );
}
