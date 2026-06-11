// Tạo refresh_token và lưu vào user

import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UserRepository } from './repositories/user.repository';
import { RegisterDto, LoginDto } from 'apps/auth/src/dto/auth.dto';
import { JwtPayload } from 'apps/auth/src/interfaces/auth.interface';
import { RpcException } from '@nestjs/microservices';
import { User } from '@myorg/entities';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository, Not, ILike } from 'typeorm';
import { MailerService } from '@nestjs-modules/mailer';
import * as crypto from 'crypto';
import Redis from 'ioredis';

@Injectable()
export class AuthService {
  private readonly algorithm = 'aes-256-cbc';
  private encryptionKey: Buffer;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private userRepository: UserRepository,
    private jwtService: JwtService,
    private readonly mailerService: MailerService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {
    // Khởi tạo encryption key (giống gateway)
    const key = process.env.ID_ENCRYPTION_KEY || 'default-secret-key-32-chars-min';
    this.encryptionKey = crypto.scryptSync(key, 'salt', 32);
  }

  /**
   * Mã hóa ID (giống gateway service)
   */
  private encryptId(id: string | number): string {
    try {
      const text = String(id);
      const iv = crypto
        .createHash('md5')
        .update(text + process.env.ID_ENCRYPTION_KEY)
        .digest();
      
      const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const combined = iv.toString('hex') + ':' + encrypted;
      return 'ENC:' + Buffer.from(combined).toString('base64');
    } catch (err) {
      console.error('❌ Encrypt ID error:', err);
      return String(id);
    }
  }

