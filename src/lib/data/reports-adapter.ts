import { mockReports } from '@/config/mock-data'
import type { DailyReport } from '@/types'

// Reports are assembled from scored items + AI summarization.
// Until the pipeline (score → cluster → summarize) is wired up,
// reports always come from mock data regardless of data mode.

export const latestReport: DailyReport = mockReports[0]

export async function getDailyReport(): Promise<DailyReport> {
  return latestReport
}
