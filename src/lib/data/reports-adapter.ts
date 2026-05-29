/**
 * Reports Adapter — data-source-agnostic access to daily reports.
 *
 * Exposes:
 *   - Async functions for Server Components.
 *   - Sync constants for the Client Component reports page.
 *
 * Currently always returns mock data.
 * TODO (next sprint): in 'database' mode, assemble report from db items/clusters/topics.
 * No AI calls here — reports are assembled from already-scored items.
 */

import { mockReports } from '@/config/mock-data'
import type { DailyReport } from '@/types'

// ── Sync constants — Client Component uses these directly ─────────────────────

export const latestReport: DailyReport = mockReports[0]

// ── Async functions — Server Components and future DB integration ─────────────

export async function getDailyReport(): Promise<DailyReport> {
  // TODO: if getDataMode() === 'database', assemble report from db
  return latestReport
}
