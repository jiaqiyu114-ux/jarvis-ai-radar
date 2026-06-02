"use client"

import type { RecommendedItem } from "@/lib/recommendations/recommendation-engine"
import { EngineRecommendationCard } from "./_engine-recommendation-card"

/**
 * Top Signal — the #1 recommendation rendered as the larger "feature" multicolor
 * card (reference event-card form, spanning two columns). Color is keyed to the
 * score tier. Opening the detail modal / 查看原文 behavior is unchanged — it
 * delegates to the shared recommendation card.
 */
export function TopSignalCard({ item }: { item: RecommendedItem }) {
  return <EngineRecommendationCard item={item} enableDetail variant="color" feature colorIndex={0} />
}
