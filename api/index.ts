import express from "express";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import AdmZip from "adm-zip";
import axios from "axios";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
let Database: any;

// Lazy load better-sqlite3 to avoid crashing on Vercel
async function initDatabase() {
  if (process.env.VERCEL) {
    console.log("[Database] Running on Vercel, skipping SQLite initialization.");
    return null;
  }
  try {
    const sqlite = await import("better-sqlite3");
    Database = sqlite.default;
    const dbPath = path.join(process.cwd(), "database.db");
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    return db;
  } catch (e: any) {
    console.warn("[Database] SQLite could not be initialized:", e.message);
    return null;
  }
}
let pdf: any;
try {
  const pdfImport = require("pdf-parse");
  pdf = typeof pdfImport === 'function' ? pdfImport : (pdfImport.default || pdfImport);
  console.log("[PDF] Library loaded successfully. Type:", typeof pdf);
} catch (e: any) {
  console.error("[PDF] Failed to load pdf-parse library:", e.message);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";

// Database Setup
let db: any;
let supabase: any;
let useSupabase = false;

async function initialize() {
  db = await initDatabase();

  // Supabase Setup
  let supabaseUrl = process.env.SUPABASE_URL || "";
  let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

  // Try to load from SQLite if not in env
  if (db && (!supabaseUrl || !supabaseKey)) {
    try {
      const dbUrl = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("supabase_url") as any;
      const dbKey = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("supabase_service_role_key") as any;
      const dbAnonKey = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("supabase_anon_key") as any;
      
      if (dbUrl?.value) supabaseUrl = dbUrl.value;
      if (dbKey?.value) supabaseKey = dbKey.value;
      else if (dbAnonKey?.value) supabaseKey = dbAnonKey.value;
    } catch (e) {}
  }

  if (supabaseUrl && supabaseKey) {
    try {
      supabase = createClient(supabaseUrl, supabaseKey);
      useSupabase = true;
      console.log("Supabase initialized and will be used as primary database.");
    } catch (e) {
      console.error("Failed to initialize Supabase client:", e);
      useSupabase = false;
    }
  } else {
    useSupabase = false;
  }

  if (process.env.VERCEL && !useSupabase) {
    console.warn("⚠️ [Vercel] Running on Vercel without Supabase! SQLite will NOT work on Vercel's ephemeral filesystem.");
  }

  if (useSupabase) {
    console.log("[Database] Supabase connection initialized.");
    // Check if users table is empty and seed admin
    try {
      const { count, error } = await supabase.from('users').select('id', { count: 'exact', head: true });
      if (error) {
        console.error("[Database] Supabase users table check error:", error.message);
      } else {
        console.log(`[Database] Supabase users table has ${count} users.`);
        
        // Ensure admin user exists in Supabase
        const adminEmail = "lucas@solfus.com.br";
        const { data: adminUser } = await supabase.from('users').select('*').eq('email', adminEmail).maybeSingle();
        
        const hashedPassword = bcrypt.hashSync("solfus123", 10);
        
        if (!adminUser) {
          console.log(`[Database] Seeding admin user to Supabase: ${adminEmail}`);
          await supabase.from('users').insert({
            email: adminEmail,
            password: hashedPassword,
            name: "Lucas Solfus",
            role: "admin"
          });
        } else {
          // ALWAYS ensure this user is admin
          if (adminUser.role !== 'admin') {
            console.log(`[Database] Updating user ${adminEmail} to admin role`);
            await supabase.from('users').update({ role: 'admin' }).eq('email', adminEmail);
          }
          
          // Optional: Update password if it's not a valid bcrypt hash (too short)
          if (!adminUser.password || adminUser.password.length < 30) {
            console.log(`[Database] Updating invalid password hash for admin in Supabase`);
            await supabase.from('users').update({ password: hashedPassword }).eq('email', adminEmail);
          }
        }

        if (count === 0 && !adminUser) {
          console.warn("[Database] Supabase users table was EMPTY. Admin user 'lucas@solfus.com.br' has been created with password 'solfus123'.");
        }
      }
    } catch (err: any) {
      console.error("[Database] Supabase initialization error:", err.message);
    }
  } else {
    console.log("[Database] Using local SQLite database.");
  }

  // Initialize Tables
  if (db) {
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

  CREATE TABLE IF NOT EXISTS billing_controls (
    company_id INTEGER,
    month TEXT,
    billing_sent BOOLEAN DEFAULT 0,
    billing_sent_at DATETIME,
    billing_sent_by INTEGER,
    billing_sent_by_name TEXT,
    nf_issued BOOLEAN DEFAULT 0,
    nf_issued_at DATETIME,
    nf_issued_by INTEGER,
    nf_issued_by_name TEXT,
    PRIMARY KEY(company_id, month)
  );

  CREATE TABLE IF NOT EXISTS billing_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    month TEXT,
    user_id INTEGER,
    user_name TEXT,
    action TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    try {
      const existingAdmin = db.prepare("SELECT * FROM users WHERE email = ?").get("lucas@solfus.com.br") as any;

      if (!existingAdmin) {
        db.prepare("INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)")
          .run("lucas@solfus.com.br", hashedPassword, "Lucas Solfus", "admin");
      } else {
        db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run("lucas@solfus.com.br");
      }

      // Also ensure the old admin has the role if it exists, or just leave it
      db.prepare("UPDATE users SET role = 'admin' WHERE email = 'admin@example.com'").run();
    } catch (e) {}
  }
}

const initPromise = initialize();

// Middleware to ensure DB is initialized
app.use(async (req, res, next) => {
  await initPromise;
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Helper to get settings from Supabase or SQLite
async function getSetting(key: string) {
  if (useSupabase) {
    try {
      const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
      if (!error && data) return data.value;
    } catch (e) {
      console.error(`[Settings] Error reading ${key} from Supabase:`, e);
    }
  }
  
  if (db) {
    try {
      const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as any;
      return row?.value;
    } catch (e) {
      console.error(`[Settings] Error reading ${key} from SQLite:`, e);
    }
  }
  
  return null;
}

// Auth Middleware
const authenticate = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];
  
  if (!token || token === "null" || token === "undefined") {
    console.warn("[Auth] No token provided or invalid token string");
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Try Supabase first if enabled
  if (useSupabase) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        // Fetch additional user data from public.users
        const { data: userData } = await supabase
          .from('users')
          .select('id, email, name, role, signature')
          .eq('email', user.email)
          .maybeSingle();
        
        req.user = { 
          id: userData?.id || user.id, 
          email: user.email, 
          role: (user.email === 'lucas@solfus.com.br' || user.email === 'admin@example.com') ? 'admin' : (userData?.role || 'user'),
          name: userData?.name || user.user_metadata?.full_name || "Usuário"
        };
        return next();
      }
      console.log("[Auth] Supabase token verification failed, trying local JWT fallback...");
    } catch (err) {
      console.warn("[Auth] Supabase auth error:", err);
    }
  }

  // Fallback to local JWT (handles transition or local dev)
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (err) {
    console.error("[Auth] All authentication methods failed for token");
    res.status(401).json({ error: "Invalid token" });
  }
};

