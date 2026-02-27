import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import AdmZip from "adm-zip";
import axios from "axios";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";

// Database Setup
const db = new Database("database.db");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    role TEXT DEFAULT 'user',
    signature TEXT -- Base64 image
  );

  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    razao_social TEXT,
    nome_fantasia TEXT,
    cnpj TEXT UNIQUE,
    emails TEXT, -- JSON array of strings
    manager_id INTEGER,
    FOREIGN KEY(manager_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    subject TEXT,
    body TEXT
  );

  CREATE TABLE IF NOT EXISTS sending_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    template_id INTEGER,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT,
    error_message TEXT,
    FOREIGN KEY(company_id) REFERENCES companies(id),
    FOREIGN KEY(template_id) REFERENCES templates(id)
  );

  CREATE TABLE IF NOT EXISTS oauth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    access_token TEXT,
    refresh_token TEXT,
    expires_at INTEGER,
    last_auth_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS imported_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT,
    content TEXT, -- Base64
    company_id INTEGER,
    extracted_value TEXT,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id)
  );
`);

// Migration: Ensure new columns exist
try {
  db.exec("ALTER TABLE users ADD COLUMN signature TEXT");
} catch (e) {}
try {
  db.exec("ALTER TABLE companies ADD COLUMN manager_id INTEGER");
} catch (e) {}

try {
  db.exec("ALTER TABLE imported_files ADD COLUMN extracted_value TEXT");
} catch (e) {}

// Migration: Remove foreign key from oauth_tokens if it exists (by recreating table)
try {
  const tableInfo = db.prepare("PRAGMA foreign_key_list(oauth_tokens)").all();
  if (tableInfo.length > 0) {
    console.log("Migrating oauth_tokens to remove foreign key constraint...");
    db.exec(`
      CREATE TABLE oauth_tokens_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        access_token TEXT,
        refresh_token TEXT,
        expires_at INTEGER,
        last_auth_at INTEGER
      );
      INSERT INTO oauth_tokens_new (id, user_id, access_token, refresh_token, expires_at) 
      SELECT id, user_id, access_token, refresh_token, expires_at FROM oauth_tokens;
      DROP TABLE oauth_tokens;
      ALTER TABLE oauth_tokens_new RENAME TO oauth_tokens;
    `);
  }
} catch (e) {
  console.error("Migration error:", e);
}

try {
  db.exec("ALTER TABLE oauth_tokens ADD COLUMN last_auth_at INTEGER");
} catch (e) {}

// Seed/Update Admin User
const hashedPassword = bcrypt.hashSync("solfus123", 10);
const existingAdmin = db.prepare("SELECT * FROM users WHERE email = ?").get("lucas@solfus.com.br") as any;

if (!existingAdmin) {
  db.prepare("INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)")
    .run("lucas@solfus.com.br", hashedPassword, "Lucas Solfus", "admin");
} else {
  db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run("lucas@solfus.com.br");
}

// Also ensure the old admin has the role if it exists, or just leave it
db.prepare("UPDATE users SET role = 'admin' WHERE email = 'admin@example.com'").run();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Auth Middleware
const authenticate = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

const isAdmin = (req: any, res: any, next: any) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: "Acesso negado. Apenas administradores." });
  }
  next();
};

// --- OAuth Helpers ---

async function getValidToken(userId: number) {
  const tokenRecord = db.prepare("SELECT * FROM oauth_tokens WHERE user_id = ?").get(userId) as any;
  if (!tokenRecord) return null;

  // Check if the connection is older than 60 days
  const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
  if (tokenRecord.last_auth_at && Date.now() - tokenRecord.last_auth_at > SIXTY_DAYS_MS) {
    console.log(`[OAuth] Connection expired (60 days limit) for user ${userId}`);
    return null;
  }

  // Check if token is expired (with 5 min buffer)
  if (Date.now() < tokenRecord.expires_at - 300000) {
    return tokenRecord.access_token;
  }

  console.log(`[OAuth] Token expired for user ${userId}. Refreshing...`);

  const dbClientId = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("microsoft_client_id") as any;
  const dbClientSecret = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("microsoft_client_secret") as any;
  const dbTenantId = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("microsoft_tenant_id") as any;
  
  const clientId = dbClientId?.value || process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = dbClientSecret?.value || process.env.MICROSOFT_CLIENT_SECRET;
  const tenantId = dbTenantId?.value || process.env.MICROSOFT_TENANT_ID || "common";

  if (!clientId || !clientSecret || !tokenRecord.refresh_token) {
    console.error("[OAuth] Missing credentials or refresh token");
    return null;
  }

  try {
    const response = await axios.post(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokenRecord.refresh_token,
        grant_type: "refresh_token",
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const expires_at = Date.now() + expires_in * 1000;

    db.prepare("UPDATE oauth_tokens SET access_token = ?, refresh_token = ?, expires_at = ? WHERE user_id = ?")
      .run(access_token, refresh_token || tokenRecord.refresh_token, expires_at, userId);

    return access_token;
  } catch (err: any) {
    console.error("[OAuth] Refresh token error:", err.response?.data || err.message);
    return null;
  }
}

// --- API Routes ---

// Auth
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: "Credenciais inválidas" });
  }
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "24h" });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

// User Management
app.get("/api/users/me", authenticate, (req: any, res) => {
  const user = db.prepare("SELECT id, email, name, role, signature FROM users WHERE id = ?").get(req.user.id);
  res.json(user);
});

app.post("/api/users/signature", authenticate, (req: any, res) => {
  const { signature } = req.body;
  db.prepare("UPDATE users SET signature = ? WHERE id = ?").run(signature, req.user.id);
  res.json({ success: true });
});

app.get("/api/users", authenticate, isAdmin, (req, res) => {
  const users = db.prepare("SELECT id, email, name, role, signature FROM users").all();
  res.json(users);
});

app.post("/api/users", authenticate, isAdmin, (req, res) => {
  const { email, password, name, role, signature } = req.body;
  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db.prepare("INSERT INTO users (email, password, name, role, signature) VALUES (?, ?, ?, ?, ?)")
      .run(email, hashedPassword, name, role || 'user', signature || null);
    res.json({ id: result.lastInsertRowid });
  } catch (err: any) {
    res.status(400).json({ error: "E-mail já cadastrado ou dados inválidos" });
  }
});

app.put("/api/users/:id", authenticate, isAdmin, (req, res) => {
  const { email, name, role, signature } = req.body;
  try {
    db.prepare("UPDATE users SET email = ?, name = ?, role = ?, signature = ? WHERE id = ?")
      .run(email, name, role, signature, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: "Erro ao atualizar usuário" });
  }
});

app.delete("/api/users/:id", authenticate, isAdmin, (req: any, res) => {
  const userIdToDelete = parseInt(req.params.id);
  const currentUserId = req.user.id;
  
  console.log(`[Delete User] Attempting to delete user ${userIdToDelete}. Current user: ${currentUserId}`);

  if (isNaN(userIdToDelete)) {
    return res.status(400).json({ error: "ID de usuário inválido" });
  }

  if (userIdToDelete === currentUserId) {
    console.warn(`[Delete User] User ${currentUserId} tried to delete themselves.`);
    return res.status(400).json({ error: "Você não pode excluir a si mesmo" });
  }

  try {
    const deleteTx = db.transaction(() => {
      // Delete associated tokens first to satisfy foreign key constraints
      console.log(`[Delete User] Deleting tokens for user ${userIdToDelete}`);
      db.prepare("DELETE FROM oauth_tokens WHERE user_id = ?").run(userIdToDelete);
      
      // Then delete the user
      console.log(`[Delete User] Deleting user ${userIdToDelete} from users table`);
      return db.prepare("DELETE FROM users WHERE id = ?").run(userIdToDelete);
    });

    const result = deleteTx();
    console.log(`[Delete User] Result:`, result);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error("[Delete User] Database error:", err);
    res.status(500).json({ error: "Erro ao excluir usuário: " + err.message });
  }
});

// Companies
app.get("/api/companies", authenticate, (req, res) => {
  const companies = db.prepare(`
    SELECT c.*, u.name as manager_name 
    FROM companies c 
    LEFT JOIN users u ON c.manager_id = u.id
  `).all();
  res.json(companies.map((c: any) => ({ ...c, emails: JSON.parse(c.emails || "[]") })));
});

app.post("/api/companies", authenticate, (req, res) => {
  const { razao_social, nome_fantasia, cnpj, emails, manager_id } = req.body;
  try {
    const result = db.prepare("INSERT INTO companies (razao_social, nome_fantasia, cnpj, emails, manager_id) VALUES (?, ?, ?, ?, ?)")
      .run(razao_social, nome_fantasia, cnpj, JSON.stringify(emails), manager_id || null);
    res.json({ id: result.lastInsertRowid });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/companies/:id", authenticate, (req, res) => {
  const { razao_social, nome_fantasia, cnpj, emails, manager_id } = req.body;
  db.prepare("UPDATE companies SET razao_social = ?, nome_fantasia = ?, cnpj = ?, emails = ?, manager_id = ? WHERE id = ?")
    .run(razao_social, nome_fantasia, cnpj, JSON.stringify(emails), manager_id || null, req.params.id);
  res.json({ success: true });
});

app.delete("/api/companies/:id", authenticate, (req, res) => {
  db.prepare("DELETE FROM companies WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// Templates
app.get("/api/templates", authenticate, (req, res) => {
  const templates = db.prepare("SELECT * FROM templates").all();
  res.json(templates);
});

app.post("/api/templates", authenticate, (req, res) => {
  const { name, subject, body } = req.body;
  const result = db.prepare("INSERT INTO templates (name, subject, body) VALUES (?, ?, ?)")
    .run(name, subject, body);
  res.json({ id: result.lastInsertRowid });
});

app.put("/api/templates/:id", authenticate, (req, res) => {
  const { name, subject, body } = req.body;
  db.prepare("UPDATE templates SET name = ?, subject = ?, body = ? WHERE id = ?")
    .run(name, subject, body, req.params.id);
  res.json({ success: true });
});

app.delete("/api/templates/:id", authenticate, (req, res) => {
  db.prepare("DELETE FROM templates WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// Logs
app.get("/api/logs", authenticate, (req, res) => {
  const logs = db.prepare(`
    SELECT l.*, c.razao_social as company_name, t.name as template_name 
    FROM sending_logs l
    JOIN companies c ON l.company_id = c.id
    JOIN templates t ON l.template_id = t.id
    ORDER BY l.sent_at DESC
  `).all();
  res.json(logs);
});

// Stats
app.get("/api/stats", authenticate, (req, res) => {
  const companyCount = db.prepare("SELECT count(*) as count FROM companies").get() as any;
  const sentThisMonth = db.prepare("SELECT count(*) as count FROM sending_logs WHERE strftime('%m', sent_at) = strftime('%m', 'now')").get() as any;
  res.json({
    totalCompanies: companyCount.count,
    sentThisMonth: sentThisMonth.count,
  });
});

// Helper to get consistent Redirect URI
const getRedirectUri = (req: express.Request) => {
  if (process.env.MICROSOFT_REDIRECT_URI) return process.env.MICROSOFT_REDIRECT_URI;
  
  // Try to get from environment first
  let appUrl = process.env.APP_URL;
  
  // Fallback to request headers
  if (!appUrl) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    appUrl = `${protocol}://${host}`;
  }

  // Remove trailing slash if present
  const base = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
  return `${base}/auth/callback`;
};

