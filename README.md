# Azure Deployment (App Service + Azure SQL) - L2

A database-backed Node.js web app deployed with Azure **PaaS** services. The app code runs on **Azure App Service**, the data lives in **Azure SQL Database**, and the connection string is passed in through **App Settings**, so no secret is stored in the code.

## 1. Architecture

```
User's browser
      |
      v
Azure App Service (Node.js web app: node-app-123)
      |   reads DB_CONNECTION_STRING from App Settings
      v
Azure SQL Database (appdb on server node-db-sr-123)
```

- **App Service** runs the code. I do not manage the operating system.
- **Azure SQL Database** stores the data. I do not manage a database server.
- **App Settings** hold the connection string. It is never written in the repository.

## 2. Resources Created

| Resource | Name |
|---|---|
| Resource group | `devops-rg` |
| Azure SQL logical server | `node-db-sr-123` |
| Azure SQL database | `appdb` |
| App Service (Web App) | `node-app-123` |
| Runtime stack | Node 20 LTS on Linux |
| Deployment method | GitHub Actions through Deployment Center (OneDeploy) |

## 3. The Application

A small Express app (`server.js`):
- `GET /` shows a form and the list of users saved in the database.
- `POST /add` saves a new user (name and email) to the `dbo.Users` table.
- `GET /health` returns `{"status":"ok"}` without using the database.
- The app reads the connection string from the `DB_CONNECTION_STRING` environment variable and creates the `dbo.Users` table the first time it connects.

## 4. Steps I Followed

### Step 1: Provision the Azure SQL Database
1. Azure Portal → **SQL databases → Create**.
2. Resource group `devops-rg`, database name `appdb`.
3. Created a new logical SQL server `node-db-sr-123` with **SQL authentication** and an admin username and a strong password.
4. **Networking** tab: **Public endpoint**, and turned **ON** "Allow Azure services and resources to access this server" (see section 5).
5. After creation, opened the database → **Settings → Connection strings** and copied the **ADO.NET (SQL authentication)** string.

### Step 2: Provision the Azure App Service
1. Azure Portal → **App Services → Create → Web App**.
2. Name `node-app-123`, Publish: Code, Runtime stack: Node 20 LTS, OS: Linux.
3. Chose an App Service Plan (low-cost tier for the lab).

### Step 3: Secure configuration
1. Web App → **Settings → Environment variables → App settings → Add**.
2. Name: `DB_CONNECTION_STRING`.
3. Value: the ADO.NET string, with `{your_password}` replaced by my real admin password.
4. Clicked **Apply** and confirmed the restart.

The connection string looks like this (password hidden):

```
Server=tcp:node-db-sr-123.database.windows.net,1433;Initial Catalog=appdb;Persist Security Info=False;User ID=<admin-user>;Password=<hidden>;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;
```

### Step 4: Deploy the code and verify
1. Web App → **Deployment → Deployment Center**.
2. Source: **GitHub**. Selected my repository and the `main` branch.
3. Azure added a GitHub Actions workflow to the repo. The workflow ran and the deployment finished with **Deployment successful** (deployer: OneDeploy).
4. Opened the app with **Browse**, added a user through the form, and saw it listed in the table. After a page refresh the user was still there, so the data is read from Azure SQL.

## 5. How I Resolved the Azure SQL Firewall

An Azure SQL server blocks all connections by default. If the App Service is not allowed in, the app cannot connect and shows an error like *"Client with IP address ... is not allowed to access the server"*.

What I did:
- On the SQL server's **Networking** page I turned **ON** **"Allow Azure services and resources to access this server"**.
- This adds a special firewall rule (start IP `0.0.0.0` and end IP `0.0.0.0`) that allows traffic from other Azure services, such as my App Service.
- I also turned on **"Add current client IP address"** so I could reach the server from my own computer for checks.

Why this works: App Service connects from Azure's own network, and this setting tells the SQL server to accept connections that come from inside Azure. It is simple and good for a lab. In production, a stricter option is to allow only the App Service's outbound IP addresses, or to use a Private Endpoint with VNet integration.

## 6. Problems Faced and Fixes

| Problem | Cause | Fix |
|---|---|---|
| Deployment Center failed with *"We couldn't verify how GitHub Actions issues OIDC tokens for this repository"* | The default login method (user-assigned identity with OIDC) could not be verified for my repo | Changed the deployment authentication to **Basic authentication** (after turning **SCM Basic Auth Publishing Credentials** to **On**) and saved again. The deployment then finished successfully |
| I did not have an application code repository | The assignment says the code is provided, but I did not have it | Created a small Node.js app that writes to and reads from Azure SQL, and put it in my own GitHub repository |
| The connection string had a `{your_password}` placeholder | Azure shows the string with a placeholder, not the real password | Replaced the placeholder (and the curly brackets) with my admin password before saving it in App Settings |

## 7. Security Notes
- The connection string and password are **not** in the repository. They are only in the App Service **App Settings**.
- The screenshot of the settings page hides the password.
- `.gitignore` excludes `.env` and `node_modules`.

<img width="1917" height="903" alt="Screenshot 2026-11-24 094426" src="https://github.com/user-attachments/assets/73baa332-3573-499c-a8a2-36c123c5af3a" />
<img width="1917" height="748" alt="Screenshot 2026-11-24 094442" src="https://github.com/user-attachments/assets/191d7ce3-bcca-4db0-ba54-5f3a932deeb0" />
<img width="1916" height="801" alt="Screenshot 2026-11-24 094359" src="https://github.com/user-attachments/assets/f0af868d-bf3a-4263-91d1-4a865db9094d" />
<img width="1917" height="563" alt="Screenshot 2026-11-24 093525" src="https://github.com/user-attachments/assets/209c3ec2-07f7-4d93-b6b7-253a528f1553" />
<img width="1917" height="687" alt="Screenshot 2026-11-24 093634" src="https://github.com/user-attachments/assets/424d7fa6-fbd6-431a-8e08-77fc6e1720ff" />
<img width="1917" height="907" alt="Screenshot 2026-11-24 091236" src="https://github.com/user-attachments/assets/731f2e23-aaab-498e-af73-a08dda65971b" />


## 9. Repository Contents
- `server.js` - the web application
- `package.json` - dependencies and start script
- `.gitignore`
- `README.md` - this file
- `screenshots/` - evidence for each step

## 10. Conclusion
I deployed a database-backed web application using only Azure PaaS services. The code runs on App Service, the data is stored in Azure SQL, the connection string is injected securely through App Settings, and the SQL firewall was opened for Azure services so the two services can talk to each other. The app saved and returned data successfully.
