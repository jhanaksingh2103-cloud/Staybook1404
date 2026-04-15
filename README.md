# 🏠 StayBook — VS Code Ready

Airbnb-style Host Calendar with real Node.js backend + MongoDB database + Authentication.

---

## 🔐 Login Credentials

Use these credentials to login:

| Username | Password   | Role       |
| -------- | ---------- | ---------- |
| `admin`  | `admin123` | Admin User |
| `host`   | `host123`  | Host User  |

---

## ✅ Requirements (install these first)

| Tool                        | Download                         |
| --------------------------- | -------------------------------- |
| **Node.js** (v18 or higher) | https://nodejs.org → click "LTS" |
| **VS Code**                 | https://code.visualstudio.com    |

---

## 🚀 Run in 4 Steps

### 1. Open in VS Code

- Unzip this folder
- Open VS Code
- **File → Open Folder** → select the `staybook` folder

### 2. Open the Terminal

- In VS Code: **Terminal → New Terminal** (or press `` Ctrl + ` ``)

### 3. Install packages

Paste this in the terminal and press Enter:

```
npm install
```

Wait for it to finish (takes ~30 seconds first time)

### 3.5 Configure MongoDB

Copy `.env.example` to `.env` and set your MongoDB connection string:

```
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/staybook?retryWrites=true&w=majority
PORT=3001
```

You can also use local MongoDB:

```
MONGODB_URI=mongodb://127.0.0.1:27017/staybook
```

### 4. Start the server

```
npm start
```

You'll see:

```
🏠 StayBook running on port 3001
```

### 5. Open the app

Open your browser and go to:

```
http://localhost:3001
```

That's it! 🎉

---

## 🔁 Auto-restart on file changes (optional)

Instead of `npm start`, use:

```
npm run dev
```

This uses **nodemon** — the server automatically restarts whenever you edit `server.mongo.js`.

---

## 🔄 Optional: Run legacy SQLite server

If you need the previous SQLite backend temporarily:

```
npm run start:sqlite
```

---

## ▶ Run with F5 (VS Code debugger)

You can also press **F5** in VS Code to start the server with full debugging support.
Breakpoints, variable inspection — all work.

---

## 📋 Google Form Integration

### Full flow:

1. Create a Google Form with guest questions (arrival time, ID proof, etc.)
2. In the StayBook app → tap any booking → copy the **Webhook URL**
3. In Google Form → **⋮ Menu → Script editor** → paste this code:

```javascript
function onFormSubmit(e) {
  // Paste your booking's webhook URL here
  var webhookUrl = "http://localhost:3001/api/submit-form/YOUR_BOOKING_ID";

  var responses = {};
  e.response.getItemResponses().forEach(function (item) {
    responses[item.getItem().getTitle()] = item.getResponse();
  });

  UrlFetchApp.fetch(webhookUrl, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(responses),
    muteHttpExceptions: true,
  });
}
```

4. In Script editor → **Triggers (clock icon) → Add Trigger**
   - Function: `onFormSubmit`
   - Event type: **On form submit**

5. Guest submits form → response instantly appears in the app ✅

> **Note:** For Google Forms to reach your local machine, you need a public URL.
> Use **ngrok** (free): `npx ngrok http 3001` → copy the https URL it gives you.

---

## 🧪 Test the API inside VS Code

Install the **REST Client** extension (by Huachao Mao), then open `api-test.rest`.
You'll see **"Send Request"** links above each API call — click to test instantly.

---

## ☁️ Deploy on Render (recommended for Google Forms webhooks)

This project now includes [render.yaml](render.yaml), so Render can auto-configure service + disk.

### Steps

1. Push this project to GitHub.
2. In Render: **New + → Blueprint**.
3. Select your repo.
4. Render reads `render.yaml` and creates the web service.
5. After deploy, open:

`https://<your-render-service>.onrender.com`

### Important

- Webhook URLs must use your Render domain, not localhost.
- Persistent SQLite path is set via `DATABASE_PATH=/var/data/staybook.db`.
- A disk is mounted at `/var/data` in `render.yaml` so data survives restarts.

Example webhook on Render:

`https://<your-render-service>.onrender.com/api/submit-form/YOUR_BOOKING_ID`

---

## 🗂️ File Structure

```
staybook/
├── server.js            ← Backend (Express + SQLite API)
├── package.json         ← Project config & dependencies
├── api-test.rest        ← Test API calls inside VS Code
├── staybook.db          ← Database (auto-created on first run)
├── .gitignore
├── .vscode/
│   ├── launch.json      ← F5 run config
│   └── settings.json    ← Editor settings
└── public/
    └── index.html       ← Full mobile frontend
```

---

## ❓ Troubleshooting

| Problem                        | Solution                                                |
| ------------------------------ | ------------------------------------------------------- |
| `npm: command not found`       | Install Node.js from https://nodejs.org                 |
| `Cannot find module 'express'` | Run `npm install` again                                 |
| Port 3001 already in use       | Change PORT in server.js line 1: `const PORT = 3002`    |
| White screen in browser        | Make sure server is running, check terminal for errors  |
| Database errors                | Delete `staybook.db` and restart — it will be recreated |
# Staybook1404
