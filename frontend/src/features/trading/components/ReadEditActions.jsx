import { Button, Space } from 'antd';
import { EditOutlined, SaveOutlined } from '@ant-design/icons';

export default function ReadEditActions({
  editing,
  saving = false,
  onEdit,
  onSave,
  onCancel,
  editDisabled = false,
  editText = '编辑',
  saveText = '保存',
  cancelText = '取消',
  saveType = 'primary',
}) {
  if (editing) {
    return (
      <Space>
        <Button type={saveType} loading={saving} icon={<SaveOutlined />} onClick={onSave}>
          {saveText}
        </Button>
        <Button onClick={onCancel}>{cancelText}</Button>
      </Space>
    );
  }
  return (
    <Button icon={<EditOutlined />} onClick={onEdit} disabled={editDisabled}>
      {editText}
    </Button>
  );
}
