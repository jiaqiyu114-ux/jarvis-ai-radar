import type { RecommendedItem } from "@/lib/recommendations/recommendation-engine"

/**
 * Short, honest recommendation reason — reads like a system judgement, not a
 * summary. No "猜你喜欢 / 你的兴趣" framing (§1.3): we talk about source quality,
 * evidence strength, multi-source resonance and score thresholds.
 */
export function buildReason(item: RecommendedItem): string {
  const score   = item.finalScore
  const signals = item.relatedSignals?.length ?? 0
  if (item.isOfficial)                                return "官方源发布，可信度较高。"
  if (item.qualityFlags.includes("strong_evidence"))  return "多来源交叉验证，证据强度高。"
  if (signals >= 3)                                   return `已被 ${signals} 个相关源同时提到，多源共振。`
  if (signals >= 2)                                   return `${signals} 个信号佐证，关注度在上升。`
  if (item.isUserCurated)                             return "来自你认可的信源，适合快速扫一眼。"
  if (score >= 80)                                    return "综合信号很强，建议优先阅读。"
  if (score >= 72)                                    return "分数达到今日推荐线。"
  if (score >= 65)                                    return "分数达到今日阈值，但仍缺少多源验证。"
  return "进入观察范围，仅供参考。"
}
