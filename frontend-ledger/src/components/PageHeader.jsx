import React from 'react';
import { Flex, Space, Tag } from 'antd';

/**
 * PageHeader
 * Props:
 *   title       {string|ReactNode}  — 必填，页面标题
 *   subtitle    {string|ReactNode}  — 副标题，灰色 13px
 *   extra       {ReactNode}         — 右侧操作区
 *   breadcrumb  {ReactNode}         — 面包屑（可选，显示在标题上方）
 *   tag         {string}            — 标题旁 Tag 文字（如批次号）
 *   tagColor    {string}            — Tag 颜色，默认 'blue'
 */
export default function PageHeader({ title, subtitle, extra, breadcrumb, tag, tagColor = 'blue' }) {
  return (
    <div className="page-header">
      {breadcrumb && (
        <div style={{ marginBottom: 6, fontSize: 13, color: 'var(--lk-color-text-muted)' }}>
          {breadcrumb}
        </div>
      )}
      <Flex align="center" justify="space-between" gap={16}>
        <div>
          <Flex align="baseline" gap={8} wrap="wrap">
            <h1 className="page-header-title">{title}</h1>
            {tag && <Tag color={tagColor} style={{ marginTop: 2 }}>{tag}</Tag>}
          </Flex>
          {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
        </div>
        {extra && <Space wrap>{extra}</Space>}
      </Flex>
    </div>
  );
}
