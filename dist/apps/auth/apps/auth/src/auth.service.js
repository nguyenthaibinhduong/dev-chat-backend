"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const bcrypt = __importStar(require("bcryptjs"));
const user_repository_1 = require("./repositories/user.repository");
const microservices_1 = require("@nestjs/microservices");
const entities_1 = require("../../../libs/entities/src");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const mailer_1 = require("@nestjs-modules/mailer");
const crypto = __importStar(require("crypto"));
const ioredis_1 = __importDefault(require("ioredis"));
let AuthService = class AuthService {
    constructor(userRepo, userRepository, jwtService, mailerService, redis) {
        this.userRepo = userRepo;
        this.userRepository = userRepository;
        this.jwtService = jwtService;
        this.mailerService = mailerService;
        this.redis = redis;
        this.algorithm = 'aes-256-cbc';
        const key = process.env.ID_ENCRYPTION_KEY || 'default-secret-key-32-chars-min';
        this.encryptionKey = crypto.scryptSync(key, 'salt', 32);
    }
    encryptId(id) {
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
        }
        catch (err) {
            console.error('❌ Encrypt ID error:', err);
            return String(id);
        }
    }
    decryptId(encryptedId) {
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
        }
        catch (err) {
            console.error('❌ Decrypt ID error:', err);
            throw new microservices_1.RpcException({ status: 400, msg: 'ID không hợp lệ hoặc đã bị thay đổi' });
        }
    }
    normalizeFrontendUrl(frontendUrl) {
        if (!frontendUrl) {
            throw new microservices_1.RpcException({
                msg: 'Missing frontend origin header',
                status: 400,
            });
        }
        return frontendUrl.replace(/\/+$/, '');
    }
    async searchUsers(user, params) {
        var _a;
        const key = (params.key || '').trim();
        const limit = (_a = params.limit) !== null && _a !== void 0 ? _a : 10;
        if (!key || !user || !user.id)
            return [];
        const users = await this.userRepo.find({
            where: [
                { username: (0, typeorm_2.ILike)(`%${key}%`), id: (0, typeorm_2.Not)(user.id) },
                { email: (0, typeorm_2.ILike)(`%${key}%`), id: (0, typeorm_2.Not)(user.id) },
            ],
            take: limit,
        });
        return users.map((u) => ({
            id: u.id,
            email: u.email,
            username: u.username,
        }));
    }
    async register(registerDto, frontendUrl) {
        const frontendBaseUrl = this.normalizeFrontendUrl(frontendUrl);
        const { frontendUrl: _ignoredFrontendUrl, ...userData } = registerDto;
        const existingUser = await this.userRepository.findByEmail(userData.email);
        if (existingUser) {
            if (existingUser.provider === 'github' || existingUser.provider === 'google') {
                throw new microservices_1.RpcException({
                    msg: `Tài khoản đã tồn tại dưới dạng đăng nhập bằng ${existingUser.provider}. Vui lòng đăng nhập bằng ${existingUser.provider}.`,
                    status: 409,
                });
            }
            throw new microservices_1.RpcException({ msg: 'Email đã tồn tại', status: 409 });
        }
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        const user = await this.userRepository.create({
            ...userData,
            password: hashedPassword,
        });
        const verificationToken = crypto.randomBytes(32).toString('hex');
        user.verification_token = verificationToken;
        user.email_verified = false;
        await this.userRepository.save(user);
        await this.sendVerificationEmail(user.email, frontendBaseUrl);
        const payload = {
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
    async confirmEmail(token) {
        const user = await this.userRepository.findByVerificationToken(token);
        if (!user) {
            throw new microservices_1.RpcException({
                msg: 'Token xác nhận không hợp lệ',
                status: 400,
            });
        }
        user.email_verified = true;
        user.verification_token = null;
        await this.userRepository.save(user);
        return;
    }
    async sendVerificationEmail(email, frontendUrl) {
        const frontendBaseUrl = this.normalizeFrontendUrl(frontendUrl);
        const user = await this.userRepository.findByEmail(email);
        if (!user)
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
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
    async login(loginDto) {
        try {
            console.log(`🔍 [LOGIN] Tìm user với email: ${loginDto.email}`);
            const user = await this.userRepository.findByEmail(loginDto.email);
            if (!user) {
                throw new microservices_1.RpcException({
                    msg: 'Bạn chưa đăng ký tài khoản. Vui lòng đăng ký trước khi đăng nhập',
                    status: 401,
                });
            }
            if (!user.email_verified) {
                throw new microservices_1.RpcException({
                    msg: 'Vui lòng xác thực email trước khi đăng nhập',
                    status: 401,
                });
            }
            if (!user.isActive) {
                throw new microservices_1.RpcException({
                    msg: 'Tài khoản đã bị vô hiệu hóa',
                    status: 403,
                });
            }
            console.log('🔐 [LOGIN] Đang xác thực mật khẩu...');
            const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
            if (!isPasswordValid) {
                throw new microservices_1.RpcException({
                    msg: 'Tài khoản hoặc mật khẩu không đúng',
                    status: 401,
                });
            }
            console.log('🎫 [LOGIN] Tạo access token và refresh token...');
            const payload = {
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
        }
        catch (error) {
            if (error instanceof microservices_1.RpcException) {
                throw error;
            }
            console.error('❌ [LOGIN] Lỗi:', (error === null || error === void 0 ? void 0 : error.message) || error);
            throw new microservices_1.RpcException({
                msg: (error === null || error === void 0 ? void 0 : error.message) || 'Đã xảy ra lỗi trong quá trình đăng nhập',
                status: 500,
            });
        }
    }
    async validateToken(token) {
        try {
            const payload = this.jwtService.verify(token);
            const userId = this.decryptId(payload.sub);
            const user = await this.userRepository.findById(userId);
            if (!user) {
                throw new microservices_1.RpcException({
                    msg: 'Người dùng không tồn tại',
                    status: 404,
                });
            }
            if (!user.isActive) {
                throw new microservices_1.RpcException({
                    msg: 'Tài khoản đã bị vô hiệu hóa',
                    status: 403,
                });
            }
            const userData = {
                id: user === null || user === void 0 ? void 0 : user.id,
                email: user === null || user === void 0 ? void 0 : user.email,
                username: user === null || user === void 0 ? void 0 : user.username,
                role: user === null || user === void 0 ? void 0 : user.role,
                github_verified: user.github_verified,
                github_installation_id: user.github_installation_id || null,
            };
            return userData;
        }
        catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new microservices_1.RpcException({ msg: 'Token đã hết hạn', status: 409 });
            }
            throw new microservices_1.RpcException({ msg: 'Token không hợp lệ', status: 401 });
        }
    }
    async getProfile(userId) {
        var _a;
        const user = await this.userRepository.findById(userId);
        if (!user) {
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy người dùng', status: 401 });
        }
        if (!user.isActive) {
            throw new microservices_1.RpcException({ msg: 'Tài khoản đã bị vô hiệu hóa', status: 403 });
        }
        return {
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role,
            email_verified: user.email_verified,
            github_verified: user.github_verified,
            github_installation_id: user.github_installation_id || null,
            avatar: (_a = user.avatar) !== null && _a !== void 0 ? _a : user.github_avatar,
            created_at: user.created_at,
            updated_at: user.updated_at,
        };
    }
    async generateAndSaverefresh_token(user) {
        const refresh_token = this.jwtService.sign({ sub: this.encryptId(user.id) }, {
            expiresIn: '7d',
            secret: process.env.REFRESH_SECRET_KEY ||
                'nguyenthaibinhduongdevchatapprefresh',
        });
        user.refresh_token = refresh_token;
        await this.userRepository.save(user);
        return refresh_token;
    }
    async refreshToken(refresh_token) {
        const payload = this.jwtService.verify(refresh_token, {
            secret: process.env.REFRESH_SECRET_KEY ||
                'nguyenthaibinhduongdevchatapprefresh',
        });
        const userId = this.decryptId(payload.sub);
        const user = await this.userRepository.findById(userId);
        console.log('encrypted user id:', payload.sub);
        console.log('decrypted user id:', userId);
        console.log('user:', user);
        if (!user || user.refresh_token !== refresh_token) {
            throw new microservices_1.RpcException({
                msg: 'Refresh token không hợp lệ',
                status: 401,
            });
        }
        if (!user.isActive) {
            throw new microservices_1.RpcException({
                msg: 'Tài khoản đã bị vô hiệu hóa',
                status: 403,
            });
        }
        const payloadData = {
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
        return {
            access_token: access_token !== null && access_token !== void 0 ? access_token : null,
            refresh_token: new_refresh_token !== null && new_refresh_token !== void 0 ? new_refresh_token : null,
        };
    }
    async updateProfile(userId, data) {
        const user = await this.userRepository.findById(userId);
        if (!user) {
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
        }
        if (!user.isActive) {
            throw new microservices_1.RpcException({ msg: 'Tài khoản đã bị vô hiệu hóa', status: 403 });
        }
        if (data.username !== undefined)
            user.username = data.username;
        if (data.email !== undefined)
            user.email = data.email;
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
    async getTokenUserData(userId) {
        const user = await this.userRepository.findById(userId);
        if (!user) {
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
        }
        if (!user.isActive) {
            throw new microservices_1.RpcException({ msg: 'Tài khoản đã bị vô hiệu hóa', status: 403 });
        }
        const payload = {
            sub: this.encryptId(user.id),
            email: user.email,
            username: user.username,
            role: user.role,
            github_verified: user.github_verified,
            github_installation_id: user.github_installation_id || null,
        };
        const access_token = this.jwtService.sign(payload);
        const new_refresh_token = await this.generateAndSaverefresh_token(user);
        return {
            access_token: access_token !== null && access_token !== void 0 ? access_token : null,
            refresh_token: new_refresh_token !== null && new_refresh_token !== void 0 ? new_refresh_token : null,
        };
    }
    verifyWebhookSignature(signature, rawBody) {
        if (!signature)
            throw new common_1.UnauthorizedException('Missing signature');
        const expectedPrefix = 'sha256=';
        if (!signature.startsWith(expectedPrefix)) {
            throw new common_1.UnauthorizedException('Invalid signature format');
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
            throw new common_1.UnauthorizedException('Invalid signature');
        }
        const valid = crypto.timingSafeEqual(digestBuffer, sigBuffer);
        console.log('Computed digest:', digest);
        console.log('Received signature:', signature);
        console.log('Signature valid:', valid);
        if (!valid) {
            throw new common_1.UnauthorizedException('Invalid signature');
        }
    }
    async updatePassword(userId, oldPassword, newPassword) {
        const user = await this.userRepository.findById(userId);
        if (!user) {
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
        }
        if (!user.isActive) {
            throw new microservices_1.RpcException({ msg: 'Tài khoản đã bị vô hiệu hóa', status: 403 });
        }
        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            throw new microservices_1.RpcException({
                msg: 'Mật khẩu cũ không chính xác',
                status: 400,
            });
        }
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await this.userRepository.save(user);
        return { status: 200, msg: 'Cập nhật mật khẩu thành công' };
    }
    async CRUD(userId, data, method) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const user = await this.userRepository.findById(userId);
        if (!user) {
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
        }
        if (user.role !== 'admin') {
            throw new microservices_1.RpcException({ msg: 'Không có quyền thực hiện hành động này', status: 403 });
        }
        switch (method) {
            case 'stats': {
                try {
                    const totalUsers = await this.userRepo.count();
                    const activeUsers = await this.userRepo.count({
                        where: { isActive: true },
                    });
                    const adminCount = await this.userRepo.count({
                        where: { role: 'admin' },
                    });
                    const userCount = await this.userRepo.count({
                        where: { role: 'user' },
                    });
                    const githubLinkedCount = await this.userRepo.count({
                        where: { github_verified: true },
                    });
                    let onlineCount = 0;
                    try {
                        const userStatusMap = await this.redis.hgetall('user_status');
                        onlineCount = Object.values(userStatusMap).filter((statusStr) => {
                            try {
                                const status = JSON.parse(statusStr);
                                return status.online === true;
                            }
                            catch {
                                return false;
                            }
                        }).length;
                    }
                    catch (redisError) {
                        console.error('Error fetching online users from Redis:', redisError);
                    }
                    const sevenDaysAgo = new Date();
                    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                    const newUsersLast7Days = await this.userRepo
                        .createQueryBuilder('user')
                        .where('user.created_at >= :date', { date: sevenDaysAgo })
                        .getCount();
                    const emailVerifiedCount = await this.userRepo.count({
                        where: { email_verified: true },
                    });
                    let recentOnlineUsers = [];
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
                        const userStatusMap = await this.redis.hgetall('user_status');
                        recentOnlineUsers = users.map((u) => {
                            var _a, _b;
                            const statusStr = userStatusMap[u.id];
                            let isOnline = false;
                            let lastSeen = null;
                            if (statusStr) {
                                try {
                                    const status = JSON.parse(statusStr);
                                    isOnline = status.online === true;
                                    lastSeen = status.lastSeen || null;
                                }
                                catch { }
                            }
                            return {
                                id: u.id,
                                username: u.username,
                                email: u.email,
                                avatar: (_b = (_a = u.avatar) !== null && _a !== void 0 ? _a : u.github_avatar) !== null && _b !== void 0 ? _b : null,
                                isOnline,
                                lastSeen,
                            };
                        });
                    }
                    catch (error) {
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
                }
                catch (error) {
                    console.error('Error fetching user stats:', error);
                    throw new microservices_1.RpcException({
                        msg: 'Không thể lấy thống kê người dùng',
                        status: 500,
                    });
                }
            }
            case 'create':
                const existingUser = await this.userRepository.findByEmail(data.email);
                if (existingUser) {
                    throw new microservices_1.RpcException({ msg: 'Email đã tồn tại', status: 409 });
                }
                const hashedPassword = await bcrypt.hash(data.password, 10);
                const newUser = await this.userRepository.create({
                    ...data,
                    password: hashedPassword,
                });
                await this.userRepository.save(newUser);
                break;
            case 'read-one': {
                const userToRead = await this.userRepository.findById(data.id);
                if (!userToRead) {
                    throw new microservices_1.RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
                }
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
                    username: (_a = userToRead.username) !== null && _a !== void 0 ? _a : null,
                    email: userToRead.email,
                    role: userToRead.role,
                    avatar: (_c = (_b = userToRead.avatar) !== null && _b !== void 0 ? _b : userToRead.github_avatar) !== null && _c !== void 0 ? _c : null,
                    github_avatar: (_d = userToRead.github_avatar) !== null && _d !== void 0 ? _d : null,
                    email_verified: !!userToRead.email_verified,
                    github_verified: !!userToRead.github_verified,
                    github_installation_id: (_e = userToRead.github_installation_id) !== null && _e !== void 0 ? _e : null,
                    github_user_id: (_f = userToRead.github_user_id) !== null && _f !== void 0 ? _f : null,
                    github_email: (_g = userToRead.github_email) !== null && _g !== void 0 ? _g : null,
                    totalRepositories,
                    isActive: userToRead.isActive,
                    created_at: userToRead.created_at,
                    updated_at: userToRead.updated_at,
                };
            }
            case 'read-all': {
                const keySearch = ((data === null || data === void 0 ? void 0 : data.keySearch) || '').toString().trim().toLowerCase();
                const limit = Math.max(1, Math.min(200, Number((_h = data === null || data === void 0 ? void 0 : data.limit) !== null && _h !== void 0 ? _h : 20)));
                const page = Math.max(1, Number((_j = data === null || data === void 0 ? void 0 : data.page) !== null && _j !== void 0 ? _j : 1));
                const order = (data === null || data === void 0 ? void 0 : data.order) === 'oldest' ? 'ASC' : 'DESC';
                const roleFilter = (data === null || data === void 0 ? void 0 : data.role) && data.role !== '' ? data.role : undefined;
                let isActiveFilter = undefined;
                if ((data === null || data === void 0 ? void 0 : data.isActive) !== undefined && data.isActive !== '') {
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
                    qb.andWhere('(LOWER(user.username) LIKE :k OR LOWER(user.email) LIKE :k)', { k: `%${keySearch}%` });
                }
                if (roleFilter) {
                    qb.andWhere('user.role = :role', { role: roleFilter });
                }
                if (typeof isActiveFilter === 'boolean') {
                    qb.andWhere('user.isActive = :isActive', { isActive: isActiveFilter });
                }
                qb.orderBy('user.created_at', order);
                qb.addOrderBy('user.id', order);
                qb.skip((page - 1) * limit).take(limit);
                const [items, total] = await qb.getManyAndCount();
                const formatted = items.map((u) => {
                    var _a, _b, _c, _d, _e;
                    return ({
                        id: u.id,
                        username: (_a = u.username) !== null && _a !== void 0 ? _a : null,
                        email: u.email,
                        role: u.role,
                        avatar: (_c = (_b = u.avatar) !== null && _b !== void 0 ? _b : u.github_avatar) !== null && _c !== void 0 ? _c : null,
                        github_avatar: (_d = u.github_avatar) !== null && _d !== void 0 ? _d : null,
                        email_verified: !!u.email_verified,
                        github_verified: !!u.github_verified,
                        github_installation_id: (_e = u.github_installation_id) !== null && _e !== void 0 ? _e : null,
                        isActive: u.isActive,
                        created_at: u.created_at,
                        updated_at: u.updated_at,
                    });
                });
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
                const userToUpdate = await this.userRepository.findById(data.userId);
                if (!userToUpdate) {
                    throw new microservices_1.RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
                }
                if (data.username !== undefined)
                    userToUpdate.username = data.username;
                if (data.email !== undefined)
                    userToUpdate.email = data.email;
                if (data.github_verified !== undefined)
                    userToUpdate.github_verified = data.github_verified;
                await this.userRepository.save(userToUpdate);
                break;
            case 'delete': {
                const userToDelete = await this.userRepository.findById(data.id);
                if (!userToDelete) {
                    throw new microservices_1.RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
                }
                if (userToDelete.email === 'admin@example.com') {
                    throw new microservices_1.RpcException({
                        msg: 'Không thể xóa tài khoản root admin',
                        status: 403,
                    });
                }
                if (userToDelete.id === userId) {
                    throw new microservices_1.RpcException({
                        msg: 'Không thể xóa tài khoản của chính bạn',
                        status: 403,
                    });
                }
                try {
                    const queryRunner = this.userRepo.manager.connection.createQueryRunner();
                    await queryRunner.connect();
                    await queryRunner.startTransaction();
                    try {
                        await queryRunner.manager
                            .createQueryBuilder()
                            .delete()
                            .from('channel_members')
                            .where('user_id = :userId', { userId: userToDelete.id })
                            .execute();
                        await queryRunner.manager
                            .createQueryBuilder()
                            .delete()
                            .from('messages')
                            .where('senderId = :userId', { userId: userToDelete.id })
                            .execute();
                        await queryRunner.manager
                            .createQueryBuilder()
                            .update('channels')
                            .set({ owner: null })
                            .where('owner.id = :userId', { userId: userToDelete.id })
                            .execute();
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
                    }
                    catch (err) {
                        await queryRunner.rollbackTransaction();
                        throw err;
                    }
                    finally {
                        await queryRunner.release();
                    }
                }
                catch (error) {
                    console.error('Error deleting user:', error);
                    throw new microservices_1.RpcException({
                        msg: 'Không thể xóa người dùng: ' + error,
                        status: 500,
                    });
                }
            }
            case 'toggle-active': {
                const targetUser = await this.userRepository.findById(data.id);
                if (!targetUser) {
                    throw new microservices_1.RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
                }
                if (String(targetUser.role) !== 'user') {
                    throw new microservices_1.RpcException({
                        msg: 'Chỉ có thể bật/tắt tài khoản có role "user"',
                        status: 403,
                    });
                }
                targetUser.isActive = !targetUser.isActive;
                await this.userRepository.save(targetUser);
                return {
                    msg: `Đã ${targetUser.isActive ? 'kích hoạt' : 'vô hiệu hóa'} tài khoản`,
                    userId: targetUser.id,
                    isActive: targetUser.isActive,
                };
            }
            case 'set-toggle-admin': {
                const targetUser = await this.userRepository.findById(data.id);
                if (!targetUser) {
                    throw new microservices_1.RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
                }
                if (targetUser.email === 'admin@example.com') {
                    throw new microservices_1.RpcException({
                        msg: 'Không thể thay đổi quyền của tài khoản root admin',
                        status: 403,
                    });
                }
                if (targetUser.role === 'admin') {
                    targetUser.role = 'user';
                }
                else {
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
    generateRandomPassword(length = 12) {
        const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const lowercase = 'abcdefghijklmnopqrstuvwxyz';
        const numbers = '0123456789';
        const symbols = '!@#$%^&*';
        const allChars = uppercase + lowercase + numbers + symbols;
        let password = '';
        password += uppercase[Math.floor(Math.random() * uppercase.length)];
        password += lowercase[Math.floor(Math.random() * lowercase.length)];
        password += numbers[Math.floor(Math.random() * numbers.length)];
        password += symbols[Math.floor(Math.random() * symbols.length)];
        for (let i = password.length; i < length; i++) {
            password += allChars[Math.floor(Math.random() * allChars.length)];
        }
        return password.split('').sort(() => Math.random() - 0.5).join('');
    }
    generateOTP() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }
    async resetPassword(email, otp, frontendUrl) {
        try {
            if (!otp) {
                console.log('🔐 [RESET PASSWORD - STEP 1] Gửi OTP');
                console.log(`🔍 [RESET PASSWORD - STEP 1] Tìm user với email: ${email}`);
                const user = await this.userRepository.findByEmail(email);
                if (!user) {
                    throw new microservices_1.RpcException({
                        msg: 'Không tìm thấy tài khoản với email đã cung cấp',
                        status: 404,
                    });
                }
                if (!user.isActive) {
                    throw new microservices_1.RpcException({
                        msg: 'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên',
                        status: 403,
                    });
                }
                const otpCode = this.generateOTP();
                const otpExp = new Date();
                otpExp.setMinutes(otpExp.getMinutes() + 5);
                user.otpCode = otpCode;
                user.otpExp = otpExp;
                user.otpAttempts = 0;
                await this.userRepository.save(user);
                console.log(`🔑 [RESET PASSWORD - STEP 1] Đã tạo OTP: ${otpCode} (hết hạn: ${otpExp.toISOString()})`);
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
                }
                catch (emailError) {
                    console.error(`❌ [RESET PASSWORD - STEP 1] Lỗi gửi email:`, emailError);
                    throw new microservices_1.RpcException({
                        msg: 'Không thể gửi email. Vui lòng thử lại sau',
                        status: 500,
                    });
                }
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
            console.log('🔐 [RESET PASSWORD - STEP 2] Xác thực OTP và reset password (không cần CAPTCHA)');
            if (!/^\d{6}$/.test(otp)) {
                throw new microservices_1.RpcException({
                    msg: 'Mã OTP không hợp lệ. OTP phải là 6 chữ số',
                    status: 400,
                });
            }
            console.log(`🔍 [RESET PASSWORD - STEP 2] Tìm user với email: ${email}`);
            const user = await this.userRepository.findByEmail(email);
            if (!user) {
                throw new microservices_1.RpcException({
                    msg: 'Không tìm thấy tài khoản với email đã cung cấp',
                    status: 404,
                });
            }
            if (!user.isActive) {
                throw new microservices_1.RpcException({
                    msg: 'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên',
                    status: 403,
                });
            }
            if (!user.otpCode || !user.otpExp) {
                throw new microservices_1.RpcException({
                    msg: 'Không tìm thấy mã OTP. Vui lòng yêu cầu gửi lại OTP',
                    status: 400,
                });
            }
            const now = new Date();
            if (now > user.otpExp) {
                user.otpCode = null;
                user.otpExp = null;
                user.otpAttempts = 0;
                await this.userRepository.save(user);
                throw new microservices_1.RpcException({
                    msg: 'Mã OTP đã hết hạn. Vui lòng yêu cầu gửi lại OTP',
                    status: 400,
                });
            }
            if (user.otpAttempts >= 3) {
                user.otpCode = null;
                user.otpExp = null;
                user.otpAttempts = 0;
                await this.userRepository.save(user);
                throw new microservices_1.RpcException({
                    msg: 'Bạn đã nhập sai mã OTP quá 3 lần. Vui lòng yêu cầu gửi lại OTP mới',
                    status: 429,
                });
            }
            if (user.otpCode !== otp) {
                user.otpAttempts = (user.otpAttempts || 0) + 1;
                const remainingAttempts = 3 - user.otpAttempts;
                await this.userRepository.save(user);
                console.log(`❌ [RESET PASSWORD - STEP 2] OTP sai (${user.otpAttempts}/3)`);
                throw new microservices_1.RpcException({
                    msg: `Mã OTP không chính xác. Bạn còn ${remainingAttempts} lần thử`,
                    status: 400,
                    data: {
                        remainingAttempts: remainingAttempts,
                        maxAttempts: 3
                    }
                });
            }
            console.log('✅ [RESET PASSWORD - STEP 2] OTP hợp lệ');
            const loginUrl = `${this.normalizeFrontendUrl(frontendUrl)}/auth/login`;
            const newPassword = this.generateRandomPassword(12);
            console.log(`🔑 [RESET PASSWORD - STEP 2] Đã tạo mật khẩu mới cho user: ${user.email}`);
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            user.password = hashedPassword;
            user.otpCode = null;
            user.otpExp = null;
            user.otpAttempts = 0;
            user.refresh_token = null;
            await this.userRepository.save(user);
            console.log(`💾 [RESET PASSWORD - STEP 2] Đã cập nhật mật khẩu mới vào database`);
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
            }
            catch (emailError) {
                console.error(`❌ [RESET PASSWORD - STEP 2] Lỗi gửi email:`, emailError);
                throw new microservices_1.RpcException({
                    msg: 'Không thể gửi email. Vui lòng thử lại sau',
                    status: 500,
                });
            }
            return {
                step: 2,
                email: user.email,
            };
        }
        catch (error) {
            if (error instanceof microservices_1.RpcException) {
                throw error;
            }
            console.error('❌ [RESET PASSWORD] Lỗi:', (error === null || error === void 0 ? void 0 : error.message) || error);
            throw new microservices_1.RpcException({
                msg: (error === null || error === void 0 ? void 0 : error.message) || 'Đã xảy ra lỗi trong quá trình đặt lại mật khẩu',
                status: 500,
            });
        }
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(entities_1.User)),
    __param(4, (0, common_1.Inject)('REDIS_CLIENT')),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        user_repository_1.UserRepository,
        jwt_1.JwtService,
        mailer_1.MailerService,
        ioredis_1.default])
], AuthService);
//# sourceMappingURL=auth.service.js.map