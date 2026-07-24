import { app } from './app.js';
import { env } from './config/env.js';
import {
  logServerShutdownFailure,
  logServerShutdownStarted,
  logServerStarted,
  logServerStartFailure,
  logServerStopped,
} from './services/logger.service.js';

const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 10_000;

const server = app.listen(env.port, env.host);
let shutdownStarted = false;

server.on('listening', () => {
  logServerStarted({
    host: env.host,
    port: env.port,
    environment: env.nodeEnv,
  });
});

server.on('error', (error) => {
  logServerStartFailure(error);
  process.exitCode = 1;
});

function shutDown(signal: NodeJS.Signals): void {
  if (shutdownStarted) {
    return;
  }

  shutdownStarted = true;
  logServerShutdownStarted({ signal });

  let shutdownTimedOut = false;
  const shutdownTimeout = setTimeout(() => {
    shutdownTimedOut = true;
    process.exitCode = 1;
    logServerShutdownFailure(
      { signal },
      new Error(`Graceful shutdown exceeded ${GRACEFUL_SHUTDOWN_TIMEOUT_MS}ms.`),
    );
    server.closeAllConnections();
  }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);

  shutdownTimeout.unref();

  server.close((error) => {
    clearTimeout(shutdownTimeout);

    if (shutdownTimedOut) {
      return;
    }

    if (error !== undefined) {
      process.exitCode = 1;
      logServerShutdownFailure({ signal }, error);
      return;
    }

    logServerStopped({ signal });
  });
}

process.once('SIGTERM', () => {
  shutDown('SIGTERM');
});
process.once('SIGINT', () => {
  shutDown('SIGINT');
});
