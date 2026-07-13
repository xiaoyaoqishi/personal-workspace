import { Alert, AutoComplete, Input, Modal, Space } from 'antd';

export default function TradeImportModal({
  open,
  loading,
  sourceOptions,
  broker,
  text,
  result,
  onCancel,
  onConfirm,
  onBrokerChange,
  onTextChange,
}) {
  return (
    <Modal
      title="粘贴导入期货交易"
      open={open}
      onCancel={onCancel}
      onOk={onConfirm}
      okText="开始导入"
      cancelText="取消"
      confirmLoading={loading}
      width={860}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <Alert
          type="info"
          showIcon
          message="直接从 Excel 复制 10 列数据后粘贴即可"
          description="粘贴导入入口当前已下线。"
        />
        <AutoComplete
          value={broker}
          onChange={onBrokerChange}
          style={{ width: 260 }}
          options={sourceOptions}
          placeholder="券商名称（支持自定义）"
        />
        <Input.TextArea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="在 Excel 中选中含表头或不含表头的数据区域，复制后粘贴到这里"
          autoSize={{ minRows: 12, maxRows: 22 }}
        />
        {result && (
          <div style={{ fontSize: 13 }}>
            <div>
              新增：{result.inserted}，跳过重复：{result.skipped}，错误：
              {result.errors?.length || 0}
            </div>
            {(result.errors?.length || 0) > 0 && (
              <div
                style={{
                  marginTop: 8,
                  maxHeight: 180,
                  overflowY: 'auto',
                  background: '#fafafa',
                  border: '1px solid #eee',
                  padding: 8,
                }}
              >
                {result.errors.slice(0, 30).map((er, i) => (
                  <div key={i}>
                    第{er.row}行：{er.reason}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Space>
    </Modal>
  );
}
