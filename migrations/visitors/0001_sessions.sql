CREATE TABLE IF NOT EXISTS visitor_sessions (
  id TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  data TEXT NOT NULL,
  ended INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE INDEX IF NOT EXISTS visitor_sessions_recent ON visitor_sessions(last_seen DESC, id DESC);
CREATE INDEX IF NOT EXISTS visitor_sessions_expiry ON visitor_sessions(first_seen);
CREATE TABLE IF NOT EXISTS visitor_geo_usage (month TEXT PRIMARY KEY, used INTEGER NOT NULL) STRICT;