const isAdmin = (req: any, res: any, next: any) => {
  console.log(`[Auth] Checking admin role for ${req.user?.email}. Current Role: ${req.user?.role}`);
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: "Acesso negado. Apenas administradores." });
  }
  next();
};

// --- OAuth Helpers ---

async function getValidToken(userId: number) {
  let tokenRecord: any = null;

  if (useSupabase) {
    const { data } = await supabase
      .from('oauth_tokens')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    tokenRecord = data;
  } else if (db) {
    tokenRecord = db.prepare("SELECT * FROM oauth_tokens WHERE user_id = ?").get(userId) as any;
  }

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

  const clientId = await getSetting("microsoft_client_id");
  const clientSecret = await getSetting("microsoft_client_secret");
  const tenantId = await getSetting("microsoft_tenant_id") || "common";

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

    if (useSupabase) {
      await supabase
        .from('oauth_tokens')
        .update({ 
          access_token, 
          refresh_token: refresh_token || tokenRecord.refresh_token, 
          expires_at 
        })
        .eq('user_id', userId);
    } else {
      db.prepare("UPDATE oauth_tokens SET access_token = ?, refresh_token = ?, expires_at = ? WHERE user_id = ?")
        .run(access_token, refresh_token || tokenRecord.refresh_token, expires_at, userId);
    }

    return access_token;
  } catch (err: any) {
    console.error("[OAuth] Refresh token error:", err.response?.data || err.message);
    return null;
  }
}

// --- API Routes ---

// Auth
app.post("/api/auth/login", async (req, res) => {
  const { email: rawEmail, password } = req.body;
  const email = rawEmail?.trim();
  
  if (useSupabase) {
    console.log(`[Auth] Attempting Supabase Auth login for: "${email}"`);
    try {
      // Authenticate using Supabase Auth service
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("[Supabase Auth] Login Error:", error.message);
        return res.status(401).json({ error: "Credenciais inválidas no Supabase Auth" });
      }

      // Get additional metadata from public.users table
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      const userResponse = {
        id: userData?.id || data.user.id,
        email: data.user.email,
        name: userData?.name || data.user.user_metadata?.full_name || "Usuário",
        role: (email === 'lucas@solfus.com.br' || email === 'admin@example.com') ? 'admin' : (userData?.role || 'user')
      };

      console.log(`[Auth] Supabase Auth login successful for: ${email}`);
      res.json({ 
        token: data.session?.access_token, 
        user: userResponse 
      });
    } catch (err: any) {
      console.error("[Supabase Auth] Exception:", err.message);
      res.status(500).json({ error: "Erro interno na autenticação" });
    }
  } else {
    console.log(`[Auth] Attempting SQLite login for: ${email}`);
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
    
    if (!user || !bcrypt.compareSync(password, user.password)) {
      console.log(`[Auth] Login failed for ${email}. User found: ${!!user}`);
      return res.status(401).json({ error: "Credenciais inválidas" });
    }
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "24h" });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  }
});

