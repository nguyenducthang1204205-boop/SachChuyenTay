import { bootstrap } from "./bootstrap.js";
import { loadDotenv } from "./config/dotenv.js";
import { loadConfig } from "./config/env.js";

loadDotenv();
const config = loadConfig();
const { app, container, database } = await bootstrap(config);
const { logger } = container;

const server = app.listen(config.PORT, config.HOST, () => {
  logger.info(`API sẵn sàng tại http://localhost:${config.PORT} (env=${config.NODE_ENV}, db=${database.driver})`);
});

/* ---- Graceful shutdown: ngừng nhận request mới, chờ request đang chạy, đóng DB ---- */
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down…");

  const forceExit = setTimeout(() => {
    logger.error("Shutdown timeout — forcing exit");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async (err) => {
    if (err) logger.error({ err }, "Error while closing HTTP server");
    await database.close().catch((e: unknown) => logger.error({ err: e }, "Error while closing database"));
    process.exit(err ? 1 : 0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => logger.error({ err: reason }, "Unhandled promise rejection"));