  /**
   * Giải mã ID (giống gateway service)
   */
  private decryptId(encryptedId: string): string {
    try {
      if (!encryptedId || !encryptedId.startsWith('ENC:')) {
        return encryptedId;
      }

      const base64Data = encryptedId.substring(4);
      const combined = Buffer.from(base64Data, 'base64').toString('utf8');
      const parts = combined.split(':');
      
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (err) {
      console.error('❌ Decrypt ID error:', err);
      throw new RpcException({ status: 400, msg: 'ID không hợp lệ hoặc đã bị thay đổi' });
    }
  }

  private normalizeFrontendUrl(frontendUrl?: string): string {
    if (!frontendUrl) {
      throw new RpcException({
        msg: 'Missing frontend origin header',
        status: 400,
      });
    }
    return frontendUrl.replace(/\/+$/, '');
  }



  
  async searchUsers(
    user: any,
    params: { key: string; limit?: number },
  ): Promise<any[]> {

    const key = (params.key || '').trim();
    const limit = params.limit ?? 10;
    if (!key || !user || !user.id) return [];
    const users = await this.userRepo.find({
      where: [
        { username: ILike(`%${key}%`), id: Not(user.id) },
        { email: ILike(`%${key}%`), id: Not(user.id) },
      ],
      take: limit,
    });
    // Trả về thông tin cơ bản, loại bỏ trường nhạy cảm
    return users.map((u: User) => ({
      id: u.id,
      email: u.email,
      username: u.username,
    }));
  }

  async register(registerDto: RegisterDto, frontendUrl?: string): Promise<any> {
    const frontendBaseUrl = this.normalizeFrontendUrl(frontendUrl);
    const { frontendUrl: _ignoredFrontendUrl, ...userData } =
      registerDto as RegisterDto & { frontendUrl?: string };
    const existingUser = await this.userRepository.findByEmail(
      userData.email,
    );
    if (existingUser) {
      if (existingUser.provider === 'github' || existingUser.provider === 'google') {
        throw new RpcException({
          msg: `Tài khoản đã tồn tại dưới dạng đăng nhập bằng ${existingUser.provider}. Vui lòng đăng nhập bằng ${existingUser.provider}.`,
          status: 409,
        });
      }
      throw new RpcException({ msg: 'Email đã tồn tại', status: 409 });
    }

    const hashedPassword = await bcrypt.hash(userData.password, 10);

    const user: any = await this.userRepository.create({
      ...userData,
      password: hashedPassword,
    });

    //generate verification token, save to user
    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.verification_token = verificationToken;
    user.email_verified = false;
    await this.userRepository.save(user);

    //send verification email
    await this.sendVerificationEmail(user.email, frontendBaseUrl);

    // Mã hóa sub trước khi tạo JWT
    const payload: any = {
      sub: this.encryptId(user.id),
      email: user.email,
      username: user.username,
      role: user.role,
    };
    const access_token = this.jwtService.sign(payload);

    return {
      access_token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    };
  }

  async confirmEmail(token: string): Promise<any> {
    const user: any = await this.userRepository.findByVerificationToken(token);
    if (!user) {
      throw new RpcException({
        msg: 'Token xác nhận không hợp lệ',
        status: 400,
      });
    }
    user.email_verified = true;
    user.verification_token = null;
    await this.userRepository.save(user);
    return;
  }

  async sendVerificationEmail(email: string, frontendUrl?: string): Promise<any> {
    const frontendBaseUrl = this.normalizeFrontendUrl(frontendUrl);
    const user: any = await this.userRepository.findByEmail(email);
    if (!user)
      throw new RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
    if (user.email_verified)
      return { status: 200, msg: 'Email đã được xác thực' };

    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.verification_token = verificationToken;
    await this.userRepository.save(user);

    const frontendConfirmUrl = `${frontendBaseUrl}/auth/confirm-email?token=${verificationToken}&email=${user.email}`;
    await this.mailerService.sendMail({
      to: user.email,
      subject: 'Xác nhận email của bạn',
      template: 'confirmation',
      context: { name: user.username || 'User', url: frontendConfirmUrl },
    });

    return { status: 200, msg: 'Đã gửi lại email xác thực' };
  }

  async login(loginDto: LoginDto): Promise<any> {
    try {
      // 1. Tìm user
      console.log(`🔍 [LOGIN] Tìm user với email: ${loginDto.email}`);
      const user: any = await this.userRepository.findByEmail(loginDto.email);
      if (!user) {
        throw new RpcException({
          msg: 'Bạn chưa đăng ký tài khoản. Vui lòng đăng ký trước khi đăng nhập',
          status: 401,
        });
      }

      // 3. Kiểm tra email verified
      if (!user.email_verified) {
        throw new RpcException({
          msg: 'Vui lòng xác thực email trước khi đăng nhập',
          status: 401,
        });
      }

      // 4. Kiểm tra account active
      if (!user.isActive) {
        throw new RpcException({
          msg: 'Tài khoản đã bị vô hiệu hóa',
          status: 403,
        });
      }

      // 5. Kiểm tra password
      console.log('🔐 [LOGIN] Đang xác thực mật khẩu...');
      const isPasswordValid = await bcrypt.compare(
        loginDto.password,
        user.password,
      );
      if (!isPasswordValid) {
        throw new RpcException({
          msg: 'Tài khoản hoặc mật khẩu không đúng',
          status: 401,
        });
      }

      // 6. Tạo JWT tokens
      console.log('🎫 [LOGIN] Tạo access token và refresh token...');
      const payload: JwtPayload = {
        sub: this.encryptId(user.id),
        email: user.email,
        username: user.username,
        role: user.role,
        github_verified: user.github_verified,
        github_installation_id: user.github_installation_id || null,
      };
      const access_token = this.jwtService.sign(payload);
      const refresh_token = await this.generateAndSaverefresh_token(user);

      console.log(`✅ [LOGIN] Đăng nhập thành công cho user: ${user.email} (ID: ${user.id})`);

      return {
        access_token,
        refresh_token,
      };
    } catch (error: any) {
      if (error instanceof RpcException) {
        throw error;
      }

      console.error('❌ [LOGIN] Lỗi:', error?.message || error);
      throw new RpcException({
        msg: error?.message || 'Đã xảy ra lỗi trong quá trình đăng nhập',
        status: 500,
      });
    }
  }

  async validateToken(token: string): Promise<any> {
    try {
      const payload = this.jwtService.verify(token);
      
      // Giải mã sub từ JWT payload
      const userId = this.decryptId(payload.sub);
      const user: any = await this.userRepository.findById(userId);

      if (!user) {
        throw new RpcException({
          msg: 'Người dùng không tồn tại',
          status: 404,
        });
      }

      if (!user.isActive) {
        throw new RpcException({
          msg: 'Tài khoản đã bị vô hiệu hóa',
          status: 403,
        });
      }
      const userData = {
        id: user?.id,
        email: user?.email,
        username: user?.username,
        role: user?.role,
        github_verified: user.github_verified,
        github_installation_id: user.github_installation_id || null,
      };
      return userData;
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new RpcException({ msg: 'Token đã hết hạn', status: 409 });
      }
      throw new RpcException({ msg: 'Token không hợp lệ', status: 401 });
    }
  }