// User Management
app.get("/api/users/me", authenticate, async (req: any, res) => {
  let user: any = null;
  if (useSupabase) {
    const { data } = await supabase.from('users').select('id, email, name, role, signature').eq('id', req.user.id).maybeSingle();
    user = data;
  } else {
    user = db.prepare("SELECT id, email, name, role, signature FROM users WHERE id = ?").get(req.user.id);
  }
  
  if (user && (user.email === 'lucas@solfus.com.br' || user.email === 'admin@example.com')) {
    user.role = 'admin';
  }
  
  res.json(user);
});

app.put("/api/users/me", authenticate, async (req: any, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Nome é obrigatório" });

  if (useSupabase) {
    const { error } = await supabase.from('users').update({ name }).eq('id', req.user.id);
    if (error) return res.status(500).json({ error: error.message });
  } else {
    db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, req.user.id);
  }
  res.json({ success: true });
});

app.post("/api/users/signature", authenticate, async (req: any, res) => {
  const { signature } = req.body;
  if (useSupabase) {
    await supabase.from('users').update({ signature }).eq('id', req.user.id);
  } else {
    db.prepare("UPDATE users SET signature = ? WHERE id = ?").run(signature, req.user.id);
  }
  res.json({ success: true });
});

app.get("/api/users", authenticate, isAdmin, async (req, res) => {
  let users: any[] = [];
  if (useSupabase) {
    const { data } = await supabase.from('users').select('id, email, name, role, signature');
    users = data || [];
  } else {
    users = db.prepare("SELECT id, email, name, role, signature FROM users").all();
  }
  res.json(users);
});

app.post("/api/users", authenticate, isAdmin, async (req, res) => {
  const { email, password, name, role, signature } = req.body;
  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    if (useSupabase) {
      const { data, error } = await supabase.from('users').insert({
        email,
        password: hashedPassword,
        name,
        role: role || 'user',
        signature: signature || null
      }).select().single();
      if (error) throw error;
      res.json({ id: data.id });
    } else {
      const result = db.prepare("INSERT INTO users (email, password, name, role, signature) VALUES (?, ?, ?, ?, ?)")
        .run(email, hashedPassword, name, role || 'user', signature || null);
      res.json({ id: result.lastInsertRowid });
    }
  } catch (err: any) {
    res.status(400).json({ error: "E-mail já cadastrado ou dados inválidos" });
  }
});

app.put("/api/users/:id", authenticate, isAdmin, async (req, res) => {
  const { email, name, role, signature } = req.body;
  try {
    if (useSupabase) {
      const { error } = await supabase
        .from('users')
        .update({ email, name, role, signature })
        .eq('id', req.params.id);
      if (error) throw error;
    } else {
      db.prepare("UPDATE users SET email = ?, name = ?, role = ?, signature = ? WHERE id = ?")
        .run(email, name, role, signature, req.params.id);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: "Erro ao atualizar usuário" });
  }
});

