/**
 * Recommendation intensity profiles — single source of truth.
 *
 * Used by:
 *   - settings/page.tsx (UI display)
 *   - /api/recommendations/refresh (engine thresholds)
 *   - dashboard/page.tsx (display filtering)
 *   - ProfileSync client component (auto-refresh)
 *
 * Rule: today_recommendation requires score >= highValue.
 *       observe_backlog requires observe <= score < highValue.
 *       score < observe → not shown on dashboard.
 */

export type ProfileId = 'minimal' | 'conservative' | 'standard' | 'broad' | 'observe_all'

export type ProfileThresholds = {
  mustRead:  number   // engine must_read tier minimum
  highValue: number   // today_recommendation minimum — strictly enforced
  observe:   number   // observe_backlog minimum
}

export type ProfilePreset = {
  id:         ProfileId
  label:      string
  desc:       string
  daily:      string
  thresholds: ProfileThresholds
}

export const PROFILE_PRESETS: ProfilePreset[] = [
  {
    id:    'minimal',
    label: '只看大事',
    desc:  '每天 1-3 条，只保留最重要的信息',
    daily: '每日约 1-3 条',
    thresholds: { mustRead: 88, highValue: 82, observe: 70 },
  },
  {
    id:    'conservative',
    label: '重点精选',
    desc:  '每天 3-8 条，质量优先，适合日常重点阅读',
    daily: '每日约 3-8 条',
    thresholds: { mustRead: 84, highValue: 72, observe: 55 },
  },
  {
    id:    'standard',
    label: '日常推荐',
    desc:  '每天 5-20 条，兼顾质量和覆盖',
    daily: '每日约 5-20 条',
    thresholds: { mustRead: 80, highValue: 65, observe: 50 },
  },
  {
    id:    'broad',
    label: '多看一些',
    desc:  '每天 10-30 条，扩大范围，适合主动浏览',
    daily: '每日约 10-30 条',
    thresholds: { mustRead: 75, highValue: 60, observe: 45 },
  },
  {
    id:    'observe_all',
    label: '广泛观察',
    desc:  '每天 20+ 条，宁可多看，也不要漏掉潜在重要信息',
    daily: '每日约 20+ 条',
    thresholds: { mustRead: 70, highValue: 55, observe: 40 },
  },
]

export const DEFAULT_PROFILE_ID: ProfileId = 'standard'

export const PROFILE_MAP = Object.fromEntries(
  PROFILE_PRESETS.map(p => [p.id, p]),
) as Record<ProfileId, ProfilePreset>

/** Returns the thresholds for a given profile ID, defaulting to standard. */
export function getProfileThresholds(profileId: string | null | undefined): ProfileThresholds {
  return PROFILE_MAP[profileId as ProfileId]?.thresholds
    ?? PROFILE_PRESETS.find(p => p.id === 'standard')!.thresholds
}

/** Cookie name for server-side profile reading. */
export const PROFILE_COOKIE = 'jarvis_profile'
export const PROFILE_UPDATED_AT_COOKIE = 'jarvis_profile_updated_at'

/** localStorage key for client-side persistence. */
export const SETTINGS_STORAGE_KEY = 'jarvis_settings_v1'
