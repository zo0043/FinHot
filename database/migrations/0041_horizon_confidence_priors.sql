-- 0041：方向 v2（horizon + confidence）+ M2/M3 学习边的三张版本化表（方案 §6）。纯增量。
--
-- analyses/publications 加 horizon/confidence 两列（direction v2 起模型输出主判定窗口与置信度）：
--   horizon ∈ t1/t3/t5（相对事件公布后首个交易日 T0 的 T+1/T+3/T+5，即 1/3/5 个交易日）；
--   confidence 0-100 整数。旧行保持 NULL（Phase 1 起新预测有值，验收 ≥95%，不做回填）。
--   台账 prediction_ledger 的同名列已在 0040 就位，本迁移不重复加。
ALTER TABLE analyses
  ADD COLUMN horizon text CHECK (horizon IN ('t1', 't3', 't5')),
  ADD COLUMN confidence integer CHECK (confidence BETWEEN 0 AND 100);
ALTER TABLE publications
  ADD COLUMN horizon text CHECK (horizon IN ('t1', 't3', 't5')),
  ADD COLUMN confidence integer CHECK (confidence BETWEEN 0 AND 100);

-- M2 基率先验（priors.regenerate 产出，按版本引用；coarse 格子 n≥100 方可引用，见 T2.4）。
CREATE TABLE base_rate_priors (
  version text NOT NULL,
  event_type text NOT NULL,
  sector_key text NOT NULL DEFAULT '',          -- '' = 跨板块
  horizon text NOT NULL CHECK (horizon IN ('t1', 't3', 't5')),
  regime text NOT NULL DEFAULT 'all',
  n_units integer NOT NULL,
  raw_rate numeric,                             -- 去重单元原始命中率
  hit_rate numeric,                             -- 收缩后（k=50）
  cum_pct_mean numeric,
  oot_hit_rate numeric,                         -- 最后 2 周 holdout
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (version, event_type, sector_key, horizon, regime)
);
COMMENT ON TABLE base_rate_priors IS 'M2 基率先验：事件类型×板块×horizon 的收缩命中率，版本化；A/B 注入（T3.1）只读 active 版本';

-- M2 置信度校准曲线（§5.4：10 分位 bin，按 prompt_version×model 切片，可对照版本间漂移）。
CREATE TABLE calibration_curve (
  version text NOT NULL,
  prompt_version text NOT NULL,
  model text NOT NULL,
  bin_lo integer NOT NULL CHECK (bin_lo BETWEEN 0 AND 90 AND bin_lo % 10 = 0),
  n integer NOT NULL,
  actual_rate numeric,
  brier numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (version, prompt_version, model, bin_lo)
);
COMMENT ON TABLE calibration_curve IS 'M2 置信度校准：confidence 分 bin 的实际命中率与 Brier 分，版本化';

-- M3 参数版本（thresholds/weights/priors_weight 的提案→审批→应用留痕；禁止 auto-apply，见 T3.2）。
CREATE TABLE parameter_versions (
  version text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('thresholds', 'weights', 'priors_weight')),
  params jsonb NOT NULL,
  evidence jsonb NOT NULL,                       -- OOT lift / n / 窗口 / 收缩说明
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'applied', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decision_note text
);
COMMENT ON TABLE parameter_versions IS 'M3 参数提案：人工审批留痕（decision_note），status=applied 才生效；禁止 auto-apply';
