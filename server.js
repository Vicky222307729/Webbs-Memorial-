const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");
const appDataRoot =
  process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
const dataDir = path.join(appDataRoot, "WebbsMemorialOrphanage");
const dbPath = path.join(dataDir, "webbs-memorial.db");
const sessions = new Map();

const orphanageData = {
  title: "Webbs Memorial Orphanage",
  tagline: "A safe home, loving care, and a brighter future for every child.",
  about:
    "Webbs Memorial Orphanage is a caring children's home dedicated to providing shelter, education, healthcare, and emotional support for children in need.",
  mission:
    "Our mission is to create a secure and nurturing environment where every child can grow with dignity, hope, and opportunity.",
  stats: [
    { label: "Children Supported", value: "120+" },
    { label: "Dedicated Caregivers", value: "25" },
    { label: "Years of Service", value: "65+" }
  ],
  programs: [
    "Safe accommodation and daily care",
    "School education and learning support",
    "Healthcare and nutrition programs",
    "Life skills, mentoring, and counseling"
  ],
  contact: {
    phone: ["9444388087", "8148941518", "9840230045"],
    email: "webbs.simon1307@gmail.com",
    address: "No. 41, Mount Poonamallee High Road, St. Thomas Mount, Butt Road, Chennai - 16"
  },
  donationHighlights: [
    "Sponsor education supplies and school fees",
    "Support daily meals and nutrition programs",
    "Contribute to healthcare and emergency care"
  ]
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS donations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    donor_name TEXT NOT NULL,
    donor_email TEXT NOT NULL,
    phone TEXT,
    amount REAL NOT NULL,
    purpose TEXT NOT NULL,
    message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function seedAdminUser() {
  const existing = db.prepare("SELECT id FROM admin_users WHERE username = ?").get("admin");
  if (existing) {
    return;
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = hashPassword("admin123", salt);
  db.prepare(
    "INSERT INTO admin_users (username, password_hash, salt) VALUES (?, ?, ?)"
  ).run("admin", passwordHash, salt);
}

seedAdminUser();

function sendJson(res, statusCode, data, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  });
  res.end(JSON.stringify(data));
}

function sendText(res, statusCode, text, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    ...extraHeaders
  });
  res.end(text);
}

function serveFile(filePath, res) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(res, 404, { error: "File not found" });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "text/plain; charset=utf-8" });
    res.end(content);
  });
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return header.split(";").reduce((accumulator, chunk) => {
    const [rawKey, ...rawValue] = chunk.trim().split("=");
    if (!rawKey) {
      return accumulator;
    }
    accumulator[rawKey] = decodeURIComponent(rawValue.join("="));
    return accumulator;
  }, {});
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 1e6) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function validateDonation(payload) {
  const donorName = String(payload.donorName || "").trim();
  const donorEmail = String(payload.donorEmail || "").trim();
  const phone = String(payload.phone || "").trim();
  const purpose = String(payload.purpose || "").trim();
  const message = String(payload.message || "").trim();
  const amount = Number(payload.amount);

  if (!donorName || !donorEmail || !purpose || Number.isNaN(amount) || amount <= 0) {
    return { ok: false, error: "Please complete all required donation details." };
  }

  return {
    ok: true,
    donation: {
      donorName,
      donorEmail,
      phone,
      amount: Number(amount.toFixed(2)),
      purpose,
      message
    }
  };
}

function createSession(userId) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, {
    userId,
    expiresAt: Date.now() + 1000 * 60 * 60 * 8
  });
  return token;
}

function getSession(req) {
  const cookies = parseCookies(req);
  const token = cookies.sessionToken;
  if (!token || !sessions.has(token)) {
    return null;
  }

  const session = sessions.get(token);
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }

  return { token, ...session };
}

function requireAdmin(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { error: "Unauthorized" });
    return null;
  }
  return session;
}

function handleHomeData(res) {
  sendJson(res, 200, orphanageData);
}

