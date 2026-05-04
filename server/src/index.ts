import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import { Server as IOServer } from 'socket.io';
import { setupOAuth } from './auth/passportSetup.js';
import { createPool } from './db/client.js';
import { createRequireAuth } from './middleware/jwt.js';
import { messagesRouter } from './routes/messages.js';
import { registerRoomNamespaces } from './sockets/roomHandler.js';

const PORT = Number(process.env.PORT ?? 3001);
const JWT_SECRET = process.env.JWT_SECRET ?? '';
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const DATABASE_URL = process.env.DATABASE_URL ?? '';

if (!JWT_SECRET) {
  console.error('JWT_SECRET is required');
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = createPool(DATABASE_URL);
const app = express();

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(passport.initialize());

setupOAuth(app, pool, JWT_SECRET, FRONTEND_URL);

const requireAuth = createRequireAuth(JWT_SECRET);
app.use('/api', messagesRouter(pool, requireAuth));

app.get('/api/auth/providers', (_req, res) => {
  res.json({
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    github: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    dev: process.env.ALLOW_DEV_LOGIN === '1',
  });
});

app.post('/api/auth/dev-login', async (req, res) => {
  if (process.env.ALLOW_DEV_LOGIN !== '1') {
    res.status(403).json({ error: 'disabled' });
    return;
  }
  const usernameRaw = typeof req.body?.username === 'string' ? req.body.username : '';
  const username = usernameRaw.trim().slice(0, 64);
  if (!username) {
    res.status(400).json({ error: 'username required' });
    return;
  }
  try {
    const r = await pool.query<{ id: string }>(
      `
      INSERT INTO users (provider, provider_id, username, avatar)
      VALUES ('dev', $1, $2, NULL)
      ON CONFLICT (provider, provider_id) DO UPDATE SET username = EXCLUDED.username
      RETURNING id
      `,
      [`dev:${username}`, username]
    );
    const id = r.rows[0]?.id;
    if (!id) {
      res.status(500).json({ error: 'failed' });
      return;
    }
    const token = jwt.sign({ sub: id, username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } catch (e) {
    console.error('dev-login', e);
    const message = e instanceof Error ? e.message : 'failed';
    res.status(500).json({ error: message });
  }
});

const httpServer = createServer(app);
const io = new IOServer(httpServer, {
  cors: { origin: FRONTEND_URL },
  path: '/socket.io',
});

registerRoomNamespaces(io, { jwtSecret: JWT_SECRET, pool });

httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