// App Settings
app.get("/api/settings/microsoft", authenticate, (req, res) => {
  const clientId = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("microsoft_client_id") as any;
  const clientSecret = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("microsoft_client_secret") as any;
  const tenantId = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("microsoft_tenant_id") as any;
  const globalCc = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("global_cc_email") as any;
  
  const redirectUri = getRedirectUri(req);

  res.json({
    clientId: clientId?.value || process.env.MICROSOFT_CLIENT_ID || "",
    clientSecret: clientSecret?.value ? "********" : (process.env.MICROSOFT_CLIENT_SECRET ? "********" : ""),
    tenantId: tenantId?.value || process.env.MICROSOFT_TENANT_ID || "common",
    globalCc: globalCc?.value || "",
    hasSecret: !!(clientSecret?.value || process.env.MICROSOFT_CLIENT_SECRET),
    redirectUri: redirectUri
  });
});

app.post("/api/settings/microsoft", authenticate, isAdmin, (req, res) => {
  const { clientId, clientSecret, tenantId, globalCc } = req.body;
  
  if (clientId !== undefined) {
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)").run("microsoft_client_id", clientId);
  }
  
  if (clientSecret !== undefined && clientSecret !== "********") {
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)").run("microsoft_client_secret", clientSecret);
  }

  if (tenantId !== undefined) {
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)").run("microsoft_tenant_id", tenantId);
  }

  if (globalCc !== undefined) {
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)").run("global_cc_email", globalCc);
  }
  
  res.json({ success: true });
});

