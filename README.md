# Azure SQL Web App (Node.js)

A small Node.js + Express web app for the **Azure App Service + Azure SQL Database** deployment lab.

- A form adds a user (name and email) to an Azure SQL table.
- The page lists all saved users, which proves data is stored and read back.
- The database connection string is read from the environment variable `DB_CONNECTION_STRING`. **No password is stored in the code.**

## Run settings

| Setting | Value |
|---|---|
| Runtime | Node 20 LTS (Node 18 or higher works) |
| Start command | `npm start` (runs `node server.js`) |
| Port | Uses the `PORT` variable that App Service sets |
| Required app setting | `DB_CONNECTION_STRING` = the ADO.NET connection string of your Azure SQL Database |

The app creates the `dbo.Users` table by itself the first time it connects.

## Routes

| Route | What it does |
|---|---|
| `GET /` | Shows the form and the list of users |
| `POST /add` | Saves a new user to Azure SQL |
| `GET /health` | Returns `{"status":"ok"}` without using the database |

## Run locally (optional)

```bash
npm install
export DB_CONNECTION_STRING='Server=tcp:<server>.database.windows.net,1433;Initial Catalog=<db>;User ID=<user>;Password=<password>;Encrypt=True;'
npm start
```

To connect from your own computer, add your public IP in the SQL server's **Networking** firewall rules.

## Security notes
- Never commit the connection string or password. `.env` is in `.gitignore`.
- In Azure, keep the connection string in **App Service → Environment variables**, not in the repository.
