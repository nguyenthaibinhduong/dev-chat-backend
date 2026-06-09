import { NestFactory } from '@nestjs/core';
import { AppModule } from './gateway.module';
import { ValidationPipe } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { GatewayRpcExceptionFilter, getEnvNumber } from '@myorg/common';
import { AuthenticatedSocketIoAdapter } from './adapter/socket-io.adapter'; // thêm dòng này
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';

function createCorsOptions(): CorsOptions {
  return {
    origin: true,
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
  console.log('🌐 CORS is open for all origins on HTTP API and Socket.IO');
  console.log(`🚀 Gateway running at http://localhost:${port}`);
}
bootstrap();
