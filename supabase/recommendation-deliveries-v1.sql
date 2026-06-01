-- recommendation-deliveries-v1.sql
-- Daily delivery tracking for J.A.R.V.I.S. Daily Push v1.
-- Records which items were delivered to which bucket on each date.
-- Prevents same-day re-delivery and supports backlog tracking.

create table if not exists recommendation_deliveries (
  id               uuid          primary key default gen_random_uuid(),
  item_id          uuid          not null,
  snapshot_id      uuid          null,
  delivery_date    text          not null,
  delivery_bucket  text          not null,
  tier             text          null,
  final_score      numeric       null,
  reason           text          null,
  delivered_at     timestamptz   not null default now(),
  created_at       timestamptz   not null default now(),
  constraint recommendation_deliveries_bucket_check
    check (delivery_bucket in ('today_recommendation', 'observe_backlog', 'archive')),
  constraint recommendation_deliveries_unique_delivery
    unique (item_id, delivery_date, delivery_bucket)
);

comment on table recommendation_deliveries is 'J.A.R.V.I.S. daily push delivery tracking — records each item delivery per day per bucket';
comment on column recommendation_deliveries.delivery_date is 'YYYY-MM-DD in JARVIS_TIMEZONE';
comment on column recommendation_deliveries.delivery_bucket is 'today_recommendation | observe_backlog | archive';

create index if not exists recommendation_deliveries_date_bucket_idx
  on recommendation_deliveries (delivery_date, delivery_bucket);

create index if not exists recommendation_deliveries_item_idx
  on recommendation_deliveries (item_id);

create index if not exists recommendation_deliveries_snapshot_idx
  on recommendation_deliveries (snapshot_id)
  where snapshot_id is not null;
