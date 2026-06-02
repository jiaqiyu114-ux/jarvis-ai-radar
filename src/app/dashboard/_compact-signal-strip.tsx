/**
 * One-line signal stats under the hero. No card, no KPI boxes: a single quiet
 * line so the working stats are present without competing with the content.
 */
export function CompactSignalStrip({
  captured, recommended, mustRead, candidates, snapshotAge,
}: {
  captured: number
  recommended: number
  mustRead: number
  candidates: number
  snapshotAge: string
}) {
  return (
    <div className="signal-line">
      <span><span className="num">{captured}</span> 捕捉</span>
      <span className="sep">·</span>
      <span><span className="num">{recommended}</span> 推荐</span>
      <span className="sep">·</span>
      <span><span className="num">{mustRead}</span> 必看</span>
      <span className="sep">·</span>
      <span>候选 <span className="num">{candidates}</span></span>
      <span className="sep">·</span>
      <span><span className="num">{snapshotAge}</span> 快照</span>
    </div>
  )
}
