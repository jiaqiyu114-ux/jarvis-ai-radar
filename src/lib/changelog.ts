export type SectionType = 'NEW FEATURE' | 'IMPROVEMENT' | 'FIX'

export type ChangelogEntry = {
  version: string
  date:    string
  title:   string
  sections: { type: SectionType; items: string[] }[]
}

export const LATEST_VERSION = 'v1.3.1'

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v1.3.1',
    date:    '26-06-03',
    title:   'Auth, Auto-Refresh & Pipeline',
    sections: [
      {
        type: 'NEW FEATURE',
        items: [
          '新增访客/管理员双模式登录，访客只读，管理员可修改信源',
          'Dashboard 自动触发 pipeline，快照超过 1 小时自动刷新，无需手动点击',
        ],
      },
      {
        type: 'IMPROVEMENT',
        items: [
          '文章全文抓取移出写入主流程，120 条信源写入从超时截断变为秒级完成，今天的内容不再丢失',
          '修复 KOL 博客文章因发布时间旧而消失的问题，新增信源首次发现时正确进入时间线',
          '推荐引擎候选池阈值调整，A/S 级信源历史文章可见',
        ],
      },
    ],
  },
  {
    version: 'v1.3.0',
    date:    '26-05-30',
    title:   'JARVIS Dashboard Launch',
    sections: [
      {
        type: 'NEW FEATURE',
        items: [
          '今日雷达信号时间线，按发布时间排列，带 NOW 标记',
          '全量流、精选流、事件簇、日报、选题池完整页面',
          '信源管理 CRUD，RSS 健康状态监控',
          '推荐引擎 + 每日快照，分数分布可视化',
        ],
      },
    ],
  },
]