  async getProfile(userId: string): Promise<any> {
    const user: any = await this.userRepository.findById(userId);
    if (!user) {
      throw new RpcException({ msg: 'Không tìm thấy người dùng', status: 401 });
    }

    if (!user.isActive) {
      throw new RpcException({ msg: 'Tài khoản đã bị vô hiệu hóa', status: 403 });
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      email_verified: user.email_verified,
      github_verified: user.github_verified,
      github_installation_id: user.github_installation_id || null,
      avatar: user.avatar ?? user.github_avatar,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }
  
  private async generateAndSaverefresh_token(user: any): Promise<string> {
    const refresh_token = this.jwtService.sign(
      { sub: this.encryptId(user.id) },
      {
        expiresIn: '7d',
        secret:
          process.env.REFRESH_SECRET_KEY ||
          'nguyenthaibinhduongdevchatapprefresh',
      },
    );
    user.refresh_token = refresh_token;
    await this.userRepository.save(user);
    return refresh_token;
  }

  // Refresh token
  async refreshToken(refresh_token: string): Promise<any> {
    const payload: any = this.jwtService.verify(refresh_token, {
      secret:
        process.env.REFRESH_SECRET_KEY ||
        'nguyenthaibinhduongdevchatapprefresh',
    });
    
    // Giải mã sub từ JWT payload
    const userId = this.decryptId(payload.sub);
    const user: any = await this.userRepository.findById(userId);
    console.log('encrypted user id:', payload.sub);
    console.log('decrypted user id:', userId);
    console.log('user:', user);

    if (!user || user.refresh_token !== refresh_token) {
      throw new RpcException({
        msg: 'Refresh token không hợp lệ',
        status: 401,
      });
    }

    if (!user.isActive) {
      throw new RpcException({
        msg: 'Tài khoản đã bị vô hiệu hóa',
        status: 403,
      });
    }

    // 2. Tạo access_token mới
    // Mã hóa sub trước khi tạo JWT
    const payloadData: JwtPayload = {
      sub: this.encryptId(user.id),
      email: user.email,
      username: user.username,
      role: user.role,
      github_verified: user.github_verified,
      github_installation_id: user.github_installation_id || null,
    };

    console.log('payload:', payloadData);

    const access_token = this.jwtService.sign(payloadData);
    const new_refresh_token = await this.generateAndSaverefresh_token(user);

    // 4. Trả về token mới
    return {
      access_token: access_token ?? null,
      refresh_token: new_refresh_token ?? null,
    };
  }

  async updateProfile(
    userId: string,
    data: {
      username?: string;
      email?: string;
      github_verified?: boolean;
      github_installation_id?: string;
    },
  ): Promise<any> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
    }

    if (!user.isActive) {
      throw new RpcException({ msg: 'Tài khoản đã bị vô hiệu hóa', status: 403 });
    }

    // Chỉ cập nhật các trường hợp lệ
    if (data.username !== undefined) user.username = data.username;
    if (data.email !== undefined) user.email = data.email;
    if (data.github_verified !== undefined)
      user.github_verified = data.github_verified;
    if (data.github_installation_id !== undefined)
      user.github_installation_id = data.github_installation_id;

