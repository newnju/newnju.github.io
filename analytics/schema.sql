-- 访客打点的表。Cloudflare D1（SQLite），部署见 ../analytics/README.md。
--
-- 存什么、不存什么，是隐私设计的一部分，别随手加字段：
--   ip_hash  每日轮换盐的 SHA-256 前 16 位。**不存明文 IP**（默认，见 STORE_RAW_IP），
--           同一个人在两天之间无法被关联起来，但当天仍能算独立访客数。
--   city / region / lat / lon
--           来自 Cloudflare 自己的 GeoIP（request.cf），不是我们自己做的解析，
--           免费且不需要任何第三方 SDK。
--   ref_host 只留来源**域名**，不留完整 URL —— 完整 referrer 里常有搜索词。
--   device / browser 由 UA 粗分，不存 UA 原文。
CREATE TABLE IF NOT EXISTS visits (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       INTEGER NOT NULL,          -- Unix 秒
  day      TEXT    NOT NULL,          -- YYYY-MM-DD（UTC），按它做日聚合
  path     TEXT    NOT NULL,          -- 站内路径（不带查询串）
  host     TEXT,                      -- 访问的域名，防有人拿同一个端点刷别的站
  country  TEXT,
  region   TEXT,
  city     TEXT,
  asn      INTEGER,
  lat      REAL,
  lon      REAL,
  device   TEXT,                      -- desktop / mobile / tablet / bot / other
  browser  TEXT,                      -- chrome / safari / firefox / edge / other
  ref_host TEXT,
  lang     TEXT,
  ip_hash  TEXT    NOT NULL
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
