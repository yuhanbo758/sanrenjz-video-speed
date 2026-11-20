export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;
export const RULE_PREFIX = "site:";

export function validSpeed(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= MIN_SPEED && value <= MAX_SPEED;
}

export function parseSpeed(value) {
  if (typeof value !== "number" && typeof value !== "string") throw new Error("请输入 0.25～4 之间的倍速");
  const speed = Number(value);
  if (!validSpeed(speed)) throw new Error("请输入 0.25～4 之间的倍速");
  return Math.round(speed * 100) / 100;
}

export function hostFromUrl(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function parseHost(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("请输入站点域名，例如 bilibili.com");
  const input = value.trim();
  const host = hostFromUrl(input.includes("://") ? input : `https://${input}`);
  if (!isRuleHost(host) || /[\s/@?#]/.test(input.replace(/^https?:\/\//i, "").replace(/\/$/, ""))) {
    throw new Error("请填写域名或站点首页地址，不包含视频路径");
  }
  return host;
}

function isRuleHost(host) {
  if (!host || host.length > 253) return false;
  if (host.startsWith("[")) return hostFromUrl(`https://${host}`) === host;
  return host.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

export function readSettings(raw = {}) {
  const rules = Object.create(null);
  for (const [key, speed] of Object.entries(raw)) {
    if (!key.startsWith(RULE_PREFIX) || !validSpeed(speed)) continue;
    const host = key.slice(RULE_PREFIX.length);
    if (isRuleHost(host) && hostFromUrl(`https://${host}`) === host) rules[host] = speed;
  }
  return {
    enabled: raw.enabled !== false,
    globalSpeed: validSpeed(raw.globalSpeed) ? raw.globalSpeed : 1,
    rules,
  };
}

export function resolvePolicy(settings, host) {
  // 按完整域名边界匹配，子域名规则优先；避免把 evilbilibili.com 误认为 B 站。
  const matchedHost = host ? Object.keys(settings.rules)
    .filter((domain) => host === domain || host.endsWith(`.${domain}`))
    .sort((a, b) => b.length - a.length)[0] : undefined;
  return {
    enabled: settings.enabled,
    speed: matchedHost ? settings.rules[matchedHost] : settings.globalSpeed,
    matchedHost: matchedHost ?? null,
  };
}
