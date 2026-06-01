import 'dotenv/config';
import crypto from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import passport from 'passport';
import { Server as IOServer } from 'socket.io';
import { sql } from 'drizzle-orm';
import { setupOAuth } from './auth/passportSetup.js';
import {
  REFRESH_COOKIE_NAME,
  issueAccessToken,
  generateRefreshSecret,
  persistRefreshToken,
  refreshCookieOptions,
} from './auth/tokens.js';
import { createDb, createPool } from './db/client.js';
import { users } from './db/schema.js';
import { guestLoginRateLimit } from './middleware/guestLoginRateLimit.js';
import { createRequireAuth } from './middleware/jwt.js';
import { createAuthTokensRouter } from './routes/authTokens.js';
import { meRouter } from './routes/me.js';
import { messagesRouter } from './routes/messages.js';
import { registerRoomNamespaces } from './sockets/roomHandler.js';
import { ensureChatNpcUsers } from './db/ensureChatNpcUsers.js';
import { collapseUsernameWhitespace } from './usernameNormalize.js';
import { corsOriginDelegate, parseAllowedOrigins, primaryFrontendUrl } from './allowedOrigins.js';

const PORT = Number(process.env.PORT ?? 3001);
const JWT_SECRET = process.env.JWT_SECRET ?? '';
const allowedOrigins = parseAllowedOrigins(process.env.FRONTEND_URL);
const FRONTEND_URL = primaryFrontendUrl(process.env.FRONTEND_URL);
const DATABASE_URL = process.env.DATABASE_URL ?? '';
const GROQ_API_KEY = process.env.GROQ_API_KEY?.trim() || undefined;

if (!JWT_SECRET) {
  console.error('JWT_SECRET is required');
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = createPool(DATABASE_URL);
const db = createDb(pool);
const app = express();

app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));

const corsOptions: cors.CorsOptions = {
  origin: corsOriginDelegate(allowedOrigins),
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
};
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.use(passport.initialize());

setupOAuth(app, db, JWT_SECRET, allowedOrigins, FRONTEND_URL);

app.get('/auth/providers', (_req, res) => {
  res.json({
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    github: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    dev: process.env.ALLOW_DEV_LOGIN === '1',
    guest: process.env.ALLOW_GUEST_LOGIN !== '0',
  });
});

app.post('/auth/guest-login', guestLoginRateLimit, async (_req, res) => {
  if (process.env.ALLOW_GUEST_LOGIN === '0') {
    res.status(403).json({ error: 'disabled' });
    return;
  }
  try {
    const guestId = crypto.randomUUID();
    const suffix = crypto.randomBytes(3).toString('hex');
    const username = `Guest-${suffix}`;
    const insertResult = await db
      .insert(users)
      .values({
        provider: 'guest',
        providerId: `guest:${guestId}`,
        username,
        avatar: null,
      })
      .returning({ id: users.id, username: users.username });
    const row = insertResult[0];
    if (!row) {
      res.status(500).json({ error: 'failed' });
      return;
    }
    const raw = generateRefreshSecret();
    await persistRefreshToken(db, row.id, raw);
    const accessToken = issueAccessToken({ id: row.id, username: row.username }, JWT_SECRET);
    res.cookie(REFRESH_COOKIE_NAME, raw, refreshCookieOptions());
    res.json({ accessToken });
  } catch (error) {
    console.error('guest-login', error);
    const message = error instanceof Error ? error.message : 'failed';
    res.status(500).json({ error: message });
  }
});

app.post('/auth/dev-login', async (req, res) => {
  if (process.env.ALLOW_DEV_LOGIN !== '1') {
    res.status(403).json({ error: 'disabled' });
    return;
  }
  const usernameRaw = typeof req.body?.username === 'string' ? req.body.username : '';
  const username = collapseUsernameWhitespace(usernameRaw, 64);
  if (!username) {
    res.status(400).json({ error: 'username required' });
    return;
  }
  try {
    const insertResult = await db
      .insert(users)
      .values({
        provider: 'dev',
        providerId: `dev:${username}`,
        username,
        avatar: null,
      })
      .onConflictDoUpdate({
        target: [users.provider, users.providerId],
        set: { username: sql`excluded.username` },
      })
      .returning({ id: users.id });
    const id = insertResult[0]?.id;
    if (!id) {
      res.status(500).json({ error: 'failed' });
      return;
    }
    const raw = generateRefreshSecret();
    await persistRefreshToken(db, id, raw);
    const accessToken = issueAccessToken({ id, username }, JWT_SECRET);
    res.cookie(REFRESH_COOKIE_NAME, raw, refreshCookieOptions());
    res.json({ accessToken });
  } catch (error) {
    console.error('dev-login', error);
    const message = error instanceof Error ? error.message : 'failed';
    res.status(500).json({ error: message });
  }
});

app.use('/auth', createAuthTokensRouter(db, JWT_SECRET));

const requireAuth = createRequireAuth(JWT_SECRET);
app.use(meRouter(db, requireAuth));
app.use(messagesRouter(db, requireAuth));

const httpServer = createServer(app);
const io = new IOServer(httpServer, {
  cors: { origin: allowedOrigins, credentials: true, methods: ['GET', 'POST'] },
  path: '/socket.io',
});

registerRoomNamespaces(io, { jwtSecret: JWT_SECRET, db, groqApiKey: GROQ_API_KEY });

try {
  await ensureChatNpcUsers(db);
} catch (error) {
  console.error('ensureChatNpcUsers failed', error);
  process.exit(1);
}

httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  if (!GROQ_API_KEY) {
    console.warn('GROQ_API_KEY is not set — room ChatNpcs will not reply to chat');
  }
});
