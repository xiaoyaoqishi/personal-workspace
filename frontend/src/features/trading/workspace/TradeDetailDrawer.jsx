import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Image,
  Input,
  InputNumber,
  message,
  Modal,
  Row,
  Slider,
  Space,
  Spin,
  Tag,
  Typography,
  Select,
} from 'antd';
import { PictureOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../../../api';
import { formatInstrumentDisplay, normalizeTagList } from '../display';
import { getTaxonomyLabel, taxonomyOptionsWithZh } from '../localization';
import { normalizeSourceLabelForDisplay } from '../sourceDisplay';
import ReadEditActions from '../components/ReadEditActions';

const { TextArea } = Input;
const IMAGE_MD_RE = /!\[[^\]]*]\(([^)\s]+)\)/g;
const IMG_TAG_RE = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
const RESEARCH_FONT_OPTIONS = [
  { label: '雅黑', value: '"Microsoft YaHei", "PingFang SC", sans-serif' },
  { label: '宋体', value: '"SimSun", "Songti SC", serif' },
  { label: '楷体', value: '"KaiTi", "STKaiti", serif' },
  { label: '黑体', value: '"SimHei", "Heiti SC", sans-serif' },
  { label: '等宽', value: '"Consolas", "Courier New", monospace' },
];

function extractResearchImageUrls(text) {
  const urls = [];
  const source = String(text || '');
  if (/<[a-z][\s\S]*>/i.test(source)) {
    let match = IMG_TAG_RE.exec(source);
    while (match) {
      if (match[1]) urls.push(match[1]);
      match = IMG_TAG_RE.exec(source);
    }
  } else {
    let match = IMAGE_MD_RE.exec(source);
    while (match) {
      if (match[1]) urls.push(match[1]);
      match = IMAGE_MD_RE.exec(source);
    }
  }
  return Array.from(new Set(urls));
}

