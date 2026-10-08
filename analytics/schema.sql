-- 访客打点的表。Cloudflare D1（SQLite），部署见 ../analytics/README.md。
--
-- 存什么、怎么存，是数据口径的一部分，别随手加字段：
--   ip         访客明文 IP（站长自用明细，面板需密码，180 天保留期到了连同
--              整行一起删）。ip_hash 仍然存 —— UV 去重靠它，不靠明文 IP。
--   ip_hash    每日轮换盐的 SHA-256 前 16 位，按天算独立访客数。
--   continent / country / region / region_code / city / postal / tz / lat / lon / asn / colo
--              全部来自 Cloudflare 自己的 GeoIP（request.cf，含 IP 推断的
--              国家/省/州/城市/邮编/时区/经纬度/ASN/接入机房），
--              免费、不需要任何第三方 SDK。地址是**推断值**，不是精确位置。
--   ref_host 只留来源**域名**，不留完整 URL —— 完整 referrer 里常有搜索词。
--   device / browser 由 UA 粗分，不存 UA 原文。
--
-- 注意：给已存在的表加列不能靠这份文件（CREATE TABLE IF NOT EXISTS 不改老表），
-- 迁移在 .github/workflows/workers.yml 部署步骤里按 PRAGMA table_info 探测后 ALTER。
CREATE TABLE IF NOT EXISTS visits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,          -- Unix 秒
  day         TEXT    NOT NULL,          -- YYYY-MM-DD（UTC），按它做日聚合
  path        TEXT    NOT NULL,          -- 站内路径（不带查询串）
  host        TEXT,                      -- 访问的域名，防有人拿同一个端点刷别的站
  ip          TEXT,                      -- 明文 IP（保留期内可回查）
  ip_hash     TEXT    NOT NULL,          -- 每日轮换盐哈希，UV 去重口径
  continent   TEXT,                       -- AF/AN/AS/EU/NA/OC/SA
  country     TEXT,                       -- ISO2，如 CN
  region      TEXT,                       -- 省/州名，如 Jiangsu
  region_code TEXT,                       -- 一级行政区代码（Cloudflare 给什么存什么）
  city        TEXT,
  postal      TEXT,                       -- 邮编（推断）
  tz          TEXT,                       -- 时区，如 Asia/Shanghai
  lat         REAL,
  lon         REAL,
  asn         INTEGER,
  colo        TEXT,                       -- Cloudflare 接入机房，如 NRT
  device      TEXT,                       -- desktop / mobile / tablet / bot / other
  browser     TEXT,                       -- chrome / safari / firefox / edge / other
  ref_host    TEXT,
  lang        TEXT
);

CREATE INDEX IF NOT EXISTS idx_visits_day     ON visits(day);
CREATE INDEX IF NOT EXISTS idx_visits_path    ON visits(path);
CREATE INDEX IF NOT EXISTS idx_visits_country ON visits(country);
CREATE INDEX IF NOT EXISTS idx_visits_ts      ON visits(ts);

-- 已过保留期被删掉的明细，在删除前按路径 rollup 进这张表（worker.js 的
-- scheduled 里，与 DELETE 同一个事务）。页脚「本站访问量」和文章页「本文
-- 阅读」是**累计**口径：没有它，180 天保留期一到数字就往回掉。
CREATE TABLE IF NOT EXISTS lifetime_path (
  path TEXT PRIMARY KEY,
  pv   INTEGER NOT NULL DEFAULT 0
);
