"use client"

import { Heart, ThumbsUp, ThumbsDown, BookmarkPlus, PenLine, Ban, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { FeedbackAction } from "@/types"

interface FeedbackActionsProps {
  itemId: string
  state?: {
    isFavorited?: boolean
    isUseful?: boolean
    isUseless?: boolean
    inTopicPool?: boolean
  }
  onAction?: (action: FeedbackAction, itemId: string) => void
}

const actions: Array<{
  key: FeedbackAction
  icon: React.ElementType
  label: string
  activeKey?: keyof NonNullable<FeedbackActionsProps['state']>
}> = [
  { key: 'favorite', icon: Heart, label: '收藏', activeKey: 'isFavorited' },
  { key: 'useful', icon: ThumbsUp, label: '有用', activeKey: 'isUseful' },
  { key: 'useless', icon: ThumbsDown, label: '无用', activeKey: 'isUseless' },
  { key: 'add_to_topic_pool', icon: BookmarkPlus, label: '加入选题池', activeKey: 'inTopicPool' },
  { key: 'generate_angle', icon: PenLine, label: '生成选题' },
  { key: 'track_entity', icon: Eye, label: '追踪主体' },
  { key: 'block_source', icon: Ban, label: '屏蔽信源' },
]

export function FeedbackActions({ itemId, state = {}, onAction }: FeedbackActionsProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-0.5">
        {actions.map(({ key, icon: Icon, label, activeKey }) => {
          const isActive = activeKey ? state[activeKey] : false
          return (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-7 w-7 text-muted-foreground hover:text-foreground",
                    isActive && key === 'favorite' && "text-red-400 hover:text-red-400",
                    isActive && key === 'useful' && "text-green-400 hover:text-green-400",
                    isActive && key === 'useless' && "text-red-400 hover:text-red-400",
                    isActive && key === 'add_to_topic_pool' && "text-violet-400 hover:text-violet-400",
                  )}
                  onClick={() => onAction?.(key, itemId)}
                >
                  <Icon className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {label}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
