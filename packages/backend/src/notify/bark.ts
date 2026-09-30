// Bark 手机推送（https://api.day.app）：一条推送就是一个 GET——标题和正文放 URL 路径段，
// 声音、分组、点击跳转放 query。用 BARK_KEY 配置，没配就什么都不发。
//
// 两个出口：
//   1. 告警——不直接调用，feishu.ts 的 sendAlert 统一发送（和飞书兄弟通道并行）。
//   2. 内容推送——notify.bark-daily 定时任务推每日精选，selected.ts 的入选实时推送。
import { beijingDate } from "@aihot/contracts/time";
import { SITE } from "@aihot/industry/site";
import { config, credential } from "../config.ts";
import { sql } from "../db.ts";

const TITLE_MAX = 40; // 标题上限：通知栏放不下，URL 也会过长
const BODY_DEFAULT_MAX = 400; // 正文默认上限（告警）；日报等长文显式传更大的上限
const TIMEOUT_MS = 10_000;

export interface BarkOptions {
  group?: string; // 通知中心分组，同组折叠
  sound?: string; // alarm/news/glass 等
  url?: string; // 点击通知跳转的链接
  level?: number; // iOS 通知等级：100 = critical（🔴 级告警用，需要用户在系统设置里授权）
  bodyMax?: number; // 正文上限，覆盖默认值（长文场景用）
}

export function barkEnabled(): boolean {
  return Boolean(credential("integrations", "BARK_KEY"));
}

/** 压成一行，按字符数（非 UTF-16 码元）截断，中文一个算一个。 */
export function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  const chars = [...oneLine];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : oneLine;
}

/** 拼出这条推送的 URL。title/body 编进路径，其余进 query。 */
export function barkUrl(key: string, title: string, body: string, opts: BarkOptions = {}): string {
  const query = new URLSearchParams();
  if (opts.group) query.set("group", opts.group);
  if (opts.sound) query.set("sound", opts.sound);
  if (opts.url) query.set("url", opts.url);
  if (opts.level !== undefined) query.set("level", String(opts.level));
  const params = query.toString();
  const path = `https://api.day.app/${encodeURIComponent(key)}/${encodeURIComponent(truncate(title, TITLE_MAX))}/${encodeURIComponent(truncate(body, opts.bodyMax ?? BODY_DEFAULT_MAX))}`;
  return params ? `${path}?${params}` : path;
}

export async function pushBark(title: string, body: string, opts: BarkOptions = {}): Promise<"sent" | "disabled"> {
  const key = credential("integrations", "BARK_KEY");
  if (!key) return "disabled";
  const res = await fetch(barkUrl(key, title, body, opts), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const data = (await res.json()) as { code?: number; message?: string };
  if (data.code !== 200) throw new Error(`Bark 推送失败：${data.code ?? "?"} ${data.message ?? ""}`);
  return "sent";
}

interface DigestItem {
  title?: string;
  sourceName?: string;
  score?: number | null;
}

interface DailyReportContent {
  lead?: { lead?: string } | null;
  sections?: Array<{ items?: DigestItem[] }>;
}

/** 每日精选摘要：08:05 推送，内容就是 08:00 生成的日报本身（单一事实来源，不重新查库）。 */
export async function sendBarkDailyDigest(now = Date.now()): Promise<{ pushed: boolean; items: number }> {
  if (!barkEnabled()) return { pushed: false, items: 0 };
  const date = beijingDate(now); // 今早 08:00 的日报 key 就是今天，覆盖的是昨天全天
  const [row] = await sql<{ content: DailyReportContent | null }[]>`SELECT content FROM reports WHERE kind = 'daily' AND key = ${date}`;
  const content = row?.content;
  const items = (content?.sections ?? []).flatMap((section) => section.items ?? []).slice(0, 10); // 推送一篇就够，页面看全部
  if (!items.length) {
    console.log(JSON.stringify({ level: "info", msg: `Bark 每日摘要未推送：${date} 日报无入选`, at: new Date().toISOString() }));
    return { pushed: false, items: 0 };
  }
  const [, mm, dd] = date.split("-");
  const dateLabel = `${Number(mm)}月${Number(dd)}日`;
  const lines = items.map(
    (item, i) => `${i + 1}. ${item.title ?? "（无标题）"}（${item.sourceName ?? "未知来源"} ${item.score == null ? "—" : `${Math.round(item.score)} 分`}）`,
  );
  const body = [content?.lead?.lead?.trim(), "", ...lines, "", `${config.siteUrl}/daily/${date}`].filter(Boolean).join("\n");
  await pushBark(`${SITE.name} 每日精选 ${dateLabel}`, body, { group: "FinHot", bodyMax: 900 });
  return { pushed: true, items: items.length };
}
