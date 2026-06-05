export type SectionType = 'NEW FEATURE' | 'IMPROVEMENT' | 'FIX'

export type ChangelogEntry = {
  version: string
  date:    string
  title:   string
  sections: { type: SectionType; items: string[] }[]
}

export const LATEST_VERSION = 'v1.4.0'

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v1.4.0',
    date:    '26-06-05',
    title:   'Radar Accuracy Overhaul',
    sections: [
      {
        type: 'FIX',
        items: [
          '今日雷达长期展示数天前旧文的根本原因已修复：评分在首次入库时被冻结，旧博客存档被当成新鲜内容推荐。引擎现在每次运行时用真实发布时间重新计算分数，2015 年的文章不再出现在「今日必看」',
          '发布近因排序：今天发布的内容 +10 分，超过 30 天的内容 -25 分，今日雷达真正以今天为中心',
          '候选池截断问题修复：新增「最近抓到」保底查询，今日新文章不再因分数中等而被高分存档文章挤出候选池之外',
          '分数并列时按发布时间降序稳定排序，消除 100 分并列时的随机顺序',
          'Daily gate 接入 Cron 和手动两条管线，昨日及更早的条目不再混入「今日必看」',
          '手动多次刷新快照不再清空「必看」：投递记录加入 4 小时宽限期，4 小时内重复运行不标记为「已投递」',
        ],
      },
      {
        type: 'IMPROVEMENT',
        items: [
          'Google DeepMind Blog 修复为 RSS 订阅（之前为 web-only，从未被抓取）',
          'Google Research Blog、Mistral AI Blog、The Verge AI 解除因多次失败产生的硬封锁，恢复定期重试',
          '信源选择器新增 S/A 级保留席位：每次运行前半段名额强制保留给顶级信源，避免被大量 C 级信源挤满',
          '快照存储从 top-50 升级为全量合格条目（约 150 条），观察列表、候选参考内容更完整',
          '手动生成快照改为跳过 RSS 抓取、仅重新打分，速度从约 50 秒缩短至约 8 秒',
          '信源管理页统计数字颜色适配浅色/深色双主题，不再在浅色模式下难以辨认',
        ],
      },
    ],
  },
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
