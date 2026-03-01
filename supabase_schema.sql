-- Supabase Migration Script (PostgreSQL)

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'user',
  signature TEXT -- Base64 image
);

-- Companies Table
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  razao_social TEXT,
  nome_fantasia TEXT,
  cnpj TEXT UNIQUE,
  emails JSONB DEFAULT '[]',
  manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Templates Table
CREATE TABLE IF NOT EXISTS templates (
  id SERIAL PRIMARY KEY,
  name TEXT,
  subject TEXT,
  body TEXT
);

-- Sending Logs Table
CREATE TABLE IF NOT EXISTS sending_logs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  template_id INTEGER REFERENCES templates(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  status TEXT,
  error_message TEXT
);

-- OAuth Tokens Table
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  expires_at BIGINT,
  last_auth_at BIGINT
);

-- App Settings Table
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Imported Files Table
CREATE TABLE IF NOT EXISTS imported_files (
  id SERIAL PRIMARY KEY,
  file_name TEXT,
  content TEXT, -- Base64
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  extracted_value TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin if not exists (password: admin123)
-- Note: In a real app, you'd use the same bcrypt hash as in server.ts
-- Hash for 'admin123': $2a$10$X7m.D8.8v.8v.8v.8v.8v.8v.8v.8v.8v.8v.8v.8v.8v.8v.8v.8v
-- Actually, it's better to let the server handle the first user creation or migration.