function escapeHtml(raw) {
  return String(raw || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function legacyTextToHtml(text) {
  const escaped = escapeHtml(text);
  const withImage = escaped.replace(IMAGE_MD_RE, (_m, url) => `<img src="${url}" alt="research-image" />`);
  return withImage
    .split(/\n{2,}/)
    .map((x) => `<p>${(x || '').replaceAll('\n', '<br/>') || '<br/>'}</p>`)
    .join('');
}

function ensureResearchHtml(raw) {
  const text = String(raw || '').trim();
  if (!text) return '<p><br/></p>';
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return legacyTextToHtml(text);
}

function sanitizeResearchHtml(raw) {
  const noScript = String(raw || '').replace(/<script[\s\S]*?<\/script>/gi, '');
  const noEventAttrs = noScript
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '');
  return noEventAttrs;
}

function normalizeResearchHtml(raw) {
  const html = sanitizeResearchHtml(String(raw || '').trim());
  if (!html) return '';
  const textOnly = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  const hasImg = /<img[\s\S]*?>/i.test(html);
  return (!textOnly && !hasImg) ? '' : html;
}

function insertImageAtCursor(container, url) {
  if (!container) return;
  const html = `<p><img src="${url}" alt="research-image" /></p><p><br/></p>`;
  container.focus();
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    container.insertAdjacentHTML('beforeend', html);
    return;
  }
  let range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) {
    range = document.createRange();
    range.selectNodeContents(container);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  range.deleteContents();
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const frag = document.createDocumentFragment();
  let node;
  let lastNode = null;
  while ((node = temp.firstChild)) {
    lastNode = frag.appendChild(node);
  }
  range.insertNode(frag);
  if (lastNode) {
    range = document.createRange();
    range.setStartAfter(lastNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function ReadonlyParagraph({ label, value }) {
  const v = String(value || '').trim();
  if (!v) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <Typography.Text type="secondary">{label}</Typography.Text>
      <Typography.Paragraph style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{v}</Typography.Paragraph>
    </div>
  );
}

export default function TradeDetailDrawer({
  open,
  tradeId,
  loading,
  trade,
  review,
  reviewExists,
  source,
  legacy,
  reviewTaxonomy,
  savingReview,
  savingSource,
  savingLegacy,
  onClose,
  onReload,
  onOpenEdit,
  onChangeReview,
  onChangeSource,
  onChangeLegacy,
  onSaveReview,
  onSaveSource,
  onSaveLegacy,
}) {
  const [reviewEditing, setReviewEditing] = useState(false);
  const [sourceEditing, setSourceEditing] = useState(false);
  const [legacyEditing, setLegacyEditing] = useState(false);
  const [researchModalOpen, setResearchModalOpen] = useState(false);
  const [researchDraftHtml, setResearchDraftHtml] = useState('<p><br/></p>');
  const [researchUploading, setResearchUploading] = useState(false);
  const researchUploadRef = useRef(null);
  const researchEditorRef = useRef(null);
  const researchReadonlyRef = useRef(null);
  const selectedResearchImageRef = useRef(null);
  const [selectedResearchImageWidth, setSelectedResearchImageWidth] = useState(0);
  const [editorFontFamily, setEditorFontFamily] = useState('"Microsoft YaHei", "PingFang SC", sans-serif');
  const [editorFontSize, setEditorFontSize] = useState(14);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  useEffect(() => {
    setReviewEditing(false);
    setSourceEditing(false);
    setLegacyEditing(false);
    setResearchModalOpen(false);
    setResearchUploading(false);
    selectedResearchImageRef.current = null;
    setSelectedResearchImageWidth(0);
  }, [tradeId, open]);

  const reviewTags = useMemo(
    () => normalizeTagList(review?.tags),
    [review?.tags]
  );
  const sourceLabelDisplay = useMemo(
    () => normalizeSourceLabelForDisplay(source?.source_label),
    [source?.source_label],
  );

  const hasReviewContent = useMemo(() => {
    if (reviewTags.length > 0) return true;
    return [
      review?.opportunity_structure,
      review?.edge_source,
      review?.failure_type,
      review?.review_conclusion,
      review?.entry_thesis,
      review?.invalidation_valid_evidence,
      review?.invalidation_trigger_evidence,
      review?.invalidation_boundary,
      review?.management_actions,
      review?.exit_reason,
      review?.research_notes,
    ].some((x) => String(x || '').trim());
  }, [review, reviewTags]);
  const researchHtml = useMemo(
    () => ensureResearchHtml(review?.research_notes || ''),
    [review?.research_notes]
  );
  const researchImages = useMemo(
    () => extractResearchImageUrls(review?.research_notes || ''),
    [review?.research_notes]
  );

  useEffect(() => {
    const normalizeImages = (container) => {
      if (!container) return;
      container.querySelectorAll('img').forEach((img) => {
        img.style.maxWidth = '100%';
        img.style.borderRadius = '8px';
        img.style.display = 'block';
        img.style.margin = '10px 0';
        img.style.cursor = 'zoom-in';
      });
    };
    normalizeImages(researchEditorRef.current);
    normalizeImages(researchReadonlyRef.current);
  }, [researchDraftHtml, researchHtml, review?.research_notes]);

  const saveReview = async () => {
    await onSaveReview();
    setReviewEditing(false);
  };

  const saveSource = async () => {
    await onSaveSource();
    setSourceEditing(false);
  };

  const saveLegacy = async () => {
    await onSaveLegacy();
    setLegacyEditing(false);
  };

  const openResearchModal = () => {
    setResearchDraftHtml(ensureResearchHtml(review?.research_notes || ''));
    setResearchModalOpen(true);
  };

  const saveResearchDraft = () => {
    const currentHtml = researchEditorRef.current?.innerHTML ?? researchDraftHtml;
    onChangeReview('research_notes', normalizeResearchHtml(currentHtml));
    setResearchModalOpen(false);
  };

  const uploadResearchImages = async (files) => {
    if (!files || files.length === 0) return;
    setResearchUploading(true);
    try {
      const uploaded = [];
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        const res = await api.post('/upload', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const url = res.data?.url;
        if (url) uploaded.push(url);
      }
      const container = researchEditorRef.current;
      if (container && uploaded.length > 0) {
        uploaded.forEach((url) => insertImageAtCursor(container, url));
        setResearchDraftHtml(container.innerHTML);
      }
      message.success('图片已插入研究记录');
    } catch {
      message.error('图片上传失败');
    } finally {
      setResearchUploading(false);
      if (researchUploadRef.current) researchUploadRef.current.value = '';
    }
  };

  const handleResearchPaste = async (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageFiles = items
      .filter((item) => item.kind === 'file' && item.type && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (imageFiles.length === 0) return;
    e.preventDefault();
    await uploadResearchImages(imageFiles);
  };

  const applySelectedImageWidth = (nextWidth) => {
    const width = Number(nextWidth);
    if (!width || width < 40) return;
    const img = selectedResearchImageRef.current;
    if (!img) return;
    img.style.width = `${Math.round(width)}px`;
    img.style.height = 'auto';
    setSelectedResearchImageWidth(Math.round(width));
    if (researchEditorRef.current) {
      setResearchDraftHtml(researchEditorRef.current.innerHTML);
    }
  };

  const handleResearchEditorClick = (e) => {
    const img = e.target?.closest?.('img');
    if (!img) {
      selectedResearchImageRef.current = null;
      setSelectedResearchImageWidth(0);
      return;
    }
    selectedResearchImageRef.current = img;
    const width = Math.round(
      parseFloat(img.style.width || '0') || img.getBoundingClientRect().width || 0
    );
    setSelectedResearchImageWidth(width);
  };

  const cancelSectionEdit = async (setter) => {
    await onReload();
    setter(false);
  };

  return (
    <Drawer
      title={tradeId ? `交易详情 #${tradeId}` : '交易详情'}
      width={760}
      open={open}
      onClose={onClose}
      destroyOnClose={false}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={onReload} disabled={!tradeId}>
            刷新
          </Button>
          {tradeId ? (
            <Button type="primary" onClick={onOpenEdit}>
              打开完整编辑
            </Button>
          ) : null}
        </Space>
      }
    >
      {loading ? (
        <div className="trade-drawer-loading">
          <Spin />
        </div>
      ) : !trade ? (
        <Typography.Text type="secondary">未找到交易详情</Typography.Text>
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card size="small" title="成交流水信息">
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="交易日期">{trade.trade_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="品种">{formatInstrumentDisplay(trade.symbol, trade.contract)}</Descriptions.Item>
              <Descriptions.Item label="方向">
                <Tag color={trade.direction === '做多' ? 'red' : 'green'}>{trade.direction || '-'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={trade.status === 'closed' ? 'default' : 'processing'}>
                  {trade.status === 'closed' ? '已平' : '持仓'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="开仓价">{trade.open_price ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="平仓价">{trade.close_price ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="手数">{trade.quantity ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="盈亏">{trade.pnl ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="来源">{trade.source_display || '-'}</Descriptions.Item>
              <Descriptions.Item label="结构化复盘">
                {reviewExists ? <Tag color="green">已建立</Tag> : <Tag>未建立</Tag>}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card
            size="small"
            title="结构化复盘（主工作流）"
            extra={
              <ReadEditActions
                editing={reviewEditing}
                saving={savingReview}
                onEdit={() => setReviewEditing(true)}
                onSave={saveReview}
                onCancel={() => cancelSectionEdit(setReviewEditing)}
              />
            }
          >
            {reviewEditing ? (
              <Row gutter={12}>
                <Col span={12}>
                  <Typography.Text type="secondary">机会结构</Typography.Text>
                  <Select
                    value={review.opportunity_structure || undefined}
                    allowClear
                    options={taxonomyOptionsWithZh('opportunity_structure', reviewTaxonomy.opportunity_structure)}
                    onChange={(v) => onChangeReview('opportunity_structure', v || '')}
                    placeholder="选择机会结构"
                    style={{ width: '100%' }}
                  />
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">优势来源</Typography.Text>
                  <Select
                    value={review.edge_source || undefined}
                    allowClear
                    options={taxonomyOptionsWithZh('edge_source', reviewTaxonomy.edge_source)}
                    onChange={(v) => onChangeReview('edge_source', v || '')}
                    placeholder="选择优势来源"
                    style={{ width: '100%' }}
                  />
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">失败类型</Typography.Text>
                  <Select
                    value={review.failure_type || undefined}
                    allowClear
                    options={taxonomyOptionsWithZh('failure_type', reviewTaxonomy.failure_type)}
                    onChange={(v) => onChangeReview('failure_type', v || '')}
                    placeholder="选择失败类型"
                    style={{ width: '100%' }}
                  />
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">复盘结论</Typography.Text>
                  <Select
                    value={review.review_conclusion || undefined}
                    allowClear
                    options={taxonomyOptionsWithZh('review_conclusion', reviewTaxonomy.review_conclusion)}
                    onChange={(v) => onChangeReview('review_conclusion', v || '')}
                    placeholder="选择复盘结论"
                    style={{ width: '100%' }}
                  />
                </Col>
                <Col span={24}>
                  <Typography.Text type="secondary">标签</Typography.Text>
                  <Select
                    mode="tags"
                    tokenSeparators={[',', '，']}
                    value={review.tags || []}
                    onChange={(v) => onChangeReview('tags', v || [])}
                    style={{ width: '100%' }}
                    placeholder="输入并回车添加标签"
                  />
                </Col>
                <Col span={24}>
                  <Typography.Text type="secondary">入场论点</Typography.Text>
                  <TextArea rows={2} value={review.entry_thesis} onChange={(e) => onChangeReview('entry_thesis', e.target.value)} />
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">有效证据</Typography.Text>
                  <TextArea rows={2} value={review.invalidation_valid_evidence} onChange={(e) => onChangeReview('invalidation_valid_evidence', e.target.value)} />
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">失效证据</Typography.Text>
                  <TextArea rows={2} value={review.invalidation_trigger_evidence} onChange={(e) => onChangeReview('invalidation_trigger_evidence', e.target.value)} />
                </Col>
                <Col span={24}>
                  <Typography.Text type="secondary">边界</Typography.Text>
                  <TextArea rows={2} value={review.invalidation_boundary} onChange={(e) => onChangeReview('invalidation_boundary', e.target.value)} />
                </Col>
                <Col span={24}>
                  <Typography.Text type="secondary">管理动作</Typography.Text>
                  <TextArea rows={2} value={review.management_actions} onChange={(e) => onChangeReview('management_actions', e.target.value)} />
                </Col>
                <Col span={24}>
                  <Typography.Text type="secondary">离场原因</Typography.Text>
                  <TextArea rows={2} value={review.exit_reason} onChange={(e) => onChangeReview('exit_reason', e.target.value)} />
                </Col>
                <Col span={24}>
                  <Typography.Text type="secondary">研究记录</Typography.Text>
                  <div style={{ marginTop: 6 }}>
                    <Space>
                      <Button onClick={openResearchModal}>弹窗录入</Button>
                      <Typography.Text type="secondary">
                        支持文字与图片，图片会自动插入内容
                      </Typography.Text>
                    </Space>
                  </div>
                </Col>
              </Row>
            ) : !hasReviewContent ? (
              <Empty description="暂无结构化复盘内容" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <div>
                <Space wrap style={{ marginBottom: 8 }}>
                  {review.opportunity_structure ? <Tag color="blue">机会结构：{getTaxonomyLabel('opportunity_structure', review.opportunity_structure)}</Tag> : null}
                  {review.edge_source ? <Tag color="cyan">优势来源：{getTaxonomyLabel('edge_source', review.edge_source)}</Tag> : null}
                  {review.failure_type ? <Tag color="red">失败类型：{getTaxonomyLabel('failure_type', review.failure_type)}</Tag> : null}
                  {review.review_conclusion ? <Tag color="green">结论：{getTaxonomyLabel('review_conclusion', review.review_conclusion)}</Tag> : null}
                </Space>
                {reviewTags.length > 0 ? (
                  <div style={{ marginBottom: 10 }}>
                    <Typography.Text type="secondary">标签</Typography.Text>
                    <div style={{ marginTop: 4 }}>
                      {reviewTags.map((t) => <Tag key={t}>{t}</Tag>)}
                    </div>
                  </div>
                ) : null}
                <ReadonlyParagraph label="入场论点" value={review.entry_thesis} />
                <ReadonlyParagraph label="有效证据" value={review.invalidation_valid_evidence} />
                <ReadonlyParagraph label="失效证据" value={review.invalidation_trigger_evidence} />
                <ReadonlyParagraph label="边界" value={review.invalidation_boundary} />
                <ReadonlyParagraph label="管理动作" value={review.management_actions} />
                <ReadonlyParagraph label="离场原因" value={review.exit_reason} />
                {String(review.research_notes || '').trim() ? (
                  <div style={{ marginBottom: 10 }}>
                    <Typography.Text type="secondary">研究记录</Typography.Text>
                    <div
                      style={{
                        marginTop: 6,
                        border: '1px solid #f0f0f0',
                        borderRadius: 8,
                        background: '#fafafa',
                        padding: 12,
                        lineHeight: 1.75,
                      }}
                      onClick={(e) => {
                        const img = e.target.closest('img');
                        if (!img) return;
                        const src = img.getAttribute('src') || '';
                        const idx = researchImages.indexOf(src);
                        if (idx >= 0) {
                          setPreviewIndex(idx);
                          setPreviewOpen(true);
                        }
                      }}
                    >
                      <div ref={researchReadonlyRef} dangerouslySetInnerHTML={{ __html: researchHtml }} />
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </Card>

          <Card
            size="small"
            title="来源元数据（主工作流）"
            extra={
              <ReadEditActions
                editing={sourceEditing}
                saving={savingSource}
                onEdit={() => setSourceEditing(true)}
                onSave={saveSource}
                onCancel={() => cancelSectionEdit(setSourceEditing)}
              />
            }
          >
            {sourceEditing ? (
              <Row gutter={12}>
                <Col span={12}>
                  <Typography.Text type="secondary">券商</Typography.Text>
                  <Input value={source.broker_name} onChange={(e) => onChangeSource('broker_name', e.target.value)} placeholder="例如：宏源期货" />
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">来源标签</Typography.Text>
                  <Input value={source.source_label} onChange={(e) => onChangeSource('source_label', e.target.value)} placeholder="例如：手工补录" />
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">导入通道</Typography.Text>
                  <Input value={source.import_channel} onChange={(e) => onChangeSource('import_channel', e.target.value)} placeholder="例如：paste_import" />
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">解析版本</Typography.Text>
                  <Input value={source.parser_version} onChange={(e) => onChangeSource('parser_version', e.target.value)} placeholder="例如：paste_v1" />
                </Col>
                <Col span={24}>
                  <Typography.Text type="secondary">来源快照</Typography.Text>
                  <TextArea value={source.source_note_snapshot} onChange={(e) => onChangeSource('source_note_snapshot', e.target.value)} rows={2} />
                </Col>
              </Row>
            ) : (
              <Descriptions size="small" column={2}>
                <Descriptions.Item label="券商">{source.broker_name || '-'}</Descriptions.Item>
                <Descriptions.Item label="来源标签">{sourceLabelDisplay || '-'}</Descriptions.Item>
                <Descriptions.Item label="导入通道">{source.import_channel || '-'}</Descriptions.Item>
                <Descriptions.Item label="解析版本">{source.parser_version || '-'}</Descriptions.Item>
                <Descriptions.Item label="元数据状态" span={2}>
                  {source.exists_in_db ? <Tag color="blue">显式 metadata</Tag> : <Tag>兼容回退（notes）</Tag>}
                </Descriptions.Item>
                <Descriptions.Item label="来源快照" span={2}>{source.source_note_snapshot || '-'}</Descriptions.Item>
              </Descriptions>
            )}
          </Card>

          <Card
            size="small"
            title="兼容字段（次级）"
            extra={
              <ReadEditActions
                editing={legacyEditing}
                saving={savingLegacy}
                onEdit={() => setLegacyEditing(true)}
                onSave={saveLegacy}
                onCancel={() => cancelSectionEdit(setLegacyEditing)}
              />
            }
          >
            {legacyEditing ? (
              <>
                <Typography.Text type="secondary">legacy review_note</Typography.Text>
                <TextArea rows={2} value={legacy.review_note} onChange={(e) => onChangeLegacy('review_note', e.target.value)} />
                <Divider style={{ margin: '12px 0' }} />
                <Typography.Text type="secondary">legacy notes</Typography.Text>
                <TextArea rows={3} value={legacy.notes} onChange={(e) => onChangeLegacy('notes', e.target.value)} />
              </>
            ) : (
              <>
                <ReadonlyParagraph label="legacy review_note" value={legacy.review_note} />
                <ReadonlyParagraph label="legacy notes" value={legacy.notes} />
              </>
            )}
          </Card>
        </Space>
      )}
      <Modal
        title="研究记录录入"
        centered
        width={860}
        open={researchModalOpen}
        onCancel={() => setResearchModalOpen(false)}
        onOk={saveResearchDraft}
        okText="应用到复盘"
        destroyOnClose
      >
        <Space style={{ marginBottom: 10 }}>
          <Button
            icon={<PictureOutlined />}
            loading={researchUploading}
            onClick={() => researchUploadRef.current?.click()}
          >
            上传图片
          </Button>
          <Typography.Text type="secondary">可多选，上传后自动插入图片链接</Typography.Text>
          <input
            ref={researchUploadRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => uploadResearchImages(Array.from(e.target.files || []))}
          />
        </Space>
        <Space wrap style={{ marginBottom: 10 }}>
          <Typography.Text type="secondary">字体</Typography.Text>
          <select
            value={editorFontFamily}
            onChange={(e) => setEditorFontFamily(e.target.value)}
            style={{ height: 32, border: '1px solid #d9d9d9', borderRadius: 6, padding: '0 8px' }}
          >
            {RESEARCH_FONT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <Typography.Text type="secondary">字号</Typography.Text>
          <InputNumber
            min={12}
            max={36}
            value={editorFontSize}
            onChange={(v) => setEditorFontSize(Number(v) || 14)}
            style={{ width: 90 }}
          />
          {selectedResearchImageWidth > 0 ? (
            <>
              <Typography.Text type="secondary">图片宽度</Typography.Text>
              <Slider
                min={60}
                max={1200}
                step={1}
                value={selectedResearchImageWidth}
                onChange={applySelectedImageWidth}
                style={{ width: 220, margin: '0 8px' }}
              />
              <InputNumber
                min={60}
                max={1200}
                value={selectedResearchImageWidth}
                onChange={applySelectedImageWidth}
                style={{ width: 100 }}
              />
            </>
          ) : (
            <Typography.Text type="secondary">点击编辑区图片可缩放</Typography.Text>
          )}
        </Space>
        <div
          ref={researchEditorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={(e) => setResearchDraftHtml(e.currentTarget.innerHTML)}
          onPaste={handleResearchPaste}
          onClick={handleResearchEditorClick}
          style={{
            minHeight: 360,
            border: '1px solid #d9d9d9',
            borderRadius: 8,
            padding: 12,
            lineHeight: 1.75,
            background: '#fff',
            overflow: 'auto',
            fontSize: `${editorFontSize}px`,
            fontFamily: editorFontFamily,
            direction: 'ltr',
            textAlign: 'left',
            unicodeBidi: 'plaintext',
            writingMode: 'horizontal-tb',
          }}
          dangerouslySetInnerHTML={{ __html: researchDraftHtml }}
        />
      </Modal>
      <Image.PreviewGroup
        preview={{
          visible: previewOpen,
          current: previewIndex,
          onVisibleChange: (visible) => setPreviewOpen(visible),
          onChange: (current) => setPreviewIndex(current),
        }}
      >
        <div style={{ position: 'fixed', left: -99999, top: -99999, opacity: 0 }}>
          {researchImages.map((url, idx) => (
            <Image key={`${url}-${idx}`} src={url} alt="research" />
          ))}
        </div>
      </Image.PreviewGroup>
    </Drawer>
  );
}
