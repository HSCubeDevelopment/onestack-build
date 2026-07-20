import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { readWorkshopFromEnv } from './time-clock/geofence';

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
  logWorkshopFence();
}

/**
 * Print the check-in fence at boot, and shout if the config was rejected.
 *
 * A bad WORKSHOP_* value falls back to the default rather than crashing — refusing to start would take
 * the whole shop offline over a typo. But a silent fallback is how you end up debugging "the geofence
 * ignores my settings" a fortnight later, so it is stated on every boot either way.
 */
function logWorkshopFence() {
  const { fence, problems } = readWorkshopFromEnv();
  for (const problem of problems) {
    // eslint-disable-next-line no-console
    console.warn(`⚠️  Geofence config ignored: ${problem}`);
  }
  // eslint-disable-next-line no-console
  console.log(
    `Check-in fence: ${fence.label} @ ${fence.latitude}, ${fence.longitude} ±${fence.radiusMetres} m` +
      (problems.length ? ' (USING DEFAULTS — see warnings above)' : ''),
  );
}

// Only auto-listen when run directly (tests import createApp instead).
if (require.main === module) {
  void bootstrap();
}
