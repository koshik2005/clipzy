import { config } from './config.js';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import { createApp } from './app.js';

await migrate(); // schema is idempotent; keeps first deploys zero-touch
const server = createApp().listen(config.PORT, () => {
  console.log(`API listening on :${config.PORT} (${config.NODE_ENV}, storage=${config.STORAGE_DRIVER})`);
});

const shutdown = () => {
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
