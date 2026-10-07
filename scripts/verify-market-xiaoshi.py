#!/usr/bin/env python3
"""market_daily × xiaoshi-data 交叉核对（host-only 工具，不进容器）。

原理：
  xiaoshi sector-constituents 每个快照文件里，成分股行自带**当日** return_pct（%）。
  按 THS 行业名 → FinHot 18 板块映射（SECTOR_CANDIDATES），对每个 (交易日, 板块)
  算成分股等权平均收益，与 market_daily 同日的 pct（主源腾讯板块 / 回补东财板块）对比。
  两边成员口径不同（THS vs 申万/东财），只查漂移量级，不要求相等：
  中位 |偏差| 应 < 0.8pp，|偏差|>1.5pp 的占比应 < 50%（超阈值退出码 1）。

用法：
  # 1) 先导出 market_daily（宿主）
  sudo docker exec aihot-db-1 psql -U aihot -d aihot -Atc \
    "select trade_date, index_key, pct from market_daily order by 1,2" > /tmp/market_daily.csv

  # 2) 跑核对（用 .xiaoshi_setup venv 的 python，带 pyarrow）
  /home/ubuntu/dsh-workspace/0914/.xiaoshi_setup/venv/bin/python \
    /home/ubuntu/app/FinHot/scripts/verify-market-xiaoshi.py /tmp/market_daily.csv [--parquet <path>]

  --parquet 缺省时取 ~/dsh-workspace/0914/xiaoshi_history 下最新的 .parquet。
  成分股快照日不连续（2026-08 起 8 周 16 个快照日），只会对"两边都有"的日期做核对。
"""
from __future__ import annotations

import argparse
import glob
import os
import statistics
import sys
from collections import defaultdict

import pyarrow.parquet as pq

# THS 行业名 → FinHot 板块（候选名按优先级排；取文件里实际存在的名字，等权聚合）。
# 2026-10-07 更新：xiaoshi 快照改为细粒度 THS 二级名（313 个，如“数字芯片设计”“国有大型银行”），
# 旧的一级名（“半导体”“银行”“白酒”）部分仍存在；两边都保留，命中哪些用哪些。
SECTOR_CANDIDATES: dict[str, list[str]] = {
    "semicap": ["半导体", "数字芯片设计", "模拟芯片设计", "集成电路制造", "集成电路封测", "半导体材料", "半导体设备"],
    "ai-app": ["计算机", "软件开发", "互联网服务", "计算机设备", "垂直应用软件", "横向通用软件", "IT服务", "互联网电商"],
    "new-energy": ["电力设备", "光伏设备", "风电设备", "电池", "光伏加工设备", "光伏电池组件", "光伏辅材", "硅料硅片", "风电整机", "风电零部件", "逆变器", "锂电池", "电池化学品", "电网设备"],
    "liquor": ["食品饮料", "白酒", "其他酒类", "调味发酵品", "软饮料", "食品加工制造", "休闲食品", "乳品"],
    "pharma": ["医药生物", "创新药", "化学制药", "生物制品", "原料药", "中药", "化学制剂", "医疗器械", "体外诊断", "医药商业", "医药流通"],
    "military": ["国防军工", "航天Ⅱ", "航空装备Ⅱ", "航海装备Ⅱ", "军工电子Ⅱ", "地面兵装Ⅱ", "军工电子", "军工装备", "航天装备", "航空装备", "航海装备", "地面兵装"],
    "bank": ["银行", "银行Ⅱ", "国有大型银行", "股份制银行", "城商行", "农商行"],
    "broker": ["非银金融", "证券Ⅱ", "保险Ⅱ", "多元金融", "证券", "保险", "多元金融"],
    "real-estate": ["房地产", "房地产开发", "建筑材料Ⅱ", "住宅开发", "商业地产", "产业地产", "房地产服务"],
    "auto": ["汽车", "乘用车", "商用车", "汽车零部件Ⅱ", "汽车整车Ⅱ", "汽车零部件", "汽车整车", "车身附件及饰件", "底盘与发动机系统", "汽车电子电气系统", "商用载客车", "商用载货车", "轮胎轮毂", "模具"],
    "industrial": ["机械设备", "通用设备", "专用设备", "自动化设备", "工程机械", "机床工具", "机器人", "工业母机", "其他通用设备", "其他专用设备", "其他自动化设备"],
    # 审计后 cyclical = BK0478 有色金属（非更宽的“资源品”）：只放有色口径
    "cyclical": ["有色金属", "工业金属", "稀土", "能源金属", "锂", "钴", "铅锌", "镍", "铜", "铝", "钨", "钼", "其他小金属", "金属新材料", "钛白粉"],
    "precious": ["贵金属"],
    # 审计后 energy = BK0464 石油石化：只放油气石化口径
    "energy": ["石油石化", "石油开采", "油气开采及服务", "油气开采", "石油加工", "油品石化贸易", "油服工程", "燃气", "煤化工"],
    "transport": ["交通运输", "物流", "航运港口", "航空运输Ⅱ", "航空运输", "高速公路", "机场", "港口", "航运", "铁路运输", "港口航运", "机场航运", "公交"],
    "telecom": ["通信", "通信设备", "通信服务", "电信运营商", "通信工程及服务", "通信应用增值服务", "通信线缆及配套", "通信终端及配件", "通信网络设备及器件"],
    "media": ["传媒", "游戏Ⅱ", "影视院线", "文化传媒", "数字媒体", "游戏", "出版", "电视广播", "广告营销", "动漫"],
    "agriculture": ["农林牧渔", "种植业与林业", "养殖业", "农产品加工", "其他种植业", "其他养殖", "水产养殖", "饲料", "农化制品", "肉制品", "种子生产"],
}


