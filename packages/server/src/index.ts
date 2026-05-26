import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { runMigrations } from './db/migrate';
import { initClockService } from './services/clockService';
import { setIo } from './services/io';
import { registerSocketHandlers } from './sockets/socketHandler';
import { errorHandler } from './middleware/errorHandler';
import { requireAdmin } from './middleware/requireAdmin';
import healthRouter from './routes/health';
import clockRouter from './routes/clock';
import tournamentsRouter from './routes/tournaments';
import playersRouter from './routes/players';
import tablesRouter from './routes/tables';
import bountyRouter from './routes/bounty';
import blindStructuresRouter from './routes/blindStructures';
import seasonsRouter from './routes/seasons';
import payoutsRouter from './routes/payouts';
import dataRouter from './routes/data';
import invitationsRouter from './routes/invitations';
import playerSelfRouter from './routes/playerSelf';

const PORT = parseInt(process.env.PORT ?? '3001');
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

setIo(io);
initClockService(io);
registerSocketHandlers(io);

app.use(cors({ origin: '*' }));
app.use(express.json());

// Public routes — no auth required
app.use('/api/health', healthRouter);

// All POST / PUT / DELETE across /api requires admin EXCEPT:
// - /api/player/* (player self-service, handled by requireAuth inside the router)
// - /api/invitations (handles its own per-route auth)
app.use('/api', (req, res, next) => {
  if (req.method === 'GET') return next();
  if (req.path.startsWith('/player') || req.path.startsWith('/invitations')) return next();
  requireAdmin(req, res, next);
});

app.use('/api/clock', clockRouter);
app.use('/api/tournaments', tournamentsRouter);
app.use('/api/players', playersRouter);
app.use('/api/tables', tablesRouter);
app.use('/api/bounty', bountyRouter);
app.use('/api/blind-structures', blindStructuresRouter);
app.use('/api/seasons', seasonsRouter);
app.use('/api/payouts', payoutsRouter);
app.use('/api/data', dataRouter);

// Invitation routes: GET /:token is public; POST/DELETE use their own requireAdmin internally
app.use('/api/invitations', invitationsRouter);

// Player self-service routes: all require Firebase auth (any user, not admin-only)
app.use('/api/player', playerSelfRouter);

app.use(errorHandler);

async function start() {
  try {
    await runMigrations();
    httpServer.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