app.delete("/api/users/:id", authenticate, isAdmin, async (req: any, res) => {
  const userIdToDelete = parseInt(req.params.id);
  const currentUserId = req.user.id;
  
  if (isNaN(userIdToDelete)) {
    return res.status(400).json({ error: "ID de usuário inválido" });
  }

  if (userIdToDelete === currentUserId) {
    return res.status(400).json({ error: "Você não pode excluir a si mesmo" });
  }

  try {
    if (useSupabase) {
      // Delete associated tokens first
      await supabase.from('oauth_tokens').delete().eq('user_id', userIdToDelete);
      // Then delete the user
      const { error } = await supabase.from('users').delete().eq('id', userIdToDelete);
      if (error) throw error;
    } else {
      const deleteTx = db.transaction(() => {
        db.prepare("DELETE FROM oauth_tokens WHERE user_id = ?").run(userIdToDelete);
        return db.prepare("DELETE FROM users WHERE id = ?").run(userIdToDelete);
      });
      deleteTx();
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao excluir usuário: " + err.message });
  }
});

// Companies
app.get("/api/companies", authenticate, async (req, res) => {
  let companies: any[] = [];
  if (useSupabase) {
    const { data } = await supabase
      .from('companies')
      .select('*, manager:users(name)');
    companies = (data || []).map((c: any) => ({
      ...c,
      manager_name: c.manager?.name,
      emails: c.emails || []
    }));
  } else {
    const rows = db.prepare(`
      SELECT c.*, u.name as manager_name 
      FROM companies c 
      LEFT JOIN users u ON c.manager_id = u.id
    `).all();
    companies = rows.map((c: any) => ({ ...c, emails: JSON.parse(c.emails || "[]") }));
  }
  res.json(companies);
});

app.post("/api/companies", authenticate, async (req, res) => {
  const { razao_social, nome_fantasia, cnpj, emails, manager_id } = req.body;
  try {
    if (useSupabase) {
      const { data, error } = await supabase.from('companies').insert({
        razao_social,
        nome_fantasia,
        cnpj,
        emails: emails || [],
        manager_id: manager_id || null
      }).select().single();
      if (error) throw error;
      res.json({ id: data.id });
    } else {
      const result = db.prepare("INSERT INTO companies (razao_social, nome_fantasia, cnpj, emails, manager_id) VALUES (?, ?, ?, ?, ?)")
        .run(razao_social, nome_fantasia, cnpj, JSON.stringify(emails), manager_id || null);
      res.json({ id: result.lastInsertRowid });
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/companies/:id", authenticate, async (req, res) => {
  const { razao_social, nome_fantasia, cnpj, emails, manager_id } = req.body;
  try {
    if (useSupabase) {
      const { error } = await supabase
        .from('companies')
        .update({
          razao_social,
          nome_fantasia,
          cnpj,
          emails: emails || [],
          manager_id: manager_id || null
        })
        .eq('id', req.params.id);
      if (error) throw error;
    } else {
      db.prepare("UPDATE companies SET razao_social = ?, nome_fantasia = ?, cnpj = ?, emails = ?, manager_id = ? WHERE id = ?")
        .run(razao_social, nome_fantasia, cnpj, JSON.stringify(emails), manager_id || null, req.params.id);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/companies/:id", authenticate, async (req, res) => {
  try {
    if (useSupabase) {
      const { error } = await supabase.from('companies').delete().eq('id', req.params.id);
      if (error) throw error;
    } else {
      db.prepare("DELETE FROM companies WHERE id = ?").run(req.params.id);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Templates
app.get("/api/templates", authenticate, async (req, res) => {
  let templates: any[] = [];
  if (useSupabase) {
    const { data } = await supabase.from('templates').select('*');
    templates = data || [];
  } else {
    templates = db.prepare("SELECT * FROM templates").all();
  }
  res.json(templates);
});

app.post("/api/templates", authenticate, async (req, res) => {
  const { name, subject, body } = req.body;
  if (useSupabase) {
    const { data } = await supabase.from('templates').insert({ name, subject, body }).select().single();
    res.json({ id: data.id });
  } else {
    const result = db.prepare("INSERT INTO templates (name, subject, body) VALUES (?, ?, ?)")
      .run(name, subject, body);
    res.json({ id: result.lastInsertRowid });
  }
});

app.put("/api/templates/:id", authenticate, async (req, res) => {
  const { name, subject, body } = req.body;
  try {
    if (useSupabase) {
      const { error } = await supabase
        .from('templates')
        .update({ name, subject, body })
        .eq('id', req.params.id);
      if (error) throw error;
    } else {
      db.prepare("UPDATE templates SET name = ?, subject = ?, body = ? WHERE id = ?")
        .run(name, subject, body, req.params.id);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/templates/:id", authenticate, async (req, res) => {
  try {
    if (useSupabase) {
      const { error } = await supabase.from('templates').delete().eq('id', req.params.id);
      if (error) throw error;
    } else {
      db.prepare("DELETE FROM templates WHERE id = ?").run(req.params.id);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Billing Control ---

app.get("/api/billing-control", authenticate, async (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: "Mês é obrigatório" });

  try {
    let controls: any[] = [];
    if (useSupabase) {
      const { data } = await supabase
        .from('billing_controls')
        .select('*, company:companies(nome_fantasia), sent_by:users!billing_sent_by(name), issued_by:users!nf_issued_by(name)')
        .eq('month', month);
      
      const { data: companies } = await supabase.from('companies').select('id, nome_fantasia');
      
      controls = (companies || []).map(c => {
        const control = (data || []).find(d => d.company_id === c.id);
        return {
          company_id: c.id,
          company_name: c.nome_fantasia,
          month,
          billing_sent: control?.billing_sent || false,
          billing_sent_at: control?.billing_sent_at,
          billing_sent_by_name: control?.sent_by?.name,
          nf_issued: control?.nf_issued || false,
          nf_issued_at: control?.nf_issued_at,
          nf_issued_by_name: control?.issued_by?.name,
        };
      });
    } else if (db) {
      const companies = db.prepare("SELECT id, nome_fantasia FROM companies").all();
      controls = companies.map((c: any) => {
        const control = db.prepare(`
          SELECT bc.*, u1.name as billing_sent_by_name, u2.name as nf_issued_by_name
          FROM billing_controls bc
          LEFT JOIN users u1 ON bc.billing_sent_by = u1.id
          LEFT JOIN users u2 ON bc.nf_issued_by = u2.id
          WHERE bc.company_id = ? AND bc.month = ?
        `).get(c.id, month) as any;

        return {
          company_id: c.id,
          company_name: c.nome_fantasia,
          month,
          billing_sent: !!control?.billing_sent,
          billing_sent_at: control?.billing_sent_at,
          billing_sent_by_name: control?.billing_sent_by_name,
          nf_issued: !!control?.nf_issued,
          nf_issued_at: control?.nf_issued_at,
          nf_issued_by_name: control?.nf_issued_by_name,
        };
      });
    }
    res.json(controls);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/billing-control/toggle", authenticate, async (req: any, res) => {
  const { company_id, month, field } = req.body;
  if (!company_id || !month || !field) return res.status(400).json({ error: "Dados incompletos" });
  if (field !== 'billing_sent' && field !== 'nf_issued') return res.status(400).json({ error: "Campo inválido" });

  const userId = req.user.id;
  const now = new Date().toISOString();

  try {
    if (useSupabase) {
      // Get current state
      const { data: current } = await supabase
        .from('billing_controls')
        .select('*')
        .eq('company_id', company_id)
        .eq('month', month)
        .maybeSingle();

      const newValue = !current?.[field];
      const updates: any = {
        company_id,
        month,
        [field]: newValue,
        [`${field}_at`]: newValue ? now : null,
        [`${field}_by`]: newValue ? userId : null
      };

      const { error } = await supabase.from('billing_controls').upsert(updates);
      if (error) throw error;

      // History
      if (newValue) {
        const action = field === 'billing_sent' ? 'Faturamento Enviado' : 'NF Emitida';
        await supabase.from('billing_history').insert({
          company_id,
          month,
          action,
          user_id: userId
        });
      }
    } else if (db) {
      const current = db.prepare("SELECT * FROM billing_controls WHERE company_id = ? AND month = ?").get(company_id, month) as any;
      const newValue = current ? (current[field] ? 0 : 1) : 1;
      
      const atField = `${field}_at`;
      const byField = `${field}_by`;

      db.prepare(`
        INSERT INTO billing_controls (company_id, month, ${field}, ${atField}, ${byField})
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(company_id, month) DO UPDATE SET
          ${field} = excluded.${field},
          ${atField} = excluded.${atField},
          ${byField} = excluded.${byField}
      `).run(company_id, month, newValue, newValue ? now : null, newValue ? userId : null);

      if (newValue) {
        const action = field === 'billing_sent' ? 'Faturamento Enviado' : 'NF Emitida';
        db.prepare("INSERT INTO billing_history (company_id, month, action, user_id) VALUES (?, ?, ?, ?)").run(company_id, month, action, userId);
      }
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/billing-control/history", authenticate, async (req, res) => {
  const { company_id, month } = req.query;
  try {
    let history: any[] = [];
    if (useSupabase) {
      const { data } = await supabase
        .from('billing_history')
        .select('*, user:users(name), company:companies(nome_fantasia)')
        .eq('company_id', company_id)
        .eq('month', month)
        .order('created_at', { ascending: false });
      
      history = (data || []).map(h => ({
        ...h,
        user_name: h.user?.name,
        company_name: h.company?.nome_fantasia
      }));
    } else if (db) {
      history = db.prepare(`
        SELECT bh.*, u.name as user_name, c.nome_fantasia as company_name
        FROM billing_history bh
        JOIN users u ON bh.user_id = u.id
        JOIN companies c ON bh.company_id = c.id
        WHERE bh.company_id = ? AND bh.month = ?
        ORDER BY bh.created_at DESC
      `).all(company_id, month);
    }
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Logs
app.get("/api/logs", authenticate, async (req, res) => {
  try {
    let logs = [];
    if (useSupabase) {
      const { data } = await supabase
        .from('sending_logs')
        .select(`
          *,
          companies (razao_social),
          templates (name)
        `)
        .order('sent_at', { ascending: false });
      
      logs = (data || []).map(l => ({
        ...l,
        company_name: l.companies?.razao_social,
        template_name: l.templates?.name
      }));
    } else if (db) {
      logs = db.prepare(`
        SELECT l.*, c.razao_social as company_name, t.name as template_name 
        FROM sending_logs l
        JOIN companies c ON l.company_id = c.id
        JOIN templates t ON l.template_id = t.id
        ORDER BY l.sent_at DESC
      `).all();
    }
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar logs" });
  }
});

// Stats
app.get("/api/stats", authenticate, async (req, res) => {
  try {
    let totalCompanies = 0;
    let sentThisMonth = 0;

    if (useSupabase) {
      const { count: cCount } = await supabase.from('companies').select('id', { count: 'exact', head: true });
      totalCompanies = cCount || 0;
      
      const firstDayOfMonth = new Date();
      firstDayOfMonth.setDate(1);
      firstDayOfMonth.setHours(0, 0, 0, 0);
      
      const { count: sCount } = await supabase
        .from('sending_logs')
        .select('id', { count: 'exact', head: true })
        .gte('sent_at', firstDayOfMonth.toISOString());
      sentThisMonth = sCount || 0;
    } else if (db) {
      const companyCount = db.prepare("SELECT count(*) as count FROM companies").get() as any;
      const sentThisMonthRow = db.prepare("SELECT count(*) as count FROM sending_logs WHERE strftime('%m', sent_at) = strftime('%m', 'now')").get() as any;
      totalCompanies = companyCount.count;
      sentThisMonth = sentThisMonthRow.count;
    }

    res.json({
      totalCompanies,
      sentThisMonth,
    });
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar estatísticas" });
  }
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
app.get("/api/settings/microsoft", authenticate, async (req, res) => {
  const clientId = await getSetting("microsoft_client_id");
  const clientSecret = await getSetting("microsoft_client_secret");
  const tenantId = await getSetting("microsoft_tenant_id");
  const globalCc = await getSetting("global_cc_email");
  const supabaseUrl = await getSetting("supabase_url");
  const supabaseAnonKey = await getSetting("supabase_anon_key");
  const supabaseServiceRoleKey = await getSetting("supabase_service_role_key");
  
  const redirectUri = getRedirectUri(req);

  res.json({
    clientId: clientId || process.env.MICROSOFT_CLIENT_ID || "",
    clientSecret: clientSecret ? "********" : (process.env.MICROSOFT_CLIENT_SECRET ? "********" : ""),
    tenantId: tenantId || process.env.MICROSOFT_TENANT_ID || "common",
    globalCc: globalCc || "",
    supabaseUrl: supabaseUrl || process.env.SUPABASE_URL || "",
    supabaseAnonKey: supabaseAnonKey || process.env.SUPABASE_ANON_KEY || "",
    supabaseServiceRoleKey: supabaseServiceRoleKey ? "********" : (process.env.SUPABASE_SERVICE_ROLE_KEY ? "********" : ""),
    hasSecret: !!(clientSecret || process.env.MICROSOFT_CLIENT_SECRET),
    redirectUri: redirectUri
  });
});

app.post("/api/settings/microsoft", authenticate, isAdmin, async (req, res) => {
  const { clientId, clientSecret, tenantId, globalCc, supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey } = req.body;
  console.log(`[Settings] Updating settings. TenantId: ${tenantId}`);
  
  const updates = [];

  if (clientId !== undefined) {
    if (db) db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)").run("microsoft_client_id", clientId);
    if (useSupabase) updates.push({ key: "microsoft_client_id", value: clientId });
  }
  
  if (clientSecret !== undefined && clientSecret !== "********") {
    if (db) db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)").run("microsoft_client_secret", clientSecret);
    if (useSupabase) updates.push({ key: "microsoft_client_secret", value: clientSecret });
  }

  if (tenantId !== undefined) {
    console.log(`[Settings] Saving Tenant ID: ${tenantId}`);
    if (db) db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)").run("microsoft_tenant_id", tenantId);
    if (useSupabase) updates.push({ key: "microsoft_tenant_id", value: tenantId });
  }

  if (globalCc !== undefined) {
    if (db) db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)").run("global_cc_email", globalCc);
    if (useSupabase) updates.push({ key: "global_cc_email", value: globalCc });
  }

  if (supabaseUrl !== undefined) {
    if (db) db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)").run("supabase_url", supabaseUrl);
    if (useSupabase) updates.push({ key: "supabase_url", value: supabaseUrl });
  }

  if (supabaseAnonKey !== undefined) {
    if (db) db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)").run("supabase_anon_key", supabaseAnonKey);
    if (useSupabase) updates.push({ key: "supabase_anon_key", value: supabaseAnonKey });
  }

  if (supabaseServiceRoleKey !== undefined && supabaseServiceRoleKey !== "********") {
    if (db) db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)").run("supabase_service_role_key", supabaseServiceRoleKey);
    if (useSupabase) updates.push({ key: "supabase_service_role_key", value: supabaseServiceRoleKey });
  }

  if (useSupabase && updates.length > 0) {
    try {
      await supabase.from('app_settings').upsert(updates);
    } catch (e) {
      console.error("[Settings] Error mirroring to Supabase:", e);
    }
  }
  
  res.json({ success: true });
});

// --- Microsoft Graph OAuth ---

app.get("/api/auth/microsoft/url", async (req, res) => {
  try {
    const clientId = await getSetting("microsoft_client_id");
    const tenantId = await getSetting("microsoft_tenant_id") || "common";
    
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

const usedCodes = new Set<string>();

app.post("/api/auth/microsoft/callback", authenticate, async (req: any, res) => {
  const { code } = req.body;
  console.log("[OAuth] Callback received with code:", code ? code.substring(0, 10) + "..." : "NO");

  if (!code) {
    return res.status(400).json({ error: "Código de autorização ausente" });
  }

  if (usedCodes.has(code)) {
    console.warn("[OAuth] Code already being processed or redeemed:", code.substring(0, 10) + "...");
    return res.status(400).json({ error: "Este código já foi utilizado ou está em processamento." });
  }
  
  usedCodes.add(code);
  // Clean up code after 1 minute to prevent memory leak
  setTimeout(() => usedCodes.delete(code), 60000);
  
  const clientId = await getSetting("microsoft_client_id");
  const clientSecret = await getSetting("microsoft_client_secret");
  const tenantId = await getSetting("microsoft_tenant_id") || "common";
  
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

    if (useSupabase) {
      await supabase.from('oauth_tokens').delete().eq('user_id', userId);
      await supabase.from('oauth_tokens').insert({
        user_id: userId,
        access_token,
        refresh_token,
        expires_at,
        last_auth_at
      });
    } else if (db) {
      await supabase.from('oauth_tokens').delete().eq('user_id', userId);
      await supabase.from('oauth_tokens').insert({
        user_id: userId,
        access_token,
        refresh_token,
        expires_at,
        last_auth_at
      });
    } else if (db) {
      db.prepare("DELETE FROM oauth_tokens WHERE user_id = ?").run(userId);
      db.prepare("INSERT INTO oauth_tokens (user_id, access_token, refresh_token, expires_at, last_auth_at) VALUES (?, ?, ?, ?, ?)")
        .run(userId, access_token, refresh_token, expires_at, last_auth_at);
    }

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
  try {
    const token = await getValidToken(req.user.id);
    console.log(`[OAuth Status] User ${req.user.id} connected: ${!!token}`);
    res.json({ connected: !!token });
  } catch (err: any) {
    console.error(`[OAuth Status] Error checking status for user ${req.user.id}:`, err.message);
    res.json({ connected: false, error: err.message });
  }
});

app.post("/api/auth/microsoft/test-email", authenticate, async (req: any, res) => {
  const accessToken = await getValidToken(req.user.id);
  if (!accessToken) return res.status(400).json({ error: "Não conectado" });

  try {
    const message = {
      message: {
        subject: "Teste de Conexão RelEasy",
        body: {
          contentType: "Text",
          content: "Sua conexão com o Microsoft Graph está funcionando corretamente!",
        },
        toRecipients: [{ emailAddress: { address: req.user.email } }],
      },
    };

    await axios.post("https://graph.microsoft.com/v1.0/me/sendMail", message, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    res.json({ success: true });
  } catch (err: any) {
    const errorMsg = err.response?.data?.error?.message || err.message;
    console.error("[OAuth Test] Error sending test email:", errorMsg);
    res.status(500).json({ error: errorMsg });
  }
});

// --- PDF Extraction Helper ---
async function extractValorALiquidar(buffer: Buffer): Promise<string | null> {
  try {
    if (typeof pdf !== 'function') {
      console.error("[PDF Extraction] Error: 'pdf' is not a function. Type is:", typeof pdf);
      return null;
    }
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
    let companies: any[] = [];
    
    if (useSupabase) {
      const { data } = await supabase.from('companies').select('*');
      companies = data || [];
    } else {
      companies = db.prepare("SELECT * FROM companies").all() as any[];
    }

    for (const entry of entries) {
      if (entry.isDirectory || !entry.entryName.toLowerCase().endsWith(".pdf")) continue;
      
      const fileName = entry.entryName;
      const fileNameLower = fileName.toLowerCase();
      
      const matchedCompany = companies.find(c => {
        const cnpjClean = (c.cnpj || '').replace(/\D/g, '');
        const nomeFantasiaLower = (c.nome_fantasia || '').toLowerCase();
        const razaoSocialLower = (c.razao_social || '').toLowerCase();
        
        return (cnpjClean && fileName.includes(cnpjClean)) || 
               (nomeFantasiaLower && fileNameLower.includes(nomeFantasiaLower)) ||
               (razaoSocialLower && fileNameLower.includes(razaoSocialLower));
      });

      const buffer = zip.readFile(entry);
      if (!buffer) continue;
      const content = buffer.toString("base64");
      const extractedValue = await extractValorALiquidar(buffer);
      
      if (useSupabase) {
        await supabase.from('imported_files').insert({
          file_name: fileName,
          content,
          company_id: matchedCompany?.id || null,
          extracted_value: extractedValue
        });
      } else {
        db.prepare("INSERT INTO imported_files (file_name, content, company_id, extracted_value) VALUES (?, ?, ?, ?)")
          .run(fileName, content, matchedCompany?.id || null, extractedValue);
      }
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

app.get("/api/imported-files", authenticate, async (req, res) => {
  let files: any[] = [];
  if (useSupabase) {
    const { data } = await supabase
      .from('imported_files')
      .select('*, company:companies(nome_fantasia)');
    files = (data || []).map((f: any) => ({
      ...f,
      company_name: f.company?.nome_fantasia
    }));
  } else {
    files = db.prepare(`
      SELECT f.*, c.nome_fantasia as company_name 
      FROM imported_files f 
      LEFT JOIN companies c ON f.company_id = c.id
      ORDER BY f.uploaded_at DESC
    `).all();
  }
  res.json(files);
});

app.delete("/api/imported-files-clear", authenticate, async (req, res) => {
  console.log("[Files] Clearing all imported files...");
  try {
    if (useSupabase) {
      const { error, count } = await supabase.from('imported_files').delete().neq('id', 0);
      res.json({ success: true, deleted: count });
    } else {
      const result = db.prepare("DELETE FROM imported_files").run();
      console.log(`[Files] Deleted ${result.changes} files.`);
      res.json({ success: true, deleted: result.changes });
    }
  } catch (err: any) {
    console.error("[Files] Error clearing files:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/imported-files-batch-delete", authenticate, async (req, res) => {
  const { ids } = req.body;
  console.log(`[Files] Batch delete requested for IDs:`, ids);
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "IDs inválidos" });
  }
  try {
    if (useSupabase) {
      const { error } = await supabase.from('imported_files').delete().in('id', ids);
      if (error) throw error;
      res.json({ success: true });
    } else {
      const placeholders = ids.map(() => "?").join(",");
      const result = db.prepare(`DELETE FROM imported_files WHERE id IN (${placeholders})`).run(...ids);
      console.log(`[Files] Batch delete successful. Deleted ${result.changes} rows.`);
      res.json({ success: true, deleted: result.changes });
    }
  } catch (err: any) {
    console.error(`[Files] Batch delete error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/imported-files/:id", authenticate, async (req, res) => {
  if (useSupabase) {
    await supabase.from('imported_files').delete().eq('id', req.params.id);
  } else {
    db.prepare("DELETE FROM imported_files WHERE id = ?").run(req.params.id);
  }
  res.json({ success: true });
});

// --- Sending Reports ---

app.post("/api/reports/send", authenticate, async (req: any, res) => {
  const { templateId, items, mesReferencia } = req.body; 
  
  const accessToken = await getValidToken(req.user.id);
  if (!accessToken) return res.status(400).json({ error: "Sua conta Microsoft não está conectada. Conecte-a em seu perfil." });

  let template: any = null;
  let globalCc: string | null = null;
  let currentUser: any = null;

  if (useSupabase) {
    const { data: t } = await supabase.from('templates').select('*').eq('id', templateId).single();
    template = t;
    const { data: s } = await supabase.from('app_settings').select('value').eq('key', 'global_cc_email').single();
    globalCc = s?.value;
    const { data: u } = await supabase.from('users').select('signature').eq('id', req.user.id).single();
    currentUser = u;
  } else {
    template = db.prepare("SELECT * FROM templates WHERE id = ?").get(templateId) as any;
    const globalCcRecord = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("global_cc_email") as any;
    globalCc = globalCcRecord?.value;
    currentUser = db.prepare("SELECT signature FROM users WHERE id = ?").get(req.user.id) as any;
  }

  if (!template) return res.status(404).json({ error: "Modelo não encontrado" });

  const finalSignatureHtml = currentUser?.signature ? `<br><br><img src="${currentUser.signature}" style="max-width: 300px; height: auto;">` : "";
  
  const results = [];

  for (const item of items) {
    try {
      let company: any = null;
      if (useSupabase) {
        const { data } = await supabase.from('companies').select('*').eq('id', item.companyId).single();
        company = data;
      } else {
        company = db.prepare("SELECT * FROM companies WHERE id = ?").get(item.companyId) as any;
      }

      if (!company) throw new Error(`Empresa ${item.companyId} não encontrada`);

      const emails = useSupabase ? (company.emails || []) : JSON.parse(company.emails || "[]");
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

      if (useSupabase) {
        await supabase.from('sending_logs').insert({
          company_id: company.id,
          template_id: templateId,
          status: "success"
        });
      } else {
        db.prepare("INSERT INTO sending_logs (company_id, template_id, status) VALUES (?, ?, ?)")
          .run(company.id, templateId, "success");
      }
      
      results.push({ companyId: company.id, status: "success" });
    } catch (err: any) {
      const errorMsg = err.response?.data?.error?.message || err.message;
      console.error(`[Send Report] Error for company ${item.companyId}:`, errorMsg);
      
      if (useSupabase) {
        await supabase.from('sending_logs').insert({
          company_id: item.companyId,
          template_id: templateId,
          status: "error",
          error_message: errorMsg
        });
      } else {
        db.prepare("INSERT INTO sending_logs (company_id, template_id, status, error_message) VALUES (?, ?, ?, ?)")
          .run(item.companyId, templateId, "error", errorMsg);
      }
      results.push({ companyId: item.companyId, status: "error", error: errorMsg });
    }
  }

  res.json(results);
});

// Vite Middleware
async function setupVite() {
  if (process.env.VERCEL) {
    console.log("[Vite] Running on Vercel, static files handled by vercel.json rewrites.");
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e: any) {
      console.warn("[Vite] Failed to load Vite middleware:", e.message);
    }
  } else {
    const distPath = path.join(process.cwd(), "dist");
    const fallbackPath = path.join(__dirname, "..", "dist");
    const finalPath = fs.existsSync(distPath) ? distPath : fallbackPath;
    
    console.log(`[Vite] Serving static files from: ${finalPath}`);
    app.use(express.static(finalPath));
    app.get("*", (req, res) => {
      const indexPath = path.join(finalPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Frontend build not found. Please run 'npm run build' first.");
      }
    });
  }
}

setupVite();

if (!process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
