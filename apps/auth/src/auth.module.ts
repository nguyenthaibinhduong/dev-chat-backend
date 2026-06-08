import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { getEnv, getEnvNumber } from '@myorg/common';
import { DatabaseModule } from '@myorg/database';
import { User } from '@myorg/entities';
import Redis from 'ioredis';
import path from 'path';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserRepository } from './repositories/user.repository';
import { GithubStrategy } from './strategies/github.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    DatabaseModule,
    TypeOrmModule.forFeature([User]),
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret:
          configService.get('ACCESS_SECRET_KEY') ||
          'nguyenthaibinhduongdevchatappaccess',
        signOptions: { expiresIn: '15m' },
      }),
    }),
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.get('SMTP_HOST'),
          port: config.get<number>('SMTP_PORT'),
          secure: config.get('SMTP_SECURE') === 'true',
          auth: {
            user: config.get('SMTP_USER'),
            pass: config.get('SMTP_PASS'),
          },
        },
        defaults: {
          from: config.get('SMTP_USER') || 'no-reply@example.com',
        },
        template: {
          dir: path.join(process.cwd(), 'apps', 'auth', 'src', 'templates'),
          adapter: new HandlebarsAdapter(),
          options: {
            strict: true,
          },
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    UserRepository,
    JwtStrategy,
    GithubStrategy,
    {
      provide: 'REDIS_CLIENT',
      useFactory: async (config: ConfigService) => {
        return new Redis({
          host: getEnv('REDIS_HOST', 'localhost'),
          port: getEnvNumber('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
        });
      },
    },
  ],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
