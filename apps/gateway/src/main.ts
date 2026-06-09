import { NestFactory } from '@nestjs/core';
import { AppModule } from './gateway.module';
import { ValidationPipe } from '@nestjs/common';
import { GatewayRpcExceptionFilter, getEnvNumber } from '@myorg/common';
import { AuthenticatedSocketIoAdapter } from './adapter/socket-io.adapter'; // thêm dòng này
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

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

  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

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
  app.useWebSocketAdapter(new AuthenticatedSocketIoAdapter(app));
  const port = getEnvNumber('GATEWAY_PORT', 3088);
  await app.listen(port);
  console.log(`🚀 Gateway running at http://localhost:${port}`);
}
bootstrap();
