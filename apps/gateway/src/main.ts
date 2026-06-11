import { NestFactory } from '@nestjs/core';
import { AppModule } from './gateway.module';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { GatewayRpcExceptionFilter, getEnvNumber } from '@myorg/common';
import { AuthenticatedSocketIoAdapter } from './adapter/socket-io.adapter'; // thêm dòng này
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';

function setupOAuthCallbackAliases(app: INestApplication) {
  const server = app.getHttpAdapter().getInstance();

  server.get('/auth/api/v1/google-oauth/callback', (req: any, res: any) => {
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    return res.redirect(307, `/v1/api/auth/google-oauth/callback${query}`);
  });
}

function createCorsOptions(): CorsOptions {
  return {
    origin: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    credentials: true,
    optionsSuccessStatus: 204,
  };
}

function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('DevChat API')
    .setDescription('HTTP gateway API for auth, chat, uploads, GitHub integration, and notifications.')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    ignoreGlobalPrefix: false,
  });

  SwaggerModule.setup('v1/docs', app, document, {
    jsonDocumentUrl: '/v1/docs-json',
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
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
  setupSwagger(app);
  setupOAuthCallbackAliases(app);

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
