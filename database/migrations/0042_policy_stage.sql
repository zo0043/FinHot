-- 0042：政策生命周期阶段（政策化改造 W3）。纯增量；旧行保持 NULL。
-- policy_stage ∈ draft/release/interpretation/details/pilot/execution，仅 policy_regulation 事件有值；
-- 拿不准为 NULL（与 direction=none 纪律一致）。direction 步同一次模型调用输出（directions.md），
-- 与 direction/scope/horizon/confidence 同回执、同 prompt_version。
ALTER TABLE analyses
  ADD COLUMN policy_stage text CHECK (policy_stage IN ('draft','release','interpretation','details','pilot','execution'));
ALTER TABLE publications
  ADD COLUMN policy_stage text CHECK (policy_stage IN ('draft','release','interpretation','details','pilot','execution'));
