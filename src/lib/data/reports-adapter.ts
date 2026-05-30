import { mockReports } from '@/config/mock-data'
import { shouldUseDatabase } from './runtime'
import type { DailyReport } from '@/types'

export const latestReport: DailyReport = mockReports[0]

/**
 * Returns the daily report.
 *
 * Real report generation (score → cluster → AI summarize) is not yet implemented.
 *
 * In DB mode (Supabase configured):
 *   - Default: returns null → caller shows empty state
 *   - includeDemo=true: returns the mock report as a demo preview
 *
 * In non-DB mode (no Supabase): always returns mock report for dev experience.
 */
export async function getDailyReport(opts?: { includeDemo?: boolean }): Promise<DailyReport | null> {
  if (shouldUseDatabase()) {
    if (opts?.includeDemo) return latestReport
    return null  // real pipeline not yet wired up
  }
  return latestReport  // non-DB mode: always show mock for development
}
