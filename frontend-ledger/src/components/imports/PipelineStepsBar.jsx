import { Steps } from 'antd'

const PIPELINE_STEPS = [
  { title: '上传' },
  { title: '解析识别' },
  { title: '去重' },
  { title: '复核' },
  { title: '入账' },
]

/**
 * PipelineStepsBar — 静态流程指引，不接活跃状态
 */
export default function PipelineStepsBar() {
  return (
    <Steps
      size="small"
      items={PIPELINE_STEPS}
      style={{ padding: '12px 16px', background: 'var(--lk-color-primary-soft)', borderRadius: 'var(--lk-radius-sm)' }}
    />
  )
}
