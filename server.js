const express = require("express");
const sql = require("mssql");

const app = express();
app.use(express.urlencoded({ extended: false }));

// ---------------------------------------------------------------------------
// Read the connection string from the environment (set in App Service ->
// Configuration -> Application settings). Nothing secret is hardcoded here.
// ---------------------------------------------------------------------------
function getConnectionString() {
  return (
    process.env.DB_CONNECTION_STRING ||
    process.env.SQLAZURECONNSTR_DefaultConnection ||
    process.env.SQLCONNSTR_DefaultConnection ||
    process.env.DefaultConnection ||
    ""
  );
}

// Turn an ADO.NET connection string into a config object for the mssql package.
// Example input:
// Server=tcp:myserver.database.windows.net,1433;Initial Catalog=appdb;
// User ID=sqladmin;Password=xxx;Encrypt=True;Connection Timeout=30;
function parseAdoNet(cs) {
  const parts = {};
  cs.split(";").forEach((piece) => {
    const i = piece.indexOf("=");
    if (i > 0) {
      parts[piece.slice(0, i).trim().toLowerCase()] = piece.slice(i + 1).trim();
    }
  });

  const serverRaw = parts["server"] || parts["data source"] || "";
  const [host, port] = serverRaw.replace(/^tcp:/i, "").split(",");

  return {
    server: host,
    port: port ? parseInt(port, 10) : 1433,
    database: parts["initial catalog"] || parts["database"],
    user: parts["user id"] || parts["uid"],
    password: parts["password"] || parts["pwd"],
    options: { encrypt: true, trustServerCertificate: false },
    // A serverless database may be paused. Allow time for it to wake up.
    connectionTimeout: 60000,
    requestTimeout: 30000,
  };
}

let poolPromise = null;

function getPool() {
  if (!poolPromise) {
    const cs = getConnectionString();
    if (!cs) {
      return Promise.reject(
        new Error(
          "No connection string found. Add DB_CONNECTION_STRING in App Service -> Environment variables."
        )
      );
    }
    poolPromise = new sql.ConnectionPool(parseAdoNet(cs))
      .connect()
      .then(async (pool) => {
        // Create the table on first run.
        await pool.request().query(`
          IF OBJECT_ID('dbo.Users', 'U') IS NULL
          CREATE TABLE dbo.Users (
            Id INT IDENTITY(1,1) PRIMARY KEY,
            Name NVARCHAR(100) NOT NULL,
            Email NVARCHAR(200) NOT NULL,
            CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
          );
        `);
        return pool;
      })
      .catch((err) => {
        poolPromise = null; // allow a retry on the next request
        throw err;
      });
  }
  return poolPromise;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function page({ users = [], error = "", notice = "" }) {
  const rows = users
    .map(
      (u) => `<tr>
        <td>${u.Id}</td>
        <td>${escapeHtml(u.Name)}</td>
        <td>${escapeHtml(u.Email)}</td>
        <td>${new Date(u.CreatedAt).toISOString().replace("T", " ").slice(0, 19)} UTC</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Azure App Service + Azure SQL Demo</title>
  <style>
    body { font-family: system-ui, Arial, sans-serif; max-width: 760px; margin: 40px auto; padding: 0 16px; color: #1f2937; }
    h1 { margin-bottom: 4px; }
    .sub { color: #6b7280; margin-top: 0; }
    form { display: flex; gap: 8px; flex-wrap: wrap; margin: 24px 0; }
    input { padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px; flex: 1; min-width: 180px; }
    button { padding: 8px 16px; background: #0078d4; color: #fff; border: 0; border-radius: 6px; cursor: pointer; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #e5e7eb; }
    th { background: #f3f4f6; }
    .error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; padding: 12px; border-radius: 6px; }
    .ok { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; padding: 12px; border-radius: 6px; }
  </style>
</head>
<body>
  <h1>Azure App Service + Azure SQL</h1>
  <p class="sub">Add a user below. The data is saved in Azure SQL Database and read back from it.</p>
  ${notice ? `<p class="ok">${escapeHtml(notice)}</p>` : ""}
  ${error ? `<p class="error"><strong>Database error:</strong> ${escapeHtml(error)}</p>` : ""}
  <form method="POST" action="/add">
    <input name="name" placeholder="Name" required maxlength="100" />
    <input name="email" type="email" placeholder="Email" required maxlength="200" />
    <button type="submit">Add user</button>
  </form>
  <h2>Users in the database (${users.length})</h2>
  <table>
    <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Created</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4">No users yet.</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}

app.get("/", async (req, res) => {
  const notice = req.query.added ? "User saved to Azure SQL Database." : "";
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .query("SELECT Id, Name, Email, CreatedAt FROM dbo.Users ORDER BY Id DESC");
    res.send(page({ users: result.recordset, notice }));
  } catch (err) {
    console.error("GET / failed:", err.message);
    res.status(500).send(page({ error: err.message }));
  }
});

app.post("/add", async (req, res) => {
  const name = (req.body.name || "").trim();
  const email = (req.body.email || "").trim();
  if (!name || !email) {
    return res.status(400).send(page({ error: "Name and email are required." }));
  }
  try {
    const pool = await getPool();
    await pool
      .request()
      .input("name", sql.NVarChar(100), name)
      .input("email", sql.NVarChar(200), email)
      .query("INSERT INTO dbo.Users (Name, Email) VALUES (@name, @email)");
    res.redirect("/?added=1");
  } catch (err) {
    console.error("POST /add failed:", err.message);
    res.status(500).send(page({ error: err.message }));
  }
});

// Simple health check that does not need the database.
app.get("/health", (req, res) => res.json({ status: "ok" }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on port ${port}`));
