import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

export async function createApp() {
  // Disable Nest's default 100kb body parser and register our own with a generous limit — attachments
  // (job photos) are uploaded as base64 JSON, which easily exceeds 100kb. Card #21 / mobile photos.
  const app = await NestFactory.create(AppModule, { bufferLogs: false, bodyParser: false });
  app.use(json({ limit: '20mb' }));
  app.use(urlencoded({ extended: true, limit: '20mb' }));
  app.setGlobalPrefix('api/v1');
  // DEV-ONLY permissive CORS so the mobile app (web target / simulator) can reach the API from a browser
  // origin during local development. Gated: never enabled in production. Native builds don't need CORS.
  if (process.env.DEV_LOGIN_ENABLED === 'true' && process.env.NODE_ENV !== 'production') {
    app.enableCors({ origin: true, credentials: true });
  }
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true, // reject unknown fields (architecture: validate every input)
      transform: true,
    }),
  );
  return app;
}

async function bootstrap() {
  const app = await createApp();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`OneStack API listening on :${port} (prefix /api/v1)`);
}

// Only auto-listen when run directly (tests import createApp instead).
if (require.main === module) {
  void bootstrap();
}
