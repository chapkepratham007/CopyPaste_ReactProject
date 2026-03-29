# COPYPASTE_APP

Password-protected internet clipboard (text + files) with expiring links.

## Features

- URL-based clips: open `http://localhost:5173/abc` on multiple devices
- Password required to read/write
- Text + file uploads
- Expiry options: 1h, 2h, 6h, 1d, 7d, 330d, forever
- Optional destroy-on-read

## Run locally

### 1) Start the server

Open a terminal:

- `npm install`
- `npm run dev`

Run in folder:

- `COPYPASTE_APP/server`

Server defaults:

- API: `http://localhost:8787`
- CORS origin: `http://localhost:5173`

Optional env (copy `src/env.example` to `.env` and set vars in your shell):

- `PORT`
- `CORS_ORIGIN`
- `DB_PATH`
- `UPLOAD_DIR`

### 2) Start the web app

Open a second terminal:

- `npm install`
- `npm run dev`

Run in folder:

- `COPYPASTE_APP/web`

Optional env:

- copy `web/.env.example` to `web/.env` and edit `VITE_API_BASE`

## How to use

- Open: `http://localhost:5173/myclip`
- Choose **Write**
- Enter a password
- Paste text and/or choose files
- Choose expiry and destroy-on-read
- Click **Save**

On another device:

- Open the same URL
- Choose **Read**
- Enter the same password
- Click **Unlock & Read**

## Notes

- If destroy-on-read is enabled, the clip is deleted after a successful read.
- Expired clips are cleaned periodically; uploaded files are removed from disk when a clip is deleted.
