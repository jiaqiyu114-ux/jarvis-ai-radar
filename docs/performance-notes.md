# J.A.R.V.I.S. Performance Notes

## 본 문서의 목적

페이지 렌더 성능, hydration 안전성, 렌더 최적화에 관한 메모.
복잡한 최적화 시스템을 기술하는 게 아니라, "조용히 느려지거나 경고가 생기기 쉬운 지점"을 기록한다.

---

## 2026-05-29 체검 결과 및 조치

### 검사한 페이지

`/dashboard` · `/feed` · `/selected` · `/clusters` · `/reports` · `/topics` · `/sources` · `/settings`

### 발견 및 수정

#### 1. `TopStatusBar` — date hydration 경고

**문제**: `new Date().toLocaleDateString(...)` 이 컴포넌트 렌더 바디에서 직접 호출됨.
정적 빌드(`○` 경로) 페이지는 빌드 시 server-render 되고, 사용자가 페이지를 열 때 client-side hydration 이 일어난다.
서버 렌더 시점의 날짜(빌드 날짜)와 클라이언트 hydration 시점의 날짜(사용자 현재 날짜)가 다를 경우 React hydration 경고 발생.

**수정**: `<div suppressHydrationWarning>` 추가.
클라이언트가 올바른 날짜로 조용히 덮어쓴다. 경고 없음.

#### 2. `InformationCard` — hover state 불필요한 re-render

**문제**: `hovered` 라는 `useState` 가 있어서 매 `mouseenter` / `mouseleave` 시 카드 전체가 re-render.
피드 페이지에 카드가 많을 때 스크롤 중 hover 이벤트가 빠르게 발생 → 다수의 re-render.

**수정**: `hovered` state + mouse event handlers 제거.
피드백 버튼 visibility 는 Tailwind `group` / `group-hover:opacity-100` CSS 로 전환.
React 상태 업데이트 없이 순수 CSS transition.

#### 3. `_clusters-client.tsx` — `Date.now()` hydration 경고

**문제**: `const NOW = Date.now()` 가 모듈 최상단에 있었으나, 이를 컴포넌트 함수 내부로 이동 시
ESLint `react-hooks/purity` 위반 발생("Cannot call impure function during render").

**결론**: 모듈 레벨은 ESLint 규칙상 허용 범위. 컴포넌트 내부 이동은 금지.
대신 `今日新增` 같이 `NOW` 에 의존하는 숫자 표시에 `suppressHydrationWarning` 추가.
build-time vs. hydration-time 간 카운트 차이를 조용히 허용. 표시 값은 항상 올바름.

#### 4. Empty state 추가

- `/clusters` — 클러스터 목록이 비어있을 때 "暂无活跃事件簇" + 설명 텍스트
- `/sources` — sources 테이블이 비어있을 때 tbody 빈 행 + 안내 메시지

---

## Client Component 현황 (정상 범위)

| 컴포넌트 | `"use client"` 이유 |
|---------|-------------------|
| `SidebarNav` | `usePathname()` 필요 |
| `TopStatusBar` | 기존 유지 (필요 시 실시간 시각 추가 예정) |
| `InformationCard` | `useState` — 스코어 상세 토글 |
| `FeedbackActions` | `onClick` handlers |
| `TopicCard` | `useState` — 확장 토글 |
| `_feed-client.tsx` | `useState` — 검색/필터 |
| `_clusters-client.tsx` | `useState` — 개별 클러스터 확장 |
| `_topics-client.tsx` | `useState` — 탭 상태 |
| `_reports-client.tsx` | `useState` — 복사 상태 |
| `settings/page.tsx` | `useState` — 슬라이더/스위치 |

`score-badge.tsx` · `source-tier-badge.tsx` · `stat-card.tsx` 등 순수 표시 컴포넌트는 모두 server component. ✓

---

## 앞으로 느려진다면 먼저 살펴볼 곳

| 증상 | 확인 대상 |
|------|---------|
| 피드 스크롤 끊김 | `InformationCard` 내 state, date 포매팅 횟수 |
| 페이지 전환 느림 | 서버 adapter 함수의 DB 쿼리 시간 (`should use DB` 분기) |
| 데이터 갱신 후 깜빡임 | SWR / React Query 없음 — 현재 props-only, 새로고침 필요 |
| 콘솔 hydration 경고 | `new Date()` · `Date.now()` 렌더 호출 여부 확인 |
| 번들 크기 증가 | `pnpm build` 출력에서 route 별 First Load JS 확인 |

---

## 하지 않은 것

- 가상 스크롤 (virtual list) — 현재 mock 데이터 크기에서 불필요
- SWR / React Query — 현재 서버 컴포넌트 props 패턴으로 충분
- `React.memo` / `useMemo` 전면 적용 — 측정 없이 적용하면 오히려 복잡도만 증가
- 이미지 최적화 — 현재 이미지 없음
- `loading.tsx` Suspense 스트리밍 — 정적 빌드 페이지에서는 불필요