    await this.userRepository.save(user);

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      updated_at: user.updated_at,
      github_verified: user.github_verified,
    };
  }

  async getTokenUserData(userId: any): Promise<any> {
    const user: any = await this.userRepository.findById(userId);

    if (!user) {
      throw new RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
    }

    if (!user.isActive) {
      throw new RpcException({ msg: 'Tài khoản đã bị vô hiệu hóa', status: 403 });
    }

    // Mã hóa sub trước khi tạo JWT
    const payload: JwtPayload = {
      sub: this.encryptId(user.id),
      email: user.email,
      username: user.username,
      role: user.role,
      github_verified: user.github_verified,
      github_installation_id: user.github_installation_id || null,
    };
    const access_token = this.jwtService.sign(payload);
    const new_refresh_token = await this.generateAndSaverefresh_token(user);

    // 4. Trả về token mới
    return {
      access_token: access_token ?? null,
      refresh_token: new_refresh_token ?? null,
    };
  }

  //Verify Github Webhook Signature
  verifyWebhookSignature(signature: string, rawBody: Buffer | string): void {
    if (!signature) throw new UnauthorizedException('Missing signature');

    const expectedPrefix = 'sha256=';
    if (!signature.startsWith(expectedPrefix)) {
      throw new UnauthorizedException('Invalid signature format');
    }

    const payloadBuffer = Buffer.isBuffer(rawBody)
      ? rawBody
      : Buffer.from(rawBody || '', 'utf8');

    const secret = process.env.GITHUB_WEBHOOK_SECRET || 'my-webhook-secret';
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payloadBuffer);
    const digest = `${expectedPrefix}${hmac.digest('hex')}`;

    const sigBuffer = Buffer.from(signature, 'utf8');
    const digestBuffer = Buffer.from(digest, 'utf8');

    if (sigBuffer.length !== digestBuffer.length) {
      throw new UnauthorizedException('Invalid signature');
    }

    const valid = crypto.timingSafeEqual(digestBuffer, sigBuffer);

    console.log('Computed digest:', digest);
    console.log('Received signature:', signature);
    console.log('Signature valid:', valid);

    if (!valid) {
      throw new UnauthorizedException('Invalid signature');
    }
  }

  //Update password
  async updatePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<any> {
    const user: any = await this.userRepository.findById(userId);
    if (!user) {
      throw new RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
    }

    if (!user.isActive) {
      throw new RpcException({ msg: 'Tài khoản đã bị vô hiệu hóa', status: 403 });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      throw new RpcException({
        msg: 'Mật khẩu cũ không chính xác',
        status: 400,
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await this.userRepository.save(user);
    return { status: 200, msg: 'Cập nhật mật khẩu thành công' };
  }

  async CRUD(userId: any, data: any, method?: string): Promise<any> {
    const user: any = await this.userRepository.findById(userId);

    if (!user) {
      throw new RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
    }
    if (user.role !== 'admin') { 
      throw new RpcException({ msg: 'Không có quyền thực hiện hành động này', status: 403 });
    }


    switch(method) { 
      
      case 'stats': {
        // Lấy thống kê dashboard
        try {
          // 1. Đếm tổng số user
          const totalUsers = await this.userRepo.count();

          // 2. Đếm số user active
          const activeUsers = await this.userRepo.count({
            where: { isActive: true },
          });

          // 3. Đếm số user theo role
          const adminCount = await this.userRepo.count({
            where: { role: 'admin' },
          });

          const userCount = await this.userRepo.count({
            where: { role: 'user' },
          });

          // 4. Đếm số user có liên kết GitHub
          const githubLinkedCount = await this.userRepo.count({
            where: { github_verified: true },
          });

          // 5. Lấy số user online từ Redis
          let onlineCount = 0;
          try {
            const userStatusMap = await this.redis.hgetall('user_status');
            onlineCount = Object.values(userStatusMap).filter((statusStr) => {
              try {
                const status = JSON.parse(statusStr);
                return status.online === true;
              } catch {
                return false;
              }
            }).length;
          } catch (redisError) {
            console.error('Error fetching online users from Redis:', redisError);
            // Nếu Redis lỗi, trả về 0
          }

          // 6. Đếm số user mới trong 7 ngày gần đây
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          const newUsersLast7Days = await this.userRepo
            .createQueryBuilder('user')
            .where('user.created_at >= :date', { date: sevenDaysAgo })
            .getCount();

          // 7. Đếm số user đã verify email
          const emailVerifiedCount = await this.userRepo.count({
            where: { email_verified: true },
          });

          // 8. Lấy danh sách user online gần đây (top 10)
          let recentOnlineUsers:any[] = [];
          try {
            const qb = this.userRepo
              .createQueryBuilder('user')
              .select([
                'user.id',
                'user.username',
                'user.email',
                'user.avatar',
                'user.github_avatar',
              ])
              .orderBy('user.updated_at', 'DESC')
              .limit(10);

            const users = await qb.getMany();
            
            // Kiểm tra status online từ Redis
            const userStatusMap = await this.redis.hgetall('user_status');
            recentOnlineUsers = users.map((u:any) => {
              const statusStr = userStatusMap[u.id];
              let isOnline = false;
              let lastSeen = null;

              if (statusStr) {
                try {
                  const status = JSON.parse(statusStr);
                  isOnline = status.online === true;
                  lastSeen = status.lastSeen || null;
                } catch {}
              }

              return {
                id: u.id,
                username: u.username,
                email: u.email,
                avatar: u.avatar ?? u.github_avatar ?? null,
                isOnline,
                lastSeen,
              };
            });
          } catch (error) {
            console.error('Error fetching recent online users:', error);
          }

          return {
            overview: {
              totalUsers,
              activeUsers,
              inactiveUsers: totalUsers - activeUsers,
              onlineUsers: onlineCount,
            },
            usersByRole: {
              admin: adminCount,
              user: userCount,
            },
            integrations: {
              githubLinked: githubLinkedCount,
              emailVerified: emailVerifiedCount,
            },
            growth: {
              newUsersLast7Days,
            },
            recentOnlineUsers,
          };
        } catch (error) {
          console.error('Error fetching user stats:', error);
          throw new RpcException({
            msg: 'Không thể lấy thống kê người dùng',
            status: 500,
          });
        }
      }
      
      case 'create':
        // Tạo user mới
        const existingUser = await this.userRepository.findByEmail(
          data.email,
        );
        if (existingUser) {
          throw new RpcException({ msg: 'Email đã tồn tại', status: 409 });
        }
        const hashedPassword = await bcrypt.hash(data.password, 10);

        const newUser: any = await this.userRepository.create({
          ...data,
          password: hashedPassword,
        });
        await this.userRepository.save(newUser);
        break;
      case 'read-one': {
        // Đọc thông tin user
        const userToRead: any = await this.userRepository.findById(data.id);
        if (!userToRead) {
          throw new RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
        }
        
        // Đếm số repository của user (nếu có github_installation_id)
        let totalRepositories = 0;
        if (userToRead.github_installation_id) {
          const repoRepo = this.userRepo.manager.getRepository('repositories');
          totalRepositories = await repoRepo
            .createQueryBuilder('repo')
            .where('repo.userId = :userId', { userId: userToRead.id })
            .getCount();
        }
        
        return {
          id: userToRead.id,
          username: userToRead.username ?? null,
          email: userToRead.email,
          role: userToRead.role,
          avatar: userToRead.avatar ?? userToRead.github_avatar ?? null,
          github_avatar: userToRead.github_avatar ?? null,
          email_verified: !!userToRead.email_verified,
          github_verified: !!userToRead.github_verified,
          github_installation_id: userToRead.github_installation_id ?? null,
          github_user_id: userToRead.github_user_id ?? null,
          github_email: userToRead.github_email ?? null,
          totalRepositories,
          isActive: userToRead.isActive,
          created_at: userToRead.created_at,
          updated_at: userToRead.updated_at,
        };
      }
      case 'read-all': {
        // Hỗ trợ params:
        // data.keySearch?: string
        // data.limit?: number
        // data.page?: number
        // data.order?: 'newest' | 'oldest'
        // data.role?: 'admin' | 'user' | '' (empty = all)
        // data.isActive?: 'true' | 'false' | '' (empty = all)
        const keySearch = (data?.keySearch || '').toString().trim().toLowerCase();
        const limit = Math.max(1, Math.min(200, Number(data?.limit ?? 20)));
        const page = Math.max(1, Number(data?.page ?? 1));
        const order = data?.order === 'oldest' ? 'ASC' : 'DESC';
        
        // Xử lý filter role
        const roleFilter = data?.role && data.role !== '' ? data.role : undefined;
        
        // Xử lý filter isActive - chuyển string thành boolean
        let isActiveFilter: boolean | undefined = undefined;
        if (data?.isActive !== undefined && data.isActive !== '') {
          isActiveFilter = data.isActive === 'true' || data.isActive === true;
        }

        const qb = this.userRepo.createQueryBuilder('user');

        qb.select([
          'user.id',
          'user.username',
          'user.email',
          'user.role',
          'user.avatar',
          'user.github_avatar',
          'user.email_verified',
          'user.github_verified',
          'user.github_installation_id',
          'user.created_at',
          'user.updated_at',
          'user.isActive',
        ]);

        if (keySearch) {
          qb.andWhere(
            '(LOWER(user.username) LIKE :k OR LOWER(user.email) LIKE :k)',
            { k: `%${keySearch}%` },
          );
        }

        // Filter theo role
        if (roleFilter) {
          qb.andWhere('user.role = :role', { role: roleFilter });
        }

        // Filter theo isActive
        if (typeof isActiveFilter === 'boolean') {
          qb.andWhere('user.isActive = :isActive', { isActive: isActiveFilter });
        }

        qb.orderBy('user.created_at', order as 'ASC' | 'DESC');
        qb.addOrderBy('user.id', order as 'ASC' | 'DESC');
        qb.skip((page - 1) * limit).take(limit);

        const [items, total] = await qb.getManyAndCount();

        const formatted = items.map((u: any) => ({
          id: u.id,
          username: u.username ?? null,
          email: u.email,
          role: u.role,
          avatar: u.avatar ?? u.github_avatar ?? null,
          github_avatar: u.github_avatar ?? null,
          email_verified: !!u.email_verified,
          github_verified: !!u.github_verified,
          github_installation_id: u.github_installation_id ?? null,
          isActive: u.isActive,
          created_at: u.created_at,
          updated_at: u.updated_at,
        }));

        const hasMore = page * limit < total;

        return {
          items: formatted,
          total,
          page,
          limit,
          hasMore,
        };
      }
      case 'update':
        // Cập nhật thông tin user
        const userToUpdate: any = await this.userRepository.findById(data.userId);
        if (!userToUpdate) {
          throw new RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
        }
        // Chỉ cập nhật các trường hợp lệ
        if (data.username !== undefined) userToUpdate.username = data.username;
        if (data.email !== undefined) userToUpdate.email = data.email;
        if (data.github_verified !== undefined)
          userToUpdate.github_verified = data.github_verified;
        await this.userRepository.save(userToUpdate);
        break;
      case 'delete': {
        const userToDelete: any = await this.userRepository.findById(data.id);
        if (!userToDelete) {
          throw new RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
        }

        // Validations
        if (userToDelete.email === 'admin@example.com') {
          throw new RpcException({
            msg: 'Không thể xóa tài khoản root admin',
            status: 403,
          });
        }

        if (userToDelete.id === userId) {
          throw new RpcException({
            msg: 'Không thể xóa tài khoản của chính bạn',
            status: 403,
          });
        }

        try {
          // Sử dụng QueryRunner với TypeORM entities
          const queryRunner = this.userRepo.manager.connection.createQueryRunner();
          
          await queryRunner.connect();
          await queryRunner.startTransaction();

          try {
            // 1. Xóa channel memberships
            await queryRunner.manager
              .createQueryBuilder()
              .delete()
              .from('channel_members')
              .where('user_id = :userId', { userId: userToDelete.id })
              .execute();

            // 2. Xóa messages
            await queryRunner.manager
              .createQueryBuilder()
              .delete()
              .from('messages')
              .where('senderId = :userId', { userId: userToDelete.id })
              .execute();

            // 3. Update channels owner
            await queryRunner.manager
              .createQueryBuilder()
              .update('channels')
              .set({ owner: null })
              .where('owner.id = :userId', { userId: userToDelete.id })
              .execute();

            // 4. Xóa user
            await queryRunner.manager
              .createQueryBuilder()
              .delete()
              .from('users')
              .where('id = :id', { id: userToDelete.id })
              .execute(); 

            await queryRunner.commitTransaction();

            return {
              msg: 'Đã xóa người dùng thành công',
              userId: userToDelete.id,
            };
          } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
          } finally {
            await queryRunner.release();
          }
        } catch (error) {
          console.error('Error deleting user:', error);
          throw new RpcException({
            msg: 'Không thể xóa người dùng: ' + error,
            status: 500,
          });
        }
      }
      case 'toggle-active': {
        // data.userId required
        const targetUser: any = await this.userRepository.findById(data.id);
        if (!targetUser) {
          throw new RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
        }

        // Chỉ cho phép toggle với role 'user'
        if (String(targetUser.role) !== 'user') {
          throw new RpcException({
            msg: 'Chỉ có thể bật/tắt tài khoản có role "user"',
            status: 403,
          });
        }

        // Đảo trạng thái isActive
        targetUser.isActive = !targetUser.isActive;
        await this.userRepository.save(targetUser);

        return {
          msg: `Đã ${targetUser.isActive ? 'kích hoạt' : 'vô hiệu hóa'} tài khoản`,
          userId: targetUser.id,
          isActive: targetUser.isActive,
        };
      }
      case 'set-toggle-admin': {
        // data.id required
        const targetUser: any = await this.userRepository.findById(data.id);
        if (!targetUser) {
          throw new RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
        }

        // Không cho phép toggle admin cho root admin
        if (targetUser.email === 'admin@example.com') {
          throw new RpcException({
            msg: 'Không thể thay đổi quyền của tài khoản root admin',
            status: 403,
          });
        }

        // Đảo role giữa admin và user
        if (targetUser.role === 'admin') {
          targetUser.role = 'user';
        } else {
          targetUser.role = 'admin';
        }
        
        await this.userRepository.save(targetUser);

        return {
          msg: `Đã ${targetUser.role === 'admin' ? 'cấp quyền admin' : 'thu hồi quyền admin'} cho tài khoản`,
          userId: targetUser.id,
          role: targetUser.role,
        };
      }
        
      default:
        break;
    }
  }

  /**
   * Tạo mật khẩu ngẫu nhiên mạnh (12 ký tự)
   */
  private generateRandomPassword(length: number = 12): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*';
    const allChars = uppercase + lowercase + numbers + symbols;

    let password = '';
    
    // Đảm bảo có ít nhất 1 ký tự mỗi loại
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];

    // Thêm các ký tự ngẫu nhiên còn lại
    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Tạo OTP 6 số ngẫu nhiên
   */
  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Reset mật khẩu - 2 bước với giới hạn 3 lần nhập sai
   * Bước 1: Gửi OTP
   * Bước 2: Xác thực OTP và reset password
   */
  async resetPassword(
    email: string, 
    otp?: string,
    frontendUrl?: string,
  ): Promise<any> {
    try {
      // ============ BƯỚC 1: GỬI OTP ============
      if (!otp) {
        console.log('🔐 [RESET PASSWORD - STEP 1] Gửi OTP');
        
        // 1.1. Tìm user theo email
        console.log(`🔍 [RESET PASSWORD - STEP 1] Tìm user với email: ${email}`);
        const user: any = await this.userRepository.findByEmail(email);
        
        if (!user) {
          throw new RpcException({
            msg: 'Không tìm thấy tài khoản với email đã cung cấp',
            status: 404,
          });
        }

        // 1.3. Kiểm tra user có active không
        if (!user.isActive) {
          throw new RpcException({
            msg: 'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên',
            status: 403,
          });
        }

        // 1.4. Tạo OTP 6 số và thời gian hết hạn (5 phút)
        const otpCode = this.generateOTP();
        const otpExp = new Date();
        otpExp.setMinutes(otpExp.getMinutes() + 5); // OTP hết hạn sau 5 phút

        user.otpCode = otpCode;
        user.otpExp = otpExp;
        user.otpAttempts = 0; // Reset số lần thử về 0
        await this.userRepository.save(user);
        
        console.log(`🔑 [RESET PASSWORD - STEP 1] Đã tạo OTP: ${otpCode} (hết hạn: ${otpExp.toISOString()})`);

        // 1.5. Gửi email chứa OTP
        const currentDate = new Date().toLocaleDateString('vi-VN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        try {
          await this.mailerService.sendMail({
            to: user.email,
            subject: '🔐 Mã OTP đặt lại mật khẩu - DevChat',
            template: 'otp',
            context: {
              name: user.username || 'User',
              email: user.email,
              otpCode: otpCode,
              expiryMinutes: 5,
              currentDate: currentDate,
              supportEmail: process.env.SUPPORT_EMAIL || 'support@devchat.com',
            },
          });

          console.log(`📧 [RESET PASSWORD - STEP 1] Đã gửi OTP đến: ${user.email}`);
        } catch (emailError) {
          console.error(`❌ [RESET PASSWORD - STEP 1] Lỗi gửi email:`, emailError);
          throw new RpcException({
            msg: 'Không thể gửi email. Vui lòng thử lại sau',
            status: 500,
          });
        }

        // Tính thời gian hết hạn (timestamp)
        const expiresAt = otpExp.getTime();
        const expiresInSeconds = Math.floor((expiresAt - Date.now()) / 1000);

        return {
          step: 1,
          email: user.email,
          expiresAt: expiresAt,
          expiresInSeconds: expiresInSeconds,
          maxAttempts: 3,
          remainingAttempts: 3,
        };
      }

      // ============ BƯỚC 2: XÁC THỰC OTP VÀ RESET PASSWORD (KHÔNG CẦN CAPTCHA) ============
      console.log('🔐 [RESET PASSWORD - STEP 2] Xác thực OTP và reset password (không cần CAPTCHA)');

      // 2.1. Validate OTP format (6 số)
      if (!/^\d{6}$/.test(otp)) {
        throw new RpcException({
          msg: 'Mã OTP không hợp lệ. OTP phải là 6 chữ số',
          status: 400,
        });
      }

      // 2.2. Tìm user theo email
      console.log(`🔍 [RESET PASSWORD - STEP 2] Tìm user với email: ${email}`);
      const user: any = await this.userRepository.findByEmail(email);
      
      if (!user) {
        throw new RpcException({
          msg: 'Không tìm thấy tài khoản với email đã cung cấp',
          status: 404,
        });
      }

      // 2.3. Kiểm tra user có active không
      if (!user.isActive) {
        throw new RpcException({
          msg: 'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên',
          status: 403,
        });
      }

      // 2.4. Kiểm tra OTP có tồn tại không
      if (!user.otpCode || !user.otpExp) {
        throw new RpcException({
          msg: 'Không tìm thấy mã OTP. Vui lòng yêu cầu gửi lại OTP',
          status: 400,
        });
      }

      // 2.5. Kiểm tra OTP hết hạn chưa
      const now = new Date();
      if (now > user.otpExp) {
        // Xóa OTP đã hết hạn
        user.otpCode = null;
        user.otpExp = null;
        user.otpAttempts = 0;
        await this.userRepository.save(user);
        
        throw new RpcException({
          msg: 'Mã OTP đã hết hạn. Vui lòng yêu cầu gửi lại OTP',
          status: 400,
        });
      }

      // 2.6. Kiểm tra số lần thử (tối đa 3 lần)
      if (user.otpAttempts >= 3) {
        // Xóa OTP khi vượt quá số lần thử
        user.otpCode = null;
        user.otpExp = null;
        user.otpAttempts = 0;
        await this.userRepository.save(user);
        
        throw new RpcException({
          msg: 'Bạn đã nhập sai mã OTP quá 3 lần. Vui lòng yêu cầu gửi lại OTP mới',
          status: 429,
        });
      }

      // 2.7. Kiểm tra OTP có khớp không
      if (user.otpCode !== otp) {
        // Tăng số lần thử sai
        user.otpAttempts = (user.otpAttempts || 0) + 1;
        const remainingAttempts = 3 - user.otpAttempts;
        await this.userRepository.save(user);
        
        console.log(`❌ [RESET PASSWORD - STEP 2] OTP sai (${user.otpAttempts}/3)`);
        
        throw new RpcException({
          msg: `Mã OTP không chính xác. Bạn còn ${remainingAttempts} lần thử`,
          status: 400,
          data: {
            remainingAttempts: remainingAttempts,
            maxAttempts: 3
          }
        });
      }

      console.log('✅ [RESET PASSWORD - STEP 2] OTP hợp lệ');

      // 2.8. Tạo mật khẩu ngẫu nhiên (12 ký tự)
      const loginUrl = `${this.normalizeFrontendUrl(frontendUrl)}/auth/login`;
      const newPassword = this.generateRandomPassword(12);
      console.log(`🔑 [RESET PASSWORD - STEP 2] Đã tạo mật khẩu mới cho user: ${user.email}`);

      // 2.9. Hash password mới
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      user.password = hashedPassword;
      
      // 2.10. Xóa OTP, reset attempts và refresh token (force logout)
      user.otpCode = null;
      user.otpExp = null;
      user.otpAttempts = 0;
      user.refresh_token = null;
      
      await this.userRepository.save(user);
      console.log(`💾 [RESET PASSWORD - STEP 2] Đã cập nhật mật khẩu mới vào database`);

      // 2.11. Gửi email chứa mật khẩu mới
      const currentDate = new Date().toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      try {
        await this.mailerService.sendMail({
          to: user.email,
          subject: '🔐 Đặt lại mật khẩu - DevChat',
          template: 'resetpassword',
          context: {
            name: user.username || 'User',
            email: user.email,
            newPassword: newPassword,
            loginUrl: loginUrl,
            currentDate: currentDate,
            supportEmail: process.env.SUPPORT_EMAIL || 'support@devchat.com',
          },
        });

        console.log(`📧 [RESET PASSWORD - STEP 2] Đã gửi email mật khẩu mới đến: ${user.email}`);
      } catch (emailError) {
        console.error(`❌ [RESET PASSWORD - STEP 2] Lỗi gửi email:`, emailError);
        throw new RpcException({
          msg: 'Không thể gửi email. Vui lòng thử lại sau',
          status: 500,
        });
      }

      return {
        step: 2,
        email: user.email,
      };

    } catch (error: any) {
      if (error instanceof RpcException) {
        throw error;
      }

      console.error('❌ [RESET PASSWORD] Lỗi:', error?.message || error);
      throw new RpcException({
        msg: error?.message || 'Đã xảy ra lỗi trong quá trình đặt lại mật khẩu',
        status: 500,
      });
    }
  }
}
