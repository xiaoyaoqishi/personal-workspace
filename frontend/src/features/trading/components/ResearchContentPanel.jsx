import { useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Empty,
  Image,
  Input,
  InputNumber,
  Modal,
  Row,
  Slider,
  Space,
  Typography,
  message,
} from 'antd';
import { DeleteOutlined, PictureOutlined } from '@ant-design/icons';
import api from '../../../api';

const { TextArea } = Input;
const IMG_TAG_RE = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
const IMAGE_MD_RE = /!\[[^\]]*]\(([^)\s]+)\)/g;
const FORMAT_KIND = 'research_v2';

function stripHtmlToText(html) {
  const withBreak = String(html || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<\/div>\s*<div[^>]*>/gi, '\n');
  return withBreak
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function extractImageUrls(raw) {
  const source = String(raw || '');
  const urls = [];
  if (/<[a-z][\s\S]*>/i.test(source)) {
    let m = IMG_TAG_RE.exec(source);
    while (m) {
      if (m[1]) urls.push(m[1]);
      m = IMG_TAG_RE.exec(source);
    }
  }
  let md = IMAGE_MD_RE.exec(source);
  while (md) {
    if (md[1]) urls.push(md[1]);
    md = IMAGE_MD_RE.exec(source);
  }
  return Array.from(new Set(urls));
}

function normalizeImage(item, idx) {
  const width = Number(item?.width);
  return {
    id: String(item?.id || `${Date.now()}-${idx}`),
    url: String(item?.url || '').trim(),
    width: Number.isFinite(width) ? Math.max(120, Math.min(1200, Math.round(width))) : 120,
    caption: String(item?.caption || '').trim(),
  };
}

function parseResearchValue(raw) {
  const text = String(raw || '').trim();
  if (!text) return { body: '', images: [] };

  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.kind === FORMAT_KIND) {
      return {
        body: String(parsed.body || ''),
        images: Array.isArray(parsed.images)
          ? parsed.images.map((x, i) => normalizeImage(x, i)).filter((x) => x.url)
          : [],
      };
    }
  } catch {
    // fall back to legacy parsing
  }

  const legacyImages = extractImageUrls(text).map((url, i) => ({
    id: `legacy-${i}`,
    url,
    width: 120,
    caption: '',
  }));
  const body = /<[a-z][\s\S]*>/i.test(text)
    ? stripHtmlToText(text)
    : text.replace(IMAGE_MD_RE, '').trim();
  return { body, images: legacyImages };
}

function serializeResearchValue(model) {
  const body = String(model?.body || '').trim();
  const images = (Array.isArray(model?.images) ? model.images : [])
    .map((x, i) => normalizeImage(x, i))
    .filter((x) => x.url);

  if (!body && images.length === 0) return '';

  return JSON.stringify({
    kind: FORMAT_KIND,
    version: 2,
    body,
    images,
  });
}

