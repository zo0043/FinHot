-- 0022：市场数据与事件方向。纯增量（向后兼容：旧行 default 填充）。
--
-- analyses/publications 加方向两列（回测与站点透出都用 publications 这层）：
--   direction 是「事件内在方向」（利好谁/利空谁），不是指数预测；
--   scope 只允许 industry/sectors.ts 的板块 key，应用层保证，这里只做非空校验兜底。
ALTER TABLE analyses ADD COLUMN direction text CHECK (direction IN ('bullish', 'bearish', 'neutral', 'none'));
ALTER TABLE analyses ADD COLUMN scope text[] NOT NULL DEFAULT '{}';
ALTER TABLE publications ADD COLUMN direction text CHECK (direction IN ('bullish', 'bearish', 'neutral', 'none'));
ALTER TABLE publications ADD COLUMN scope text[] NOT NULL DEFAULT '{}';

-- market_daily：日频市场数据，回测输入 + 日报「今日盘面」。不公开（只站内/Bark/后台用）。
--   trade_date 北京时间口径；index_key 见下；extra 放涨跌停家数、两融余额等非行情结构数据。
CREATE TABLE market_daily (
  trade_date date NOT NULL,
  index_key text NOT NULL,   -- 指数/板块：sh000300/sh000001/bk1036/zt_count/dt_count/margin_bal
  close numeric,
  prev_close numeric,
  pct numeric,               -- 当日涨跌幅 %；zt_count 等条数类没有则 null
  extra jsonb NOT NULL DEFAULT '{}',
  source text NOT NULL DEFAULT 'eastmoney',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trade_date, index_key)
);
CREATE INDEX market_daily_key_date_idx ON market_daily (index_key, trade_date DESC);
COMMENT ON TABLE market_daily IS '日频行情与结构数据：回测、日报盘面、Bark 卡片的历史上下文；不对外公开';
