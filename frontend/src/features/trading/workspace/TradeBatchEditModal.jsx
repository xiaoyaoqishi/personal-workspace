import { Input, Modal, Select, Space } from 'antd';

export default function TradeBatchEditModal({
  open,
  selectedCount,
  patch,
  onCancel,
  onConfirm,
  onChangePatch,
}) {
  return (
    <Modal
      title={`批量修改（${selectedCount} 条）`}
      open={open}
      onCancel={onCancel}
      onOk={onConfirm}
      okText="应用修改"
      cancelText="取消"
    >
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <Select
          value={patch.status}
          onChange={(v) => onChangePatch('status', v)}
          placeholder="状态（不改可留空）"
          allowClear
          options={[
            { label: '持仓', value: 'open' },
            { label: '已平', value: 'closed' },
          ]}
        />
        <Input
          value={patch.strategy_type}
          onChange={(e) => onChangePatch('strategy_type', e.target.value)}
          placeholder="策略类型（不改可留空）"
        />
        <Select
          value={patch.is_planned}
          onChange={(v) => onChangePatch('is_planned', v)}
          placeholder="计划内（不改可留空）"
          allowClear
          options={[
            { label: '是', value: 'true' },
            { label: '否', value: 'false' },
          ]}
        />
        <Input.TextArea
          value={patch.notes}
          onChange={(e) => onChangePatch('notes', e.target.value)}
          placeholder="备注（不改可留空）"
          autoSize={{ minRows: 3, maxRows: 6 }}
        />
      </Space>
    </Modal>
  );
}
