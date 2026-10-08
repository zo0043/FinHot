-- 0040：预测台账 + market_daily 行情富化（T0.4 方向全量化的地基）。
-- 注：原文件是手工 CI 应用变体（内嵌 BEGIN/COMMIT + 自插 schema_migrations 行，
-- 会提前提交 migrate.ts 的外层事务并造成重复键）；已改为与其他迁移一致：
-- 纯 DDL，由 scripts/migrate.ts 统一记账。保留两个手工修正：
--   1) article_id: uuid -> text (articles.id is text; uuid FK cannot be implemented)
--   2) baseline_ref COMMENT: double-quoted string -> single-quoted (SQL syntax error)
CREATE TABLE prediction_ledger (
  id bigserial PRIMARY KEY,
  analyses_id bigint NOT NULL UNIQUE REFERENCES analyses(id),
  article_id text NOT NULL REFERENCES articles(id),
  t0 timestamptz NOT NULL,
  prompt_version text NOT NULL,
  model text,
  direction text NOT NULL CHECK (direction IN ('bullish', 'bearish', 'neutral', 'none')),
  direction_status text NOT NULL DEFAULT 'ok' CHECK (direction_status IN ('ok', 'failed', 'skipped')),
  scope text[] NOT NULL DEFAULT '{}',
  horizon text CHECK (horizon IN ('t1', 't3', 't5')),
  confidence integer CHECK (confidence BETWEEN 0 AND 100),
  published boolean NOT NULL DEFAULT false,
  input_snapshot jsonb NOT NULL DEFAULT '{}',
  outcome_status text NOT NULL DEFAULT 'pending' CHECK (outcome_status IN ('pending', 'labeled', 'skipped')),
  t0_date date,
  cum_pct_t1 numeric,
  cum_pct_t3 numeric,
  cum_pct_t5 numeric,
  hit_t1 boolean,
  hit_t3 boolean,
  hit_t5 boolean,
  baseline_ref text,
  labeled_at timestamptz
);
CREATE INDEX ledger_t0_idx ON prediction_ledger (t0);
CREATE INDEX ledger_pending_idx ON prediction_ledger (outcome_status) WHERE outcome_status = 'pending';
CREATE INDEX ledger_scope_idx ON prediction_ledger USING gin (scope);
COMMENT ON TABLE prediction_ledger IS
  'M1 预测台账（含反事实）：所有已打分文章 direction 判断的 t0 冻结记录 + T+N 结果标注；append-only（outcome 列除外）';
COMMENT ON COLUMN prediction_ledger.t0 IS '预测时刻 = analyses.created_at，冻结不可变';
COMMENT ON COLUMN prediction_ledger.published IS 't0 时刻该文章是否 selected（用户面）';
COMMENT ON COLUMN prediction_ledger.input_snapshot IS 't0 冻结输入原文：{title_zh, summary_zh, category, tags, source, prompt_version, model, market_ctx, prior_ctx}';
COMMENT ON COLUMN prediction_ledger.t0_date IS 'T0 = 严格晚于 D(t0) 的第一个 market_daily 交易日（防泄漏规则，见 labeler）';
COMMENT ON COLUMN prediction_ledger.baseline_ref IS '''sector:BKxxxx'' | ''bench:sh000300'' —— 实际走势与基线所用序列';
ALTER TABLE market_daily
  ADD COLUMN zljlr numeric,
  ADD COLUMN zdf_d5 numeric,
  ADD COLUMN zdf_d20 numeric,
  ADD COLUMN zdf_d60 numeric;
COMMENT ON COLUMN market_daily.zljlr IS '主力净流入（元），腾讯 rank 行原始字符串转 numeric；NULL=源未提供';
COMMENT ON COLUMN market_daily.zdf_d5 IS '5 日累计涨跌幅 %（腾讯 rank 行）';
COMMENT ON COLUMN market_daily.zdf_d20 IS '20 日累计涨跌幅 %（腾讯 rank 行）';
COMMENT ON COLUMN market_daily.zdf_d60 IS '60 日累计涨跌幅 %（腾讯 rank 行）';
