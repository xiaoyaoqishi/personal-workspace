export const TAXONOMY_ZH = {
  opportunity_structure: {
    trend_initiation_pullback: '趋势启动回调',
    continuation_after_consolidation: '整理后延续',
    failed_breakout_reversal: '假突破反转',
    volatility_expansion_after_compression: '压缩后波动扩张',
    expectation_shift_second_leg: '预期切换二次段',
  },
  edge_source: {
    trend_continuation: '趋势延续',
    volatility_expansion: '波动扩张',
    positioning_squeeze: '持仓挤压',
    expectation_shift: '预期切换',
    liquidity_dislocation: '流动性错配',
    behavior_flow_asymmetry: '行为/流向不对称',
  },
  failure_type: {
    direction_wrong: '方向错误',
    timing_wrong: '时机错误',
    sizing_wrong: '仓位错误',
    execution_wrong: '执行错误',
    management_wrong: '管理错误',
    regime_mismatch: '市场环境不匹配',
    should_not_have_traded: '不该交易',
  },
  review_conclusion: {
    valid_pattern_valid_trade: '模式有效且交易有效',
    valid_pattern_invalid_trade: '模式有效但交易无效',
    invalid_pattern_but_profit: '模式无效但侥幸盈利',
    invalid_pattern_invalid_trade: '模式无效且交易无效',
    need_more_evidence: '证据不足待观察',
  },
};

export const TAXONOMY_FIELD_ZH = {
  opportunity_structure: '机会结构',
  edge_source: '优势来源',
  failure_type: '失败类型',
  review_conclusion: '复盘结论',
};

export const REVIEW_TYPE_ZH = {
  daily: '日复盘',
  weekly: '周复盘',
  monthly: '月复盘',
  custom: '自定义',
};

export const REVIEW_SCOPE_ZH = {
  periodic: '周期复盘',
  themed: '主题复盘',
  campaign: '阶段复盘',
  custom: '自定义',
};

export const REVIEW_LINK_ROLE_ZH = {
  linked_trade: '关联交易',
  best_trade: '最佳样本',
  worst_trade: '最差样本',
  representative_trade: '代表样本',
};

export const KNOWLEDGE_CATEGORY_ZH = {
  broker_reference: '券商/通道参考',
  symbol_note: '品种/合约笔记',
  pattern_dictionary: '形态词典',
  regime_note: '市场环境笔记',
  strategy_playbook: '策略作战手册',
  execution_checklist: '执行检查清单',
  review_heuristic: '复盘启发式',
  risk_rule: '风控规则',
  infrastructure_note: '交易基础设施',
};

export const KNOWLEDGE_STATUS_ZH = {
  active: '启用',
  archived: '归档',
  draft: '草稿',
};

export const KNOWLEDGE_PRIORITY_ZH = {
  high: '高',
  medium: '中',
  low: '低',
};

export function getTaxonomyLabel(field, canonicalValue) {
  const value = String(canonicalValue || '').trim();
  if (!value) return '-';
  return TAXONOMY_ZH[field]?.[value] || value;
}

export function taxonomyOptionsWithZh(field, values = []) {
  return values.map((value) => ({
    value,
    label: getTaxonomyLabel(field, value),
  }));
}

export function taxonomyCanonicalValues(field) {
  return Object.keys(TAXONOMY_ZH[field] || {});
}

export function mapLabel(dict, value, fallback = '-') {
  const key = String(value || '').trim();
  if (!key) return fallback;
  return dict[key] || key;
}

export function dictToOptions(dict) {
  return Object.entries(dict).map(([value, label]) => ({ value, label }));
}