def load_xiaoshi(path: str) -> dict[tuple[str, str], list[float]]:
    """(trade_date, finhot_sector) → 成分股当日 return_pct 列表（按股票去重）"""
    t = pq.read_table(
        path,
        columns=["trade_date", "sector_type", "sector_name", "taxonomy_id", "symbol", "return_pct"],
    )
    rows = t.to_pylist()
    names = {r["sector_name"] for r in rows if r.get("sector_type") == "industry" and r.get("taxonomy_id") in ("THS", "xiaoshi-sector-legacy")}
    # 板块 → 实际命中的 THS 行业名（候选按优先级）
    sector_names: dict[str, list[str]] = {}
    for sector, cands in SECTOR_CANDIDATES.items():
        hit = [c for c in cands if c in names]
        if hit:
            sector_names[sector] = hit
    print(f"== 板块→THS 行业 命中 ==")
    for sector in SECTOR_CANDIDATES:
        hit = sector_names.get(sector, [])
        print(f"  {sector:14} <- {','.join(hit) if hit else '(未命中，跳过)'}")

    out: dict[tuple[str, str], list[float]] = defaultdict(list)
    seen: dict[tuple[str, str, str], bool] = {}
    for r in rows:
        if r.get("sector_type") != "industry" or r.get("taxonomy_id") not in ("THS", "xiaoshi-sector-legacy"):
            continue
        d = str(r["trade_date"])[:10]
        name = r.get("sector_name")
        if name is None:
            continue
        for sector, names_hit in sector_names.items():
            if name in names_hit:
                code = str(r.get("symbol") or "")
                key = (d, sector, code)
                if seen.get(key):
                    continue
                seen[key] = True
                rp = r.get("return_pct")
                if rp is not None and isinstance(rp, (int, float)) and rp == rp:  # 非 NaN
                    out[(d, sector)].append(float(rp))
    return out


# market_daily.index_key 存的是东财 indexKey（与 industry/sectors.ts 的 indexKey 一致；
# 若改了 BK 代码要同步这张表）
INDEX_KEY_TO_SECTOR: dict[str, str] = {
    "BK1036": "semicap",
    "BK1207": "ai-app",
    "BK0493": "new-energy",
    "BK0438": "liquor",
    "BK1106": "pharma",
    "BK1204": "military",
    "BK0475": "bank",
    "BK1203": "broker",
    "BK0451": "real-estate",
    "BK1211": "auto",
    "BK1205": "industrial",
    "BK0478": "cyclical",
    "BK0732": "precious",
    "BK0464": "energy",
    "BK1210": "transport",
    "BK1215": "telecom",
    "BK0486": "media",
    "BK0433": "agriculture",
    "sh000300": "a-share",
    "sh000001": "macro",
}


