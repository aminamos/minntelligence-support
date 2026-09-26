CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  subject TEXT,
  visitor_name TEXT,
  visitor_email TEXT,
  visitor_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conv_visitor ON conversations(visitor_key);
CREATE INDEX IF NOT EXISTS idx_conv_status ON conversations(status, updated_at);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);
