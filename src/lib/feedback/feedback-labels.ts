import type { DbItemFeedbackType } from '@/types/database'

export type FeedbackTypeGroup = 'processing_intent' | 'evidence_quality' | 'system_calibration'

export const FEEDBACK_TYPE_LABELS: Record<DbItemFeedbackType, string> = {
  save_reference:         '保存资料',
  add_to_watch:           '加入观察',
  worth_writing:          '值得写',
  project_related:        '项目相关',
  strong_evidence:        '证据强',
  weak_evidence:          '证据弱',
  clickbait_or_marketing: '标题党 / 营销',
  duplicate_info:         '重复信息',
  overestimated:          '系统高估',
  underestimated:         '系统低估',
  not_worth_reading:      '不值得看',
}

export const FEEDBACK_TYPE_DESCRIPTIONS: Record<DbItemFeedbackType, string> = {
  save_reference:         '这条信息值得作为资料保存。',
  add_to_watch:           '这条信息适合持续观察后续变化。',
  worth_writing:          '这条信息具备进一步展开成内容的价值。',
  project_related:        '这条信息与当前项目、产品或长期判断有关。',
  strong_evidence:        '这条信息的证据基础较强，适合优先参考。',
  weak_evidence:          '这条信息证据不足，需要谨慎判断。',
  clickbait_or_marketing: '这条信息可能存在标题党、营销包装或过度宣传。',
  duplicate_info:         '这条信息与已捕捉内容重复度较高。',
  overestimated:          '系统对这条信息的价值判断偏高。',
  underestimated:         '系统对这条信息的价值判断偏低。',
  not_worth_reading:      '这条信息暂不值得投入阅读时间。',
}

export const FEEDBACK_TYPE_GROUPS: Record<DbItemFeedbackType, FeedbackTypeGroup> = {
  save_reference:         'processing_intent',
  add_to_watch:           'processing_intent',
  worth_writing:          'processing_intent',
  project_related:        'processing_intent',
  strong_evidence:        'evidence_quality',
  weak_evidence:          'evidence_quality',
  clickbait_or_marketing: 'system_calibration',
  duplicate_info:         'system_calibration',
  overestimated:          'system_calibration',
  underestimated:         'system_calibration',
  not_worth_reading:      'system_calibration',
}

export const FEEDBACK_TYPE_ORDER: DbItemFeedbackType[] = [
  'save_reference',
  'add_to_watch',
  'worth_writing',
  'project_related',
  'strong_evidence',
  'weak_evidence',
  'clickbait_or_marketing',
  'duplicate_info',
  'overestimated',
  'underestimated',
  'not_worth_reading',
]

export const FEEDBACK_FILTER_OPTIONS: Array<{ value: 'all' | DbItemFeedbackType; label: string }> = [
  { value: 'all', label: '全部' },
  ...FEEDBACK_TYPE_ORDER.map(type => ({
    value: type,
    label: FEEDBACK_TYPE_LABELS[type],
  })),
]
