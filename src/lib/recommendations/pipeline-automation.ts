import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

export type PipelineAutomationStatus = {
  localTaskScriptAvailable: boolean
  vercelCronConfigured: boolean
  cronPath: string | null
  recommendedSchedule: 'every 6 hours'
  secretConfigured: boolean
}

async function fileExists(absPath: string): Promise<boolean> {
  try {
    await access(absPath)
    return true
  } catch {
    return false
  }
}

export async function getPipelineAutomationStatus(): Promise<PipelineAutomationStatus> {
  const rootDir = process.cwd()
  const taskScriptPath = path.join(rootDir, 'scripts', 'register-local-pipeline-task.ps1')
  const vercelConfigPath = path.join(rootDir, 'vercel.json')
  const secretConfigured = Boolean(process.env.PIPELINE_SECRET)

  let vercelCronConfigured = false
  let cronPath: string | null = null

  try {
    const raw = await readFile(vercelConfigPath, 'utf8')
    const parsed = JSON.parse(raw) as { crons?: Array<{ path?: string; schedule?: string }> }
    const crons = Array.isArray(parsed.crons) ? parsed.crons : []
    const matched = crons.find(c => typeof c.path === 'string' && c.path.includes('/api/pipeline/recommendations'))
    if (matched?.path) {
      vercelCronConfigured = true
      cronPath = matched.path
    }
  } catch {
    vercelCronConfigured = false
    cronPath = null
  }

  return {
    localTaskScriptAvailable: await fileExists(taskScriptPath),
    vercelCronConfigured,
    cronPath,
    recommendedSchedule: 'every 6 hours',
    secretConfigured,
  }
}