function handleDonationCreate(req, res) {
  readBody(req)
    .then((payload) => {
      const validation = validateDonation(payload);
      if (!validation.ok) {
        sendJson(res, 400, { error: validation.error });
        return;
      }

      const { donorName, donorEmail, phone, amount, purpose, message } = validation.donation;
      const insert = db.prepare(`
        INSERT INTO donations (donor_name, donor_email, phone, amount, purpose, message)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const result = insert.run(donorName, donorEmail, phone, amount, purpose, message);

      sendJson(res, 201, {
        message: "Thank you for your generous support.",
        donationId: result.lastInsertRowid
      });
    })
    .catch((error) => {
      sendJson(res, 400, { error: error.message });
    });
}

function handleAdminLogin(req, res) {
  readBody(req)
    .then((payload) => {
      const username = String(payload.username || "").trim();
      const password = String(payload.password || "");

      if (!username || !password) {
        sendJson(res, 400, { error: "Username and password are required." });
        return;
      }

      const user = db
        .prepare("SELECT id, username, password_hash, salt FROM admin_users WHERE username = ?")
        .get(username);

      if (!user) {
        sendJson(res, 401, { error: "Invalid login credentials." });
        return;
      }

      const passwordHash = hashPassword(password, user.salt);
      if (passwordHash !== user.password_hash) {
        sendJson(res, 401, { error: "Invalid login credentials." });
        return;
      }

      const token = createSession(user.id);
      sendJson(
        res,
        200,
        {
          message: "Login successful.",
          user: { id: user.id, username: user.username }
        },
        {
          "Set-Cookie": `sessionToken=${token}; HttpOnly; Path=/; Max-Age=28800; SameSite=Strict`
        }
      );
    })
    .catch((error) => {
      sendJson(res, 400, { error: error.message });
    });
}

function handleAdminLogout(req, res) {
  const session = getSession(req);
  if (session) {
    sessions.delete(session.token);
  }
  sendJson(
    res,
    200,
    { message: "Logged out successfully." },
    { "Set-Cookie": "sessionToken=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict" }
  );
}

function handleAdminSummary(req, res) {
  const session = requireAdmin(req, res);
  if (!session) {
    return;
  }

  const summary = db.prepare(`
    SELECT
      COUNT(*) AS donationCount,
      COALESCE(SUM(amount), 0) AS totalAmount,
      COALESCE(AVG(amount), 0) AS averageAmount
    FROM donations
  `).get();

  const donations = db.prepare(`
    SELECT id, donor_name AS donorName, donor_email AS donorEmail, phone, amount, purpose, message, created_at AS createdAt
    FROM donations
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT 25
  `).all();

  sendJson(res, 200, {
    summary: {
      donationCount: summary.donationCount,
      totalAmount: Number(summary.totalAmount || 0),
      averageAmount: Number(summary.averageAmount || 0)
    },
    donations
  });
}

function handleAdminSession(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { authenticated: false });
    return;
  }

  const user = db.prepare("SELECT id, username FROM admin_users WHERE id = ?").get(session.userId);
  if (!user) {
    sessions.delete(session.token);
    sendJson(res, 401, { authenticated: false });
    return;
  }

  sendJson(res, 200, { authenticated: true, user });
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = requestUrl.pathname;

  if (req.method === "GET" && pathname === "/api/home") {
    handleHomeData(res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/donations") {
    handleDonationCreate(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/login") {
    handleAdminLogin(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/logout") {
    handleAdminLogout(req, res);
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/summary") {
    handleAdminSummary(req, res);
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/session") {
    handleAdminSession(req, res);
    return;
  }

  const normalizedPath = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(normalizedPath).replace(/^(\.\.[\/\\])+/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    sendText(res, 403, "Access denied");
    return;
  }

  serveFile(filePath, res);
});

server.listen(port, () => {
  console.log(`Webbs Memorial Orphanage site running at http://localhost:${port}`);
});
