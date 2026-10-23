import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { readAllowedOrigins } from './common/cors/allowed-origins';

const DEFAULT_API_PORT = 3001;

export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: readAllowedOrigins(process.env['CORS_ORIGINS']),
  });
}

export async function createApiApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  // Not enableShutdownHooks: Nest re-emits the signal via process.kill, which is a
  // no-op when Node is PID 1 in a container — the kernel ignores the re-emitted signal
  // and the process hangs until SIGKILL. Explicit handlers plus process.exit(0) work
  // in both bare-metal and container PID 1 environments.
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
  return app;
}

async function bootstrap(): Promise<void> {
  const app = await createApiApp();
  const rawPort = process.env['PORT'];
  const port = rawPort !== undefined ? parseInt(rawPort, 10) : DEFAULT_API_PORT;
  await app.listen(port);
}

if (require.main === module) {
  void bootstrap();
}