// --- Microsoft Graph OAuth ---

app.get("/api/auth/microsoft/url", (req, res) => {
  try {
    const dbClientId = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("microsoft_client_id") as any;
    const dbTenantId = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("microsoft_tenant_id") as any;
    
    const clientId = dbClientId?.value || process.env.MICROSOFT_CLIENT_ID;
    const tenantId = dbTenantId?.value || process.env.MICROSOFT_TENANT_ID || "common";
    
    if (!clientId) {
      return res.status(400).json({ error: "Microsoft Client ID não configurado. Salve-o primeiro." });
    }

    const redirectUri = getRedirectUri(req);
    const scope = encodeURIComponent("offline_access User.Read Mail.Send");
    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=${scope}`;
    
    console.log("[OAuth] Generated URL with tenant:", tenantId);
    res.json({ url });
  } catch (err: any) {
    console.error("[OAuth] Error generating URL:", err);
    res.status(500).json({ error: "Erro interno ao gerar URL de autenticação: " + err.message });
  }
});

app.post("/api/auth/microsoft/callback", authenticate, async (req: any, res) => {
  const { code } = req.body;
  console.log("[OAuth] Callback received with code:", code ? "YES" : "NO");

  if (!code) {
    return res.status(400).json({ error: "Código de autorização ausente" });
  }
  
  const dbClientId = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("microsoft_client_id") as any;
  const dbClientSecret = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("microsoft_client_secret") as any;
  const dbTenantId = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("microsoft_tenant_id") as any;
  
  const clientId = dbClientId?.value || process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = dbClientSecret?.value || process.env.MICROSOFT_CLIENT_SECRET;
  const tenantId = dbTenantId?.value || process.env.MICROSOFT_TENANT_ID || "common";
  
  if (!clientId || !clientSecret) {
    console.error("[OAuth] Missing credentials in DB/Env");
    return res.status(400).json({ error: "Credenciais Microsoft não configuradas" });
  }

  const redirectUri = getRedirectUri(req);
  console.log("[OAuth] Using redirectUri for token exchange:", redirectUri);

  try {
    const tokenResponse = await axios.post(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, 
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
      { 
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 10000 // 10s timeout
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    const expires_at = Date.now() + expires_in * 1000;
    const last_auth_at = Date.now();
    const userId = req.user.id;

    db.prepare("DELETE FROM oauth_tokens WHERE user_id = ?").run(userId);
    db.prepare("INSERT INTO oauth_tokens (user_id, access_token, refresh_token, expires_at, last_auth_at) VALUES (?, ?, ?, ?, ?)")
      .run(userId, access_token, refresh_token, expires_at, last_auth_at);

    console.log(`[OAuth] Token exchange successful for user ${userId}`);
    res.json({ success: true });
  } catch (err: any) {
    const errorData = err.response?.data;
    console.error("[OAuth] Token exchange error:", errorData || err.message);
    res.status(500).json({ 
      error: "Falha na troca de tokens com Microsoft",
      details: errorData?.error_description || err.message
    });
  }
});

app.get("/api/auth/microsoft/status", authenticate, async (req: any, res) => {
  const token = await getValidToken(req.user.id);
  res.json({ connected: !!token });
});

// --- PDF Extraction Helper ---
async function extractValorALiquidar(buffer: Buffer): Promise<string | null> {
  try {
    const data = await pdf(buffer);
    const text = data.text;
    
    // Search for "Valor a Liquidar (R$)" followed by a value
    // The value usually follows on the next line or after some spaces
    // Example: Valor a Liquidar (R$) \n 1.234,56
    const regex = /Valor\s+a\s+Liquidar\s*\(R\$\)\s*([\d.,]+)/i;
    const match = text.match(regex);
    
    if (match && match[1]) {
      return match[1].trim();
    }
    
    // Try another pattern if the first one fails (sometimes it's on the next line)
    const lines = text.split('\n').map(l => l.trim());
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("Valor a Liquidar (R$)")) {
        // Check next few lines for a currency-like string
        for (let j = 1; j <= 3; j++) {
          if (lines[i+j] && /^[\d.,]+$/.test(lines[i+j])) {
            return lines[i+j];
          }
        }
      }
    }
    
    return null;
  } catch (err) {
    console.error("[PDF Extraction] Error:", err);
    return null;
  }
}

// --- File Handling ---

const upload = multer({ storage: multer.memoryStorage() });

app.post("/api/upload/zip", authenticate, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  
  try {
    const zip = new AdmZip(req.file.buffer);
    const entries = zip.getEntries();
    const companies = db.prepare("SELECT * FROM companies").all() as any[];

    const insertFile = db.prepare("INSERT INTO imported_files (file_name, content, company_id, extracted_value) VALUES (?, ?, ?, ?)");

    for (const entry of entries) {
      if (entry.isDirectory || !entry.entryName.toLowerCase().endsWith(".pdf")) continue;
      
      const fileName = entry.entryName;
      const fileNameLower = fileName.toLowerCase();
      
      const matchedCompany = companies.find(c => {
        const cnpjClean = c.cnpj.replace(/\D/g, '');
        const nomeFantasiaLower = c.nome_fantasia.toLowerCase();
        const razaoSocialLower = c.razao_social.toLowerCase();
        
        return (cnpjClean && fileName.includes(cnpjClean)) || 
               (nomeFantasiaLower && fileNameLower.includes(nomeFantasiaLower)) ||
               (razaoSocialLower && fileNameLower.includes(razaoSocialLower));
      });

      const buffer = zip.readFile(entry);
      const content = buffer.toString("base64");
      const extractedValue = await extractValorALiquidar(buffer);
      
      insertFile.run(fileName, content, matchedCompany?.id || null, extractedValue);
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/pdf/extract", authenticate, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  
  try {
    const valor = await extractValorALiquidar(req.file.buffer);
    res.json({ valor });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/imported-files", authenticate, (req, res) => {
  const files = db.prepare(`
    SELECT f.*, c.nome_fantasia as company_name 
    FROM imported_files f 
    LEFT JOIN companies c ON f.company_id = c.id
    ORDER BY f.uploaded_at DESC
  `).all();
  res.json(files);
});

app.delete("/api/imported-files-clear", authenticate, (req, res) => {
  console.log("[Files] Clearing all imported files...");
  try {
    const result = db.prepare("DELETE FROM imported_files").run();
    console.log(`[Files] Deleted ${result.changes} files.`);
    res.json({ success: true, deleted: result.changes });
  } catch (err: any) {
    console.error("[Files] Error clearing files:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/imported-files-batch", authenticate, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "IDs inválidos" });
  }
  try {
    const placeholders = ids.map(() => "?").join(",");
    db.prepare(`DELETE FROM imported_files WHERE id IN (${placeholders})`).run(...ids);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/imported-files/:id", authenticate, (req, res) => {
  db.prepare("DELETE FROM imported_files WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// --- Sending Reports ---

app.post("/api/reports/send", authenticate, async (req: any, res) => {
  const { templateId, items, mesReferencia } = req.body; 
  
  const accessToken = await getValidToken(req.user.id);
  if (!accessToken) return res.status(400).json({ error: "Sua conta Microsoft não está conectada. Conecte-a em seu perfil." });

  const template = db.prepare("SELECT * FROM templates WHERE id = ?").get(templateId) as any;
  if (!template) return res.status(404).json({ error: "Modelo não encontrado" });

  const globalCcRecord = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("global_cc_email") as any;
  const globalCc = globalCcRecord?.value;

  const currentUser = db.prepare("SELECT signature FROM users WHERE id = ?").get(req.user.id) as any;
  const finalSignatureHtml = currentUser?.signature ? `<br><br><img src="${currentUser.signature}" style="max-width: 300px; height: auto;">` : "";
  
  const results = [];

  for (const item of items) {
    try {
      const company = db.prepare("SELECT * FROM companies WHERE id = ?").get(item.companyId) as any;
      if (!company) throw new Error(`Empresa ${item.companyId} não encontrada`);

      const emails = JSON.parse(company.emails || "[]");
      if (emails.length === 0) throw new Error("Nenhum e-mail cadastrado para esta empresa");

      let subject = template.subject;
      let body = template.body + finalSignatureHtml;

      const replacements: any = {
        razao_social: company.razao_social,
        nome_fantasia: company.nome_fantasia,
        cnpj: company.cnpj,
        data_aporte: item.dataAporte || "",
        data_debito: item.dataDebito || "",
        valor: item.valor || "",
        mes_referencia: mesReferencia || "",
      };

      console.log(`[Send Report] Processing company ${company.nome_fantasia}. mesReferencia: "${mesReferencia}"`);

      Object.keys(replacements).forEach(key => {
        // Use a more flexible regex that allows optional spaces inside the tags: {{ tag }} or {{tag}}
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g");
        const prevSubject = subject;
        subject = subject.replace(regex, replacements[key]);
        body = body.replace(regex, replacements[key]);
        
        if (key === 'mes_referencia' && subject !== prevSubject) {
          console.log(`[Send Report] Successfully replaced {{mes_referencia}} in subject for ${company.nome_fantasia}`);
        }
      });

      const message: any = {
        message: {
          subject: subject,
          body: {
            contentType: "HTML",
            content: body,
          },
          toRecipients: emails.map((e: string) => ({ emailAddress: { address: e } })),
        },
      };

      if (globalCc) {
        message.message.ccRecipients = [{ emailAddress: { address: globalCc } }];
      }

      if (item.pdfBase64) {
        // Format: (nome do modelo - nome fantasia - mês/ano ref.)
        const safeTemplateName = template.name.replace(/[/\\?%*:|"<>]/g, '-');
        const safeCompanyName = company.nome_fantasia.replace(/[/\\?%*:|"<>]/g, '-');
        const safeMesRef = (mesReferencia || "").replace(/[/\\?%*:|"<>]/g, '-');
        const attachmentName = `(${safeTemplateName} - ${safeCompanyName} - ${safeMesRef}).pdf`.trim();

        message.message.attachments = [
          {
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: attachmentName,
            contentType: "application/pdf",
            contentBytes: item.pdfBase64,
          },
        ];
      }

      await axios.post("https://graph.microsoft.com/v1.0/me/sendMail", message, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      db.prepare("INSERT INTO sending_logs (company_id, template_id, status) VALUES (?, ?, ?)")
        .run(company.id, templateId, "success");
      
      results.push({ companyId: company.id, status: "success" });
    } catch (err: any) {
      const errorMsg = err.response?.data?.error?.message || err.message;
      console.error(`[Send Report] Error for company ${item.companyId}:`, errorMsg);
      db.prepare("INSERT INTO sending_logs (company_id, template_id, status, error_message) VALUES (?, ?, ?, ?)")
        .run(item.companyId, templateId, "error", errorMsg);
      results.push({ companyId: item.companyId, status: "error", error: errorMsg });
    }
  }

  res.json(results);
});

// Vite Middleware
if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(__dirname, "dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