def load_market_daily(path: str) -> dict[tuple[str, str], float]:
    out: dict[tuple[str, str], float] = {}
    with open(path) as f:
        for line in f:
            parts = line.rstrip("\n").split("|")
            if len(parts) != 3 or parts[2] in ("", "NULL"):
                continue
            d, key, pct = parts
            sector = INDEX_KEY_TO_SECTOR.get(key, key)
            out[(d[:10], sector)] = float(pct)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("market_csv")
    ap.add_argument("--parquet", default=None)
    ap.add_argument("--drift-warn", type=float, default=1.5, help="|偏差| 超过该 pp 视为漂移（默认 1.5）")
    args = ap.parse_args()

    parquet = args.parquet
    if not parquet:
        base = os.path.expanduser("~/dsh-workspace/0914/xiaoshi_history")
        files = glob.glob(os.path.join(base, "o", "*", "*.parquet"))
        if not files:
            print(f"找不到成分股 parquet（{base} 下无 .parquet），先跑 xiaoshi-data download", file=sys.stderr)
            return 2
        parquet = max(files, key=os.path.getmtime)
    print(f"== 数据源 ==")
    print(f"  xiaoshi: {parquet}")
    print(f"  market:  {args.market_csv}")

    xs = load_xiaoshi(parquet)
    md = load_market_daily(args.market_csv)
    if not xs:
        print("xiaoshi 侧没有可用收益数据", file=sys.stderr)
        return 2
    if not md:
        print("market_daily 侧没有数据（先回补/同步）", file=sys.stderr)
        return 2

    # 两边都有的 (date, sector) 对
    pairs = sorted({(d, s) for (d, s) in xs} & {(d, s) for (d, s) in md})
    if not pairs:
        print("两边没有重叠的 (交易日, 板块)，无法核对", file=sys.stderr)
        return 2

    print(f"\n== 逐日核对（偏差 = xiaoshi等权 - market_daily，单位 pp）==")
    diffs: list[float] = []
    by_date: dict[str, list[float]] = defaultdict(list)
    dates = sorted({d for d, _ in pairs})
    header = "日期".ljust(12) + "".join(f"{s:>14}" for s in SECTOR_CANDIDATES)
    print(header)
    for d in dates:
        line = d.ljust(12)
        for s in SECTOR_CANDIDATES:
            if (d, s) in pairs:
                xw = statistics.mean(xs[(d, s)])
                dv = xw - md[(d, s)]
                diffs.append(dv)
                by_date[d].append(dv)
                line += f"{dv:>+13.2f} "
            else:
                line += f"{'—':>14}"
        print(line)

    absdiffs = [abs(v) for v in diffs]
    over = sum(1 for v in absdiffs if v > args.drift_warn)
    med = statistics.median(absdiffs)
    print(f"\n== 汇总 ==  对比 {len(diffs)} 组（{len(dates)} 个交易日）")
    print(f"  中位|偏差| = {med:.2f}pp   max|偏差| = {max(absdiffs):.2f}pp")
    print(f"  |偏差|>{args.drift_warn}pp 占比 = {over}/{len(diffs)} = {over / len(diffs) * 100:.0f}%")
    worst = sorted(by_date.items(), key=lambda kv: -max(abs(v) for v in kv[1]))[:3]
    for d, vs in worst:
        print(f"  偏差最大的日期 {d}: {max(abs(v) for v in vs):.2f}pp")

    ok = med < 0.8 and over / len(diffs) < 0.5
    print("== 结论 == " + ("PASS：两边口径量级一致，数据可信" if ok else "WARN：漂移过大，先查 market_daily 源或映射"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
