import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplicationContext, UnauthorizedException } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { ServerOptions, Socket } from 'socket.io';
import { GatewayService } from '../gateway.service';
import { ChatSocketService } from '../socket.service'; // 👈 thêm service quản lý presence
import Redis from 'ioredis';

export type AuthSocket = Socket & { user?: { id: string } };

export class AuthenticatedSocketIoAdapter extends IoAdapter {
  private gatewayService: GatewayService;
  private chatSocketService: ChatSocketService;

  constructor(
    app: INestApplicationContext,
    private readonly corsOptions?: CorsOptions,
  ) {
    super(app);
    this.gatewayService = app.get(GatewayService);
    this.chatSocketService = app.get(ChatSocketService); // 👈 inject
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, {
      ...options,
      cors: this.corsOptions,
    });

    // middleware xác thực token
    server.use(async (socket: AuthSocket, next: any) => {
      try {
        const token =
          socket.handshake?.auth?.token ||
          socket.handshake?.headers['authorization']?.replace('Bearer ', '');

        if (!token) {
          return next(new UnauthorizedException('No token provided'));
        }

        const data: any = await this.gatewayService.exec('auth', 'verify_token', { token });
        const dataDecript = this.gatewayService.decryptIdsInData(data);

        if (!dataDecript?.data) {
          return next(new UnauthorizedException('Invalid token'));
        }

        // data.data.id đã là ID gốc (auth service đã decrypt)
        socket.user = { id: dataDecript.data.id }; // gán user từ token
        next();
      } catch (err) {
        next(err);
      }
    });

    // khi socket kết nối thành công
    server.on('connection', async (socket: AuthSocket) => {
      if (socket.user?.id) {
        await this.chatSocketService.markUserOnline(socket.user.id, socket.id);
      }

      socket.on('disconnect', async () => {
        if (socket.user?.id) {
          await this.chatSocketService.markUserOffline(socket.user.id);
        }
      });
    });

    return server;
  }
}
