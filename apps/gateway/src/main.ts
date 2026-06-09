import { NestFactory } from '@nestjs/core';
import { AppModule } from './gateway.module';
import { ValidationPipe } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { GatewayRpcExceptionFilter, getEnvNumber } from '@myorg/common';
import { AuthenticatedSocketIoAdapter } from './adapter/socket-io.adapter'; // thêm dòng này
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';

function getCorsOrigins() {
  return Array.from(
    new Set(
      [process.env.CORS_ORIGINS, process.env.FE_URL]
        .flatMap((value) => (value ?? '').split(','))
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  );
}

function createCorsOptions(): CorsOptions {
  const allowedOrigins = getCorsOrigins();
  const allowLocalhost = process.env.NODE_ENV !== 'production';

  return {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
        callback(null, true);
        return;
      }

      const isAllowedLocalhost =
        allowLocalhost && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

      callback(null, allowedOrigins.includes(origin) || isAllowedLocalhost);
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    credentials: true,
    optionsSuccessStatus: 204,
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const corsOptions = createCorsOptions();

  app.use(cookieParser());

  app.useGlobalFilters(new GatewayRpcExceptionFilter());
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors(corsOptions);

  app.use(
    '/v1/api/github-app/webhook',
    bodyParser.json({
      verify: (req: any, res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(bodyParser.json());

  // ⚡ cấu hình Socket.IO adapter có xác thực JWT
  app.useWebSocketAdapter(new AuthenticatedSocketIoAdapter(app, corsOptions));
  const port = getEnvNumber('GATEWAY_PORT', 3088);
  await app.listen(port);
  console.log(`🚀 Gateway running at http://localhost:${port}`);
}
bootstrap();
