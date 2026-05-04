import { Cascader, Form, Input, Modal } from 'antd'
import { useEffect } from 'react'

function buildCascaderOptions(categories) {
  // categories 是树结构，带 children
  const roots = (categories || []).filter((c) => !c.parent_id)
  return roots.map((root) => ({
    value: root.id,
    label: root.name,
    children: (root.children || []).map((child) => ({
      value: child.id,
      label: child.name,
    })),
  }))
}

export default function MerchantEditModal({ open, row, categories, onOk, onCancel, confirmLoading }) {
  const [form] = Form.useForm()

  useEffect(() => {
    if (open && row) {
      const catValue = row.default_category_id
        ? row.default_subcategory_id
          ? [row.default_category_id, row.default_subcategory_id]
          : [row.default_category_id]
        : undefined
      form.setFieldsValue({
        canonical_name: row.canonical_name || '',
        aliases_text: (row.aliases || []).join('、'),
        category_path: catValue,
      })
    } else if (open && !row) {
      form.resetFields()
    }
  }, [open, row, form])

  const handleOk = async () => {
    const values = await form.validateFields()
    const aliases = String(values.aliases_text || '')
      .split(/[、,，\n]/)
      .map((x) => x.trim())
      .filter(Boolean)
    const catPath = values.category_path || []
    const default_category_id = catPath[0] ?? null
    const default_subcategory_id = catPath[1] ?? null
    onOk({
      canonical_name: values.canonical_name,
      aliases,
      default_category_id,
      default_subcategory_id,
    })
  }

  return (
    <Modal
      title={row ? `编辑商户 #${row.id}` : '新建商户'}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={confirmLoading}
      destroyOnHide
      width={520}
    >
      <Form form={form} layout="vertical">
        <Form.Item label="规范商户名" name="canonical_name" rules={[{ required: true, message: '请输入规范商户名' }]}>
          <Input placeholder="规范商户名（必填）" />
        </Form.Item>
        <Form.Item label="别名" name="aliases_text">
          <Input.TextArea rows={3} placeholder="多个别名用顿号 / 逗号 / 换行分隔" />
        </Form.Item>
        <Form.Item label="默认分类" name="category_path">
          <Cascader
            options={buildCascaderOptions(categories)}
            changeOnSelect
            placeholder="选择分类（可选）"
            allowClear
            style={{ width: '100%' }}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