export default function ResearchContentPanel({
  value,
  editing = false,
  title = '图文研究记录',
  onChange,
}) {
  const parsed = useMemo(() => parseResearchValue(value), [value]);
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState(parsed);
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  const openModal = () => {
    setDraft(parseResearchValue(value));
    setModalOpen(true);
  };

  const saveModal = () => {
    onChange?.(serializeResearchValue(draft));
    setModalOpen(false);
  };

  const updateImage = (idx, patch) => {
    setDraft((prev) => {
      const next = [...(prev.images || [])];
      next[idx] = { ...next[idx], ...patch };
      return { ...prev, images: next };
    });
  };

  const removeImage = (idx) => {
    setDraft((prev) => ({ ...prev, images: (prev.images || []).filter((_, i) => i !== idx) }));
  };

  const uploadImages = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded = [];
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        const res = await api.post('/upload', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const url = String(res.data?.url || '').trim();
        if (url) uploaded.push(url);
      }
      if (uploaded.length > 0) {
        setDraft((prev) => ({
          ...prev,
          images: [
            ...(prev.images || []),
            ...uploaded.map((url, i) => ({ id: `${Date.now()}-${i}`, url, width: 120, caption: '' })),
          ],
        }));
      }
      message.success('图片已添加到研究内容');
    } catch {
      message.error('图片上传失败');
    } finally {
      setUploading(false);
      if (uploadRef.current) uploadRef.current.value = '';
    }
  };

  const handlePasteImage = async (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageFiles = items
      .filter((item) => item.kind === 'file' && item.type && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (imageFiles.length === 0) return;
    e.preventDefault();
    await uploadImages(imageFiles);
  };

  const readonlyData = parsed;

  if (!editing) {
    const hasText = String(readonlyData.body || '').trim().length > 0;
    const hasImages = (readonlyData.images || []).length > 0;
    if (!hasText && !hasImages) {
      return <Empty description="暂无图文研究记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }

    return (
      <div>
        <Typography.Text type="secondary">{title}</Typography.Text>
        <div
          style={{
            marginTop: 6,
            border: '1px solid #f0f0f0',
            borderRadius: 8,
            background: '#fafafa',
            padding: 12,
          }}
        >
          {hasText ? (
            <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: hasImages ? 12 : 0 }}>
              {readonlyData.body}
            </Typography.Paragraph>
          ) : null}

          {hasImages ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {readonlyData.images.map((img, idx) => (
                <div key={img.id || idx} style={{ width: `${img.width || 120}px`, maxWidth: '100%' }}>
                  <img
                    src={img.url}
                    alt={img.caption || `research-${idx + 1}`}
                    style={{
                      width: '100%',
                      borderRadius: 8,
                      display: 'block',
                      cursor: 'zoom-in',
                    }}
                    onClick={() => {
                      setPreviewIndex(idx);
                      setPreviewOpen(true);
                    }}
                  />
                  {img.caption ? (
                    <Typography.Text type="secondary" style={{ marginTop: 6, display: 'inline-block' }}>
                      {img.caption}
                    </Typography.Text>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <Image.PreviewGroup
          preview={{
            visible: previewOpen,
            current: previewIndex,
            onVisibleChange: (visible) => setPreviewOpen(visible),
            onChange: (current) => setPreviewIndex(current),
          }}
        >
          <div style={{ position: 'fixed', left: -99999, top: -99999, opacity: 0 }}>
            {(readonlyData.images || []).map((img, idx) => (
              <Image key={`${img.url}-${idx}`} src={img.url} alt={`research-${idx + 1}`} />
            ))}
          </div>
        </Image.PreviewGroup>
      </div>
    );
  }

  return (
    <>
      <Space>
        <Button onClick={openModal}>图文录入</Button>
        <Typography.Text type="secondary">稳定模式：文本 + 图片卡片，支持逐图宽度调节</Typography.Text>
      </Space>

      <Modal
        title={title}
        centered
        width={920}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={saveModal}
        okText="应用内容"
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div>
            <Typography.Text type="secondary">研究文本</Typography.Text>
            <TextArea
              rows={6}
              value={draft.body}
              onChange={(e) => setDraft((prev) => ({ ...prev, body: e.target.value }))}
              onPaste={handlePasteImage}
              placeholder="记录你的研究结论、证据链、复盘要点..."
            />
            <Typography.Text type="secondary" style={{ marginTop: 6, display: 'inline-block' }}>
              支持 Ctrl+V 直接粘贴截图到图片列表
            </Typography.Text>
          </div>

          <div>
            <Space style={{ marginBottom: 8 }}>
              <Button
                icon={<PictureOutlined />}
                loading={uploading}
                onClick={() => uploadRef.current?.click()}
              >
                上传图片
              </Button>
              <Typography.Text type="secondary">可多选；每张图可独立设置宽度与说明</Typography.Text>
            </Space>
            <input
              ref={uploadRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => uploadImages(Array.from(e.target.files || []))}
            />

            {(draft.images || []).length === 0 ? (
              <Empty description="还没有图片" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size={10}>
                {draft.images.map((img, idx) => (
                  <Card
                    key={img.id || idx}
                    size="small"
                    title={`图片 ${idx + 1}`}
                    extra={
                      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeImage(idx)}>
                        移除
                      </Button>
                    }
                  >
                    <img
                      src={img.url}
                      alt={`draft-${idx + 1}`}
                      style={{
                        width: `${img.width || 120}px`,
                        maxWidth: '100%',
                        borderRadius: 8,
                        display: 'block',
                        marginBottom: 10,
                      }}
                    />
                    <Space wrap style={{ width: '100%' }}>
                      <Typography.Text type="secondary">宽度</Typography.Text>
                      <Slider
                        min={120}
                        max={1200}
                        step={1}
                        value={img.width || 120}
                        onChange={(v) => updateImage(idx, { width: Number(v) || 120 })}
                        style={{ width: 220, margin: '0 8px' }}
                      />
                      <InputNumber
                        min={120}
                        max={1200}
                        value={img.width || 120}
                        onChange={(v) => updateImage(idx, { width: Number(v) || 120 })}
                        style={{ width: 100 }}
                      />
                      <Input
                        placeholder="图片说明（可选）"
                        value={img.caption || ''}
                        onChange={(e) => updateImage(idx, { caption: e.target.value })}
                        style={{ width: 320 }}
                      />
                    </Space>
                  </Card>
                ))}
              </Space>
            )}
          </div>
        </Space>
      </Modal>
    </>
  );
}
