# Forma Volume Parameters Extension

A Forma extension that assigns metadata parameters (Department, Function, Room, Phasing, Cost) to massing volumes and writes them back to Forma element properties.

## Features
- Auto-parses volume names using naming convention `{Phase}_{Department}_{Function}_{Index}`
- Manual parameter editing with dropdowns
- Cost auto-calculated from $/SF × area pulled from Forma geometry
- Parameters saved directly to Forma element properties

---

## Setup

### 1. Clone & install
```bash
git clone https://github.com/<YOUR-USERNAME>/forma-volume-params.git
cd forma-volume-params
npm install
```

### 2. Run locally
```bash
npm run dev
# → http://localhost:5173
```

### 3. Register the extension in Forma (local dev)
1. Open your project in Autodesk Forma
2. Click the **Extensions** icon in the left sidebar
3. Click **Manage Extensions** → **Create New Extension**
4. Fill in:
   - **Name:** Volume Parameters
   - **URL:** `http://localhost:5173`
   - **Placement:** Left Panel
5. Click **Save** — you'll get an **Extension ID**
6. Go back to Extensions → **Unpublished** tab → paste the Extension ID → Install

> Your extension now loads live from your local machine inside Forma.

---

## Deploy to GitHub Pages (share with firm)

### 1. Update `package.json` and `vite.config.js`
Replace `<YOUR-GITHUB-USERNAME>` with your actual GitHub username.

### 2. Push to GitHub
```bash
git init
git add .
git commit -m "init forma extension"
git remote add origin https://github.com/<YOUR-USERNAME>/forma-volume-params.git
git push -u origin main
```

### 3. Enable GitHub Pages
Go to your repo → **Settings** → **Pages** → Source: **GitHub Actions**

GitHub Actions will automatically build and deploy on every push to `main`.
Your extension will be live at:
```
https://<YOUR-USERNAME>.github.io/forma-volume-params/
```

### 4. Update the extension URL in Forma
Go to **Manage Extensions** → edit your extension → replace `localhost:5173` with the GitHub Pages URL above.

### 5. Share the Extension ID with your firm
Colleagues go to Extensions → **Unpublished** tab → paste the Extension ID → Install.

---

## Naming Convention

```
P1_Medical_Inpatient_01
│   │       │          └─ Index
│   │       └──────────── Function
│   └──────────────────── Department
└──────────────────────── Phase (P1–P4)
```

## Parameters

| Parameter  | Type   | Source             |
|-----------|--------|--------------------|
| Department | Enum   | Auto-parsed / manual |
| Function   | Enum   | Auto-parsed / manual |
| Room       | String | Manual             |
| Phasing    | Enum   | Auto-parsed / manual |
| Cost/SF    | Number | Auto-suggested by function |
| Total Cost | Calc   | $/SF × Area (from Forma) |
