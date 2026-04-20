export const ACCOUNT_TYPE_OPTIONS = [
  { label: '现金', value: 'cash' },
  { label: '银行卡', value: 'bank' },
  { label: '信用卡', value: 'credit_card' },
  { label: '电子钱包', value: 'ewallet' },
  { label: '投资账户', value: 'investment' },
  { label: '其他', value: 'other' },
]

export const CATEGORY_TYPE_OPTIONS = [
  { label: '收入', value: 'income' },
  { label: '支出', value: 'expense' },
  { label: '通用', value: 'both' },
]

export const TRANSACTION_TYPE_OPTIONS = [
  { label: '收入', value: 'income' },
  { label: '支出', value: 'expense' },
  { label: '转账', value: 'transfer' },
  { label: '退款', value: 'refund' },
  { label: '还款', value: 'repayment' },
  { label: '手续费', value: 'fee' },
  { label: '利息', value: 'interest' },
  { label: '调整', value: 'adjustment' },
]

export const DIRECTION_OPTIONS = [
  { label: '收入', value: 'income' },
  { label: '支出', value: 'expense' },
  { label: '中性', value: 'neutral' },
]

export const CURRENCY_OPTIONS = [
  { label: '人民币 CNY', value: 'CNY' },
  { label: '美元 USD', value: 'USD' },
]

export const RECURRING_RULE_TYPE_OPTIONS = [
  { label: '订阅支出', value: 'subscription' },
  { label: '支出', value: 'expense' },
  { label: '收入', value: 'income' },
  { label: '转账', value: 'transfer' },
  { label: '还款', value: 'repayment' },
]

export const RECURRING_FREQUENCY_OPTIONS = [
  { label: '每周', value: 'weekly' },
  { label: '每月', value: 'monthly' },
  { label: '每年', value: 'yearly' },
]

export const WEEKDAY_OPTIONS = [
  { label: '周一', value: 0 },
  { label: '周二', value: 1 },
  { label: '周三', value: 2 },
  { label: '周四', value: 3 },
  { label: '周五', value: 4 },
  { label: '周六', value: 5 },
  { label: '周日', value: 6 },
]
