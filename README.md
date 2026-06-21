# Lobby

Realtime lobby and rooms: **React (Vite)** frontend, **Express** API with **PostgreSQL**, and **Socket.IO** for presence/chat-style features. Auth uses a **short-lived access JWT in memory** (React state). A **rotating refresh token** lives in an **httpOnly cookie** on `/auth`; the app calls **`POST /auth/refresh`** on startup to restore access in new tabs. Optional **Google/GitHub OAuth**, a one-click **guest login**, and a **dev login** shortcut round out the sign-in options.

**Live app:** https://pixelport.app/

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **Docker** (optional but recommended) — to run Postgres locally via `docker compose`

## 1. Install dependencies

From the repository root:

```bash
npm install
npm --prefix server install
```

## 2. Database (PostgreSQL)

Start Postgres with the bundled Compose file (user, password, and database are all `lobby`):

```bash
docker compose up -d
```

Wait until the container is healthy, then run migrations **from the `server` directory**:

```bash
cd server
npm run migrate
cd ..
```

`migrate` runs [Drizzle ORM](https://orm.drizzle.team) migrations from `server/db/drizzle` (tracked in `__drizzle_migrations`). If you use your own Postgres instance, create a database and user that match your `DATABASE_URL`, then run the same migrate command. To change the schema, edit `server/src/db/schema.ts` and run `npm run db:generate` in the `server` directory to emit a new SQL migration.

## 3. Environment variables

### API (`server/.env`)

Create `server/.env` (see values below). The server **exits on startup** if `JWT_SECRET` or `DATABASE_URL` is missing.

| Variable                                    | Required    | Description                                                                                                                                           |
| ------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                      | optional    | API port (default `3001`)                                                                                                                             |
| `DATABASE_URL`                              | **yes**     | Postgres connection string, e.g. `postgresql://lobby:lobby@localhost:5432/lobby`                                                                      |
| `JWT_SECRET`                                | **yes**     | Secret for signing JWTs (use a long random string; never commit real secrets)                                                                         |
| `FRONTEND_URL`                              | recommended | Origin of the Vite app for CORS (default `http://localhost:5173`)                                                                                     |
| `SERVER_PUBLIC_URL`                         | for OAuth   | Public URL of this API (default `http://localhost:3001`); used in OAuth callback URLs                                                                 |
| `ALLOW_DEV_LOGIN`                           | optional    | Set to `1` to enable **POST `/auth/dev-login`** and the dev login button on the sign-in page. **Turn off in production.**                             |
| `ALLOW_GUEST_LOGIN`                         | optional    | Set to `0` to disable **POST `/auth/guest-login`** and the “Continue as guest” button. Defaults **on**.                                               |
| `GUEST_LOGIN_RATE_LIMIT_MAX`                | optional    | Max guest sign-ins per IP per window (default `5`).                                                                                                   |
| `GUEST_LOGIN_RATE_LIMIT_WINDOW_MS`          | optional    | Guest sign-in rate-limit window in ms (default `900000`, 15 minutes).                                                                                 |
| `TRUST_PROXY`                               | optional    | Express `trust proxy` hop count for correct client IP behind a reverse proxy (default `1`). Set to `0` for direct exposure.                           |
| `REFRESH_COOKIE_SAMESITE`                   | optional    | Override the refresh-cookie `SameSite` (`lax` / `strict` / `none`). Default: `strict`.                                                                |
| `REFRESH_COOKIE_SECURE`                     | optional    | Force the `Secure` flag on the refresh cookie (`1` / `0`). Auto: on when the API or SPA URL is HTTPS.                                                 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional    | Enable “Continue with Google” when both are set                                                                                                       |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | optional    | Enable “Continue with GitHub” when both are set                                                                                                       |
| `GROQ_API_KEY`                              | optional    | Groq API key for room ChatNpc replies ([console.groq.com](https://console.groq.com)). Without it, ChatNpcs render but use canned fallback lines only. |

Example for local Docker Postgres and dev login:

```env
PORT=3001
FRONTEND_URL=http://localhost:5173
SERVER_PUBLIC_URL=http://localhost:3001
DATABASE_URL=postgresql://lobby:lobby@localhost:5432/lobby
JWT_SECRET=change-me-to-a-long-random-string
ALLOW_DEV_LOGIN=1
```

After editing `server/.env`, restart the API process.

### Frontend (optional root `.env`)

In development, the client talks to the API **directly** via `VITE_API_ORIGIN` or `VITE_PROXY_TARGET` (default `http://localhost:3001`) so cookies and Socket.IO work reliably. Set one of these if the API is not on the default port:

```env
VITE_API_ORIGIN=http://localhost:3001
```

(Default if unset in dev: `http://localhost:3001` for both REST and Socket.IO.)

For production, set **`VITE_API_ORIGIN`** to your public API URL (e.g. `https://api.example.com`) when the frontend and API are on different hosts (Vercel + Docker, etc.). REST and Socket.IO both use that origin.

### Production example (same registrable domain: `pixelport.app` + `api.pixelport.app`)

This is the recommended, most secure topology: the SPA and API share one root domain on different subdomains.

`server/.env`:

```env
FRONTEND_URL=https://pixelport.app
SERVER_PUBLIC_URL=https://api.pixelport.app
DATABASE_URL=postgresql://...
JWT_SECRET=<long-random-string>
# ALLOW_DEV_LOGIN must stay unset/0 in production
```

Frontend build env:

```env
VITE_API_ORIGIN=https://api.pixelport.app
```

Because both hosts share the registrable domain `pixelport.app`, the refresh cookie is issued as **`SameSite=Strict; Secure; HttpOnly; Path=/auth`** (host-only on `api.pixelport.app`). Register the OAuth callbacks as `https://api.pixelport.app/auth/google/callback` and `.../auth/github/callback`, and ensure your reverse proxy forwards `X-Forwarded-Proto: https` so Express marks the cookie `Secure`.

## 4. Run the app (development)

**Easiest:** one command from the repo root (starts Vite + API together):

```bash
npm run dev
```

- **Frontend:** http://localhost:5173
- **API:** http://localhost:3001

Sign in at http://localhost:5173/login.

### Run frontend and API separately

```bash
# Terminal 1 — API (from repo root)
npm run dev:server

# Terminal 2 — Vite
npm run dev:web
```

Use the **Vite dev URL** (`http://localhost:5173`) for the SPA. The client calls the API at `VITE_API_ORIGIN` / `VITE_PROXY_TARGET` (default `http://localhost:3001`). Opening only `http://localhost:3001` in the browser will not serve the React app.

## Sign-in options

1. **Guest login** — One click on **Continue as guest** creates a fresh anonymous account with a server-generated display name like `Guest-a3f2c1` (6 hex chars). Each click makes a brand-new account; the session then survives reloads via the refresh cookie like any other user. Disable with `ALLOW_GUEST_LOGIN=0`.
2. **Dev login** — With `ALLOW_DEV_LOGIN=1`, use the dev section on `/login` to pick a display name. The API returns a short-lived **`accessToken`** (JSON) and sets the **httpOnly refresh cookie**; the client keeps the access token in memory only.
3. **Google** — Enable when **`GOOGLE_CLIENT_ID`** and **`GOOGLE_CLIENT_SECRET`** are both set in `server/.env` (see below).
4. **GitHub** — Enable when **`GITHUB_CLIENT_ID`** and **`GITHUB_CLIENT_SECRET`** are both set in `server/.env` (see below).

After a successful OAuth flow, the API redirects the browser to **`{FRONTEND_URL}/auth/callback#access=...&rt=...`**. The SPA reads the hash, calls **`POST /auth/session`** to install the refresh cookie, then keeps **`access`** in memory. Load the app from **`FRONTEND_URL`** (e.g. `http://localhost:5173` in dev) so that route runs correctly.

### Local dev: two servers (Vite + API) and OAuth

You run **two** processes: the **frontend** (Vite, e.g. `http://localhost:5173`) and the **API** (Express, e.g. `http://localhost:3001`). They work together like this:

1. You open the app at **`http://localhost:5173`** and click **Continue with Google/GitHub**.
2. The browser goes to **`{API_ORIGIN}/auth/...`** (default `http://localhost:3001/auth/...`).
3. You sign in at Google/GitHub. They **redirect your browser to the OAuth “callback” URL** — that URL must hit the **API**, not Vite:  
   **`http://localhost:3001/auth/google/callback`** or **`.../github/callback`**.
4. The API finishes the flow and **redirects you to** **`http://localhost:5173/auth/callback#access=...&rt=...`** (`FRONTEND_URL`), where the refresh cookie is wired up and access is held in memory.

So in the provider’s dashboard:

- **Do register** the callback on the **API** origin (**port 3001** by default).
- **Do not** use `http://localhost:5173/.../callback` as the OAuth callback (unless you intentionally run the API there—this project does not).
- **GitHub “Homepage URL”** can be **`http://localhost:5173`** — that’s only for display; it is **not** the OAuth redirect URI.
- Keep **`SERVER_PUBLIC_URL`** in `server/.env` equal to the same origin you put in the callback (e.g. `http://localhost:3001`, **no trailing slash**). If you change the API port, update **`PORT`**, **`SERVER_PUBLIC_URL`**, **`VITE_PROXY_TARGET`**, and the URLs in Google/GitHub.

### Callback URLs (must match `SERVER_PUBLIC_URL`)

The server builds redirect URIs as **`${SERVER_PUBLIC_URL}/auth/.../callback`**. For default local dev (`SERVER_PUBLIC_URL=http://localhost:3001`):

| Provider | Redirect / callback URL to register          |
| -------- | -------------------------------------------- |
| Google   | `http://localhost:3001/auth/google/callback` |
| GitHub   | `http://localhost:3001/auth/github/callback` |

In production, use your real API origin (e.g. `https://api.example.com/auth/google/callback`).

### Google OAuth setup

1. Open [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **OAuth consent screen**. Configure it (External is fine for testing; add yourself as a test user if the app stays in _Testing_).
2. **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**.
3. Application type: **Web application**.
4. Under **Authorized redirect URIs**, add exactly:  
   `http://localhost:3001/auth/google/callback`  
   (or your production URL: `{SERVER_PUBLIC_URL}/auth/google/callback`).
5. Copy the **Client ID** and **Client secret** into `server/.env`:

   ```env
   GOOGLE_CLIENT_ID=....apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=...
   ```

6. Restart the API. The **Continue with Google** button appears on `/login` when both vars are set.

### GitHub OAuth setup

1. GitHub → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App** (or use an existing app’s **Client secrets**).
2. **Application name** — any label (e.g. `Lobby local`).
3. **Homepage URL** — your app URL, e.g. `http://localhost:5173`.
4. **Authorization callback URL** — must be exactly:  
   `http://localhost:3001/auth/github/callback`  
   (or `{SERVER_PUBLIC_URL}/auth/github/callback` in production).
5. After creating the app, generate a **Client secret** and put both into `server/.env`:

   ```env
   GITHUB_CLIENT_ID=...
   GITHUB_CLIENT_SECRET=...
   ```

6. Restart the API. **Continue with GitHub** appears on `/login` when both vars are set.

## Build (frontend only)

```bash
npm run build
```

Output is in `dist/`. Set **`VITE_API_ORIGIN`** to your API subdomain when building for production. `npm run preview` runs Vite’s static preview only and does **not** start the API by default.

## Production deploy

Releases are triggered by pushing a semver tag (e.g. `v1.0.0`). GitHub Actions (`.github/workflows/release.yml`) then:

1. Builds and pushes the server Docker image to `ghcr.io/mattiasoest/lobby-server` (tagged with the release version and `latest`)
2. Deploys the client to Vercel production

On the server host, **Watchtower** (in `docker-compose.server.yml`) polls GHCR every minute and recreates the server container when a new `latest` image is available. Migrations run automatically on container start.

### Release a new version

```bash
git tag v1.0.0
git push origin v1.0.0
```

### GitHub Actions secrets

Add these under **Settings → Secrets and variables → Actions**:

| Secret              | Description                                      |
| ------------------- | ------------------------------------------------ |
| `VERCEL_TOKEN`      | Vercel account token                             |
| `VERCEL_ORG_ID`     | Vercel team/org ID (from project settings)       |
| `VERCEL_PROJECT_ID` | Vercel project ID (from project settings)        |

Ensure **`VITE_API_ORIGIN=https://api.pixelport.app`** is set in the Vercel project environment variables.

### First-time server host setup

1. Copy `server/.env` to the host with production values (`DATABASE_URL`, `JWT_SECRET`, etc.)
2. Log in to GHCR if the package is private:
   ```bash
   echo $GITHUB_PAT | docker login ghcr.io -u USERNAME --password-stdin
   ```
   Use a GitHub PAT with `read:packages`.
3. Start the stack:
   ```bash
   docker compose -f docker-compose.server.yml pull
   docker compose -f docker-compose.server.yml up -d
   ```

See `server-docker-commands.txt` for day-to-day Docker operations.

### Roll back the server

Use **Actions → Rollback server → Run workflow** and enter the release tag (e.g. `v1.0.0`). This retags that GHCR image as `:latest`; Watchtower picks it up within ~1 minute.

This does **not** roll back the Vercel frontend — use **Promote to Production** on a previous deployment in the Vercel dashboard for that.

If the bad release ran new database migrations, rolling back server code alone may not be safe. Restore the database from backup or fix forward instead.

## Troubleshooting

- **“Could not reach the API” on dev login** — API not running or wrong port; ensure `npm run dev` (or `dev:server`) is up and `VITE_PROXY_TARGET` matches if you changed the API port.
- **`[vite] ws proxy error` / `ECONNRESET`** — Usually fixed here by not proxying Socket.IO; the client talks to the API host in dev. If you still see it, confirm the API is up before opening a room and that `VITE_PROXY_TARGET` matches `PORT` / `SERVER_PUBLIC_URL`.
- **Database errors on login** — Postgres not running, wrong `DATABASE_URL`, or migrations not applied (`cd server && npm run migrate`).
- **No sign-in methods** — Enable at least one of: leave `ALLOW_GUEST_LOGIN` unset (or `=1`), set `ALLOW_DEV_LOGIN=1`, or configure Google / GitHub credentials.
- **“The redirect_uri is not associated with this application” (GitHub) / `redirect_uri_mismatch` (Google)** — Almost always: the **Authorization callback** / **Authorized redirect URI** in the provider still points at the **wrong host or port**. It must be the **API** URL (`http://localhost:3001/auth/github/callback` or `.../google/callback` with default settings), not `http://localhost:5173/...`. Copy-paste from the table above; save the app in GitHub/Google; ensure **`SERVER_PUBLIC_URL`** matches (no trailing slash). If you regenerated a GitHub **Client secret**, update `server/.env` and restart the server.
- **Google “Access blocked” / consent screen** — Complete the OAuth consent screen and, if the app is in testing, add your Google account as a test user.

## Tech stack

- React 19, Vite 8, React Router 7, PixiJS 8, Socket.IO client
- Express 4, `pg`, Passport (Google/GitHub), Socket.IO
- PostgreSQL 16 (Docker image in `docker-compose.yml`)
