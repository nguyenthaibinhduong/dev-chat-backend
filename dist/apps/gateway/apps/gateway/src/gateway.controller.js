"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayController = void 0;
const swagger_1 = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const gateway_service_1 = require("./gateway.service");
const jwt_auth_guard_1 = require("./guards/jwt-auth.guard");
const socket_service_1 = require("./socket.service");
const cache_manager_1 = require("@nestjs/cache-manager");
const crypto_1 = require("crypto");
const kafka_service_1 = require("./kafka/kafka.service");
function encodeState(obj) {
    return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function decodeState(raw) {
    if (!raw)
        return null;
    try {
        const s = raw.replace(/-/g, '+').replace(/_/g, '/');
        const json = Buffer.from(s, 'base64').toString('utf8');
        return JSON.parse(json);
    }
    catch {
        return null;
    }
}
function firstHeaderValue(value) {
    if (Array.isArray(value))
        return value[0];
    return value;
}
function normalizeOrigin(value) {
    var _a;
    const headerValue = (_a = value === null || value === void 0 ? void 0 : value.split(',')[0]) === null || _a === void 0 ? void 0 : _a.trim();
    if (!headerValue)
        return undefined;
    try {
        return new URL(headerValue).origin;
    }
    catch {
        return undefined;
    }
}
function getRequestOrigin(req) {
    const origin = normalizeOrigin(firstHeaderValue(req.headers.origin));
    if (origin)
        return origin;
    const referer = normalizeOrigin(firstHeaderValue(req.headers.referer));
    if (referer)
        return referer;
    const forwardedHost = firstHeaderValue(req.headers['x-forwarded-host']);
    if (forwardedHost) {
        const forwardedProto = firstHeaderValue(req.headers['x-forwarded-proto']) || req.protocol || 'https';
        return `${forwardedProto.split(',')[0].trim()}://${forwardedHost.split(',')[0].trim()}`;
    }
    const host = firstHeaderValue(req.headers.host);
    return host ? `${req.protocol || 'http'}://${host}` : '';
}
function getFrontendOrigin(req, frontendUrl) {
    const explicitOrigin = normalizeOrigin(frontendUrl);
    if (explicitOrigin)
        return explicitOrigin;
    const requestOrigin = getRequestOrigin(req);
    if (requestOrigin)
        return requestOrigin;
    return normalizeOrigin(process.env.FE_URL) || '';
}
function getGoogleCallbackUrl(req, frontendUrl) {
    var _a;
    const frontendOrigin = getFrontendOrigin(req, frontendUrl);
    const configuredFrontendOrigin = normalizeOrigin(process.env.FE_URL);
    const realtimeFrontendOrigin = 'https://realtime-dev-chatapp-dnq2.vercel.app';
    if (frontendOrigin &&
        (frontendOrigin === configuredFrontendOrigin ||
            frontendOrigin === realtimeFrontendOrigin)) {
        return `${frontendOrigin}/api/v1/auth/google-oauth/callback`;
    }
    const configuredCallbackUrl = (_a = process.env.GOOGLE_CALLBACK_URL) === null || _a === void 0 ? void 0 : _a.trim();
    if (configuredCallbackUrl)
        return configuredCallbackUrl;
    return joinFrontendUrl(getRequestOrigin(req), '/v1/api/auth/google-oauth/callback');
}
function joinFrontendUrl(frontendUrl, path) {
    return `${frontendUrl.replace(/\/+$/, '')}${path}`;
}
function getRequiredEnv(name) {
    var _a;
    const value = (_a = process.env[name]) === null || _a === void 0 ? void 0 : _a.trim();
    if (!value) {
        throw new common_1.InternalServerErrorException(`Missing required environment variable: ${name}`);
    }
    return value;
}
function verifySignature(secret, bodyRaw, signature256) {
    const hmac = (0, crypto_1.createHmac)('sha256', secret).update(bodyRaw).digest('hex');
    const expected = Buffer.from(`sha256=${hmac}`, 'utf8');
    const received = Buffer.from(signature256 || '', 'utf8');
    return (expected.length === received.length && (0, crypto_1.timingSafeEqual)(expected, received));
}
let GatewayController = class GatewayController {
    constructor(gw, ChatSocketService, kafka, cacheManager) {
        this.gw = gw;
        this.ChatSocketService = ChatSocketService;
        this.kafka = kafka;
        this.cacheManager = cacheManager;
    }
    health() {
        return {
            code: 200,
            msg: 'OK',
            data: {
                service: 'gateway',
                uptime: process.uptime(),
            },
        };
    }
    async githubAppRedirect(req) {
        const user = req.user;
        const state = encodeState({
            next: getRequestOrigin(req),
            userId: user.id,
        });
        const result = await this.gw.exec('git', 'get_install_app_url', {
            state,
        });
        return { url: result.data };
    }
    async githubAppUninstall(req) {
        const user = req.user;
        return await this.gw.exec('git', 'unlink_github_app', {
            userId: user.id,
        });
    }
    async setup(installationId, setupAction, state, req, res) {
        const stateDecoded = decodeState(state);
        if (!stateDecoded || !stateDecoded.userId) {
            return res.redirect();
        }
        const payload = {
            user: { id: stateDecoded.userId },
            github_installation_id: installationId,
        };
        await this.gw.exec('auth', 'update_profile', payload);
        await this.gw.exec('git', 'github_app_setup', {
            userId: stateDecoded.userId,
            installationId,
            userToken: null,
        });
        const result = await this.gw.exec('auth', 'get_token_info', {
            userId: stateDecoded.userId,
        });
        if (result && (result === null || result === void 0 ? void 0 : result.data)) {
            const access_token = result.data.access_token;
            const refresh_token = result.data.refresh_token;
            const frontendUrl = stateDecoded.next || getRequestOrigin(req);
            return res.redirect(joinFrontendUrl(frontendUrl, `/auth/github/callback?access_token=${access_token}&refresh_token=${refresh_token}`));
        }
        else {
            return res.redirect(stateDecoded.next || getRequestOrigin(req));
        }
    }
    async handle(req, res, sig256, ghEvent, deliveryId) {
        var _a, _b, _c;
        const secret = process.env.GITHUB_APP_WEBHOOK_SECRET || 'ppB6va3mMw';
        const raw = req.rawBody || Buffer.from(JSON.stringify(req.body));
        if (!verifySignature(secret, raw, sig256)) {
            return res.status(401).send('Invalid signature');
        }
        const payload = JSON.parse(raw.toString());
        console.log('Webhook payload', payload);
        if (payload.commits) {
            payload.commits.forEach((commit) => {
                console.log('Commit:', commit.id);
                console.log('Message:', commit.message);
                console.log('Added:', commit.added);
                console.log('Modified:', commit.modified);
                console.log('Removed:', commit.removed);
            });
        }
        const message = {
            deliveryId,
            event: ghEvent,
            action: payload.action,
            installationId: (_a = payload.installation) === null || _a === void 0 ? void 0 : _a.id,
            repoId: (_b = payload.repository) === null || _b === void 0 ? void 0 : _b.id,
            repoFullName: (_c = payload.repository) === null || _c === void 0 ? void 0 : _c.full_name,
            createdAt: new Date().toISOString(),
            data: payload,
        };
        await this.kafka.publish('github.webhooks', message);
        return res.send('OK');
    }
    async getCommitDetails(owner, repo, sha, req) {
        const user = req.user;
        return this.gw.exec('git', 'getCommitDetails', {
            userId: user.id,
            owner,
            repo,
            sha,
        });
    }
    async compareCommits(owner, repo, base, head, req) {
        const user = req.user;
        return this.gw.exec('git', 'compareCommits', {
            userId: user.id,
            owner,
            repo,
            base,
            head,
        });
    }
    async getCommitDiff(owner, repo, sha, req) {
        const user = req.user;
        if (!(user === null || user === void 0 ? void 0 : user.id))
            return { code: 401, msg: 'Unauthorized', data: null };
        return this.gw.exec('git', 'getCommitDiff', {
            userId: user.id,
            owner,
            repo,
            sha,
        });
    }
    async getCommitAnalysis(owner, repo, sha, prompt, req) {
        const user = req.user;
        if (!(user === null || user === void 0 ? void 0 : user.id))
            return { code: 401, msg: 'Unauthorized', data: null };
        const result = await this.gw.exec('git', 'getCommitAnalysis', {
            userId: user.id,
            owner,
            repo,
            sha,
            prompt: prompt !== null && prompt !== void 0 ? prompt : '',
        }, { waitMs: 90000 });
        return result;
    }
    async githubOAuthRedirect(req, frontendUrl) {
        const clientId = getRequiredEnv('GITHUB_CLIENT_ID');
        const callbackUrl = getRequiredEnv('GITHUB_CALLBACK_URL');
        const params = new URLSearchParams({
            client_id: clientId,
            scope: 'user:email',
            redirect_uri: callbackUrl,
            state: encodeState({ next: getFrontendOrigin(req, frontendUrl) }),
        });
        const url = `https://github.com/login/oauth/authorize?${params.toString()}`;
        return { url, redirect_uri: callbackUrl };
    }
    async githubOAuthRedirectUpdate(req, frontendUrl) {
        const user = req.user;
        if (!(user === null || user === void 0 ? void 0 : user.id))
            return { code: 401, msg: 'Unauthorized', data: null };
        const clientId = getRequiredEnv('GITHUB_CLIENT_ID');
        const callbackUrl = getRequiredEnv('GITHUB_CALLBACK_URL');
        const params = new URLSearchParams({
            client_id: clientId,
            scope: 'user:email',
            redirect_uri: callbackUrl,
            state: encodeState({ next: getFrontendOrigin(req, frontendUrl), userId: user.id }),
        });
        const url = `https://github.com/login/oauth/authorize?${params.toString()}`;
        return { url, redirect_uri: callbackUrl };
    }
    async githubOAuthCallback(req, res, code, state) {
        var _a, _b, _c, _d, _e;
        const stateDecoded = decodeState(state);
        const frontendUrl = (stateDecoded === null || stateDecoded === void 0 ? void 0 : stateDecoded.next) || getRequestOrigin(req);
        try {
            const safeReq = {
                session: req.session,
                headers: req.headers,
                user: req.user,
            };
            const result = await this.gw.exec('git', 'github_oauth_callback', {
                req: safeReq,
                code,
                state: (_b = (_a = stateDecoded === null || stateDecoded === void 0 ? void 0 : stateDecoded.userId) !== null && _a !== void 0 ? _a : state) !== null && _b !== void 0 ? _b : undefined,
                frontendUrl,
            });
            if ((result === null || result === void 0 ? void 0 : result.data) && result.data.user) {
                const isInstall = result.data.isInstall;
                if (isInstall) {
                    return res.redirect((_c = result === null || result === void 0 ? void 0 : result.data) === null || _c === void 0 ? void 0 : _c.nextUrl);
                }
                else {
                    const tokenInfo = await this.gw.exec('auth', 'get_token_info', {
                        userId: (_e = (_d = result === null || result === void 0 ? void 0 : result.data) === null || _d === void 0 ? void 0 : _d.user) === null || _e === void 0 ? void 0 : _e.id,
                    });
                    if (tokenInfo && (tokenInfo === null || tokenInfo === void 0 ? void 0 : tokenInfo.data)) {
                        const access_token = tokenInfo.data.access_token;
                        const refresh_token = tokenInfo.data.refresh_token;
                        return res.redirect(joinFrontendUrl(frontendUrl, `/auth/github/callback?access_token=${access_token}&refresh_token=${refresh_token}`));
                    }
                    else {
                        return res.redirect(frontendUrl);
                    }
                }
            }
        }
        catch {
            return res.redirect(joinFrontendUrl(frontendUrl, '/error?error=githuboauth'));
        }
    }
    async googleOAuthRedirect(req, frontendUrl) {
        const clientId = getRequiredEnv('GOOGLE_CLIENT_ID');
        const callbackUrl = getGoogleCallbackUrl(req, frontendUrl);
        const next = getFrontendOrigin(req, frontendUrl);
        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: callbackUrl,
            response_type: 'code',
            scope: 'openid email profile',
            prompt: 'select_account',
            state: encodeState({ next, googleCallbackUrl: callbackUrl }),
        });
        const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
        return { url, redirect_uri: callbackUrl };
    }
    async googleOAuthRedirectUpdate(req, frontendUrl) {
        const user = req.user;
        if (!(user === null || user === void 0 ? void 0 : user.id))
            return { code: 401, msg: 'Unauthorized', data: null };
        const clientId = getRequiredEnv('GOOGLE_CLIENT_ID');
        const callbackUrl = getGoogleCallbackUrl(req, frontendUrl);
        const next = getFrontendOrigin(req, frontendUrl);
        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: callbackUrl,
            response_type: 'code',
            scope: 'openid email profile',
            prompt: 'select_account',
            state: encodeState({ next, userId: user.id, googleCallbackUrl: callbackUrl }),
        });
        const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
        return { url, redirect_uri: callbackUrl };
    }
    async googleOAuthCallback(req, res, code, state) {
        var _a, _b, _c, _d, _e;
        const stateDecoded = decodeState(state);
        const frontendUrl = (stateDecoded === null || stateDecoded === void 0 ? void 0 : stateDecoded.next) || normalizeOrigin(process.env.FE_URL) || getRequestOrigin(req);
        const requestId = Math.random().toString(36).slice(2, 10);
        const redirectUri = stateDecoded === null || stateDecoded === void 0 ? void 0 : stateDecoded.googleCallbackUrl;
        console.log('[GoogleOAuth][gateway][callback:start]', {
            requestId,
            hasCode: Boolean(code),
            hasState: Boolean(state),
            stateDecoded,
            frontendUrl,
            redirectUri,
            callbackUrl: req.originalUrl,
            requestOrigin: getRequestOrigin(req),
        });
        try {
            const gitPayload = {
                code,
                state: stateDecoded === null || stateDecoded === void 0 ? void 0 : stateDecoded.userId,
                frontendUrl,
                redirectUri,
            };
            console.log('[GoogleOAuth][gateway][send-git]', {
                requestId,
                hasCode: Boolean(gitPayload.code),
                state: gitPayload.state,
                frontendUrl: gitPayload.frontendUrl,
                redirectUri: gitPayload.redirectUri,
                waitMs: 90000,
            });
            const result = await this.gw.exec('git', 'google_oauth_callback', gitPayload, { waitMs: 90000 });
            console.log('[GoogleOAuth][gateway][git-result]', {
                requestId,
                hasResult: Boolean(result),
                hasData: Boolean(result === null || result === void 0 ? void 0 : result.data),
                hasUser: Boolean((_a = result === null || result === void 0 ? void 0 : result.data) === null || _a === void 0 ? void 0 : _a.user),
                userId: (_c = (_b = result === null || result === void 0 ? void 0 : result.data) === null || _b === void 0 ? void 0 : _b.user) === null || _c === void 0 ? void 0 : _c.id,
            });
            if ((result === null || result === void 0 ? void 0 : result.data) && result.data.user) {
                const tokenInfo = await this.gw.exec('auth', 'get_token_info', {
                    userId: result.data.user.id,
                });
                console.log('[GoogleOAuth][gateway][token-info-result]', {
                    requestId,
                    hasTokenInfo: Boolean(tokenInfo),
                    hasData: Boolean(tokenInfo === null || tokenInfo === void 0 ? void 0 : tokenInfo.data),
                    hasAccessToken: Boolean((_d = tokenInfo === null || tokenInfo === void 0 ? void 0 : tokenInfo.data) === null || _d === void 0 ? void 0 : _d.access_token),
                    hasRefreshToken: Boolean((_e = tokenInfo === null || tokenInfo === void 0 ? void 0 : tokenInfo.data) === null || _e === void 0 ? void 0 : _e.refresh_token),
                });
                if (tokenInfo === null || tokenInfo === void 0 ? void 0 : tokenInfo.data) {
                    const access_token = tokenInfo.data.access_token;
                    const refresh_token = tokenInfo.data.refresh_token;
                    const finalRedirect = joinFrontendUrl(frontendUrl, `/auth/google/callback?access_token=${access_token}&refresh_token=${refresh_token}`);
                    console.log('[GoogleOAuth][gateway][redirect-success]', {
                        requestId,
                        frontendUrl,
                        finalRedirectPath: '/auth/google/callback',
                    });
                    return res.redirect(finalRedirect);
                }
            }
            console.warn('[GoogleOAuth][gateway][missing-user-or-token]', {
                requestId,
                result,
            });
            return res.redirect(frontendUrl);
        }
        catch (error) {
            console.error('[GoogleOAuth][gateway][callback:error]', {
                requestId,
                message: error === null || error === void 0 ? void 0 : error.message,
                response: error === null || error === void 0 ? void 0 : error.response,
                status: error === null || error === void 0 ? void 0 : error.status,
                stack: error === null || error === void 0 ? void 0 : error.stack,
            });
            return res.redirect(joinFrontendUrl(frontendUrl, '/error?error=googleoauth'));
        }
    }
    async login(dto) {
        return this.gw.exec('auth', 'login', dto);
    }
    async resetPassword(dto, req) {
        return this.gw.exec('auth', 'reset_password', {
            ...dto,
            frontendUrl: getRequestOrigin(req),
        });
    }
    async register(dto, req) {
        return this.gw.exec('auth', 'register', {
            ...dto,
            frontendUrl: getRequestOrigin(req),
        });
    }
    async update_profile(dto, req) {
        const user = req.user;
        const payload = { user, ...dto };
        return this.gw.exec('auth', 'update_profile', payload);
    }
    async get_profile(req) {
        const user = req.user;
        if (!(user === null || user === void 0 ? void 0 : user.id))
            return { code: 401, msg: 'Unauthorized', data: null };
        return this.gw.exec('auth', 'get_profile', { userId: user.id });
    }
    async update_password(dto, req) {
        const user = req.user;
        return this.gw.exec('auth', 'update_password', { user, ...dto });
    }
    async refresh(dto) {
        return this.gw.exec('auth', 'refresh', dto);
    }
    async confirmEmail(dto) {
        return this.gw.exec('auth', 'confirm_email', dto);
    }
    async joinChannel(dto, req) {
        const user = req.user;
        const payload = { user, ...dto };
        console.log('Join Channel Payload:', payload);
        return this.gw.exec('chat', 'joinChannel', payload);
    }
    async createChannel(dto, req) {
        const user = req.user;
        const payload = { user, ...dto };
        return this.gw.exec('chat', 'createChannel', payload);
    }
    async updateChannel(dto, req) {
        const user = req.user;
        const payload = { user, ...dto };
        return this.gw.exec('chat', 'updateChannel', payload);
    }
    async getUnreadMap(req) {
        const user = req.user;
        if (!(user === null || user === void 0 ? void 0 : user.id))
            return { code: 401, msg: 'Unauthorized', data: null };
        const data = await this.ChatSocketService.getRegisteredUnreadChannels(user.id);
        return { code: 200, msg: 'Success', data };
    }
    async searchKeywordMessages(dto, req) {
        const user = req.user;
        const payload = { user, ...dto };
        return this.gw.exec('chat', 'searchMessagesByKeyword', payload);
    }
    async addRepositoriesToChannel(dto, req) {
        const user = req.user;
        const payload = { user, ...dto };
        return this.gw.exec('chat', 'addRepositoriesToChannel', payload);
    }
    async removeRepositoriesFromChannel(dto, req) {
        const user = req.user;
        const payload = { user, ...dto };
        return this.gw.exec('chat', 'removeRepositoriesFromChannel', payload);
    }
    async listChannels(q, req) {
        const user = req.user;
        return this.gw.exec('chat', 'listChannels', {
            user,
            ...q,
        });
    }
    async listOnlineUser() {
        return this.gw.getAllOnlineUsers();
    }
    async listMessages(channel_id, q, req) {
        const user = req.user;
        return this.gw.exec('chat', 'listChannelsMessages', {
            user,
            channel_id,
            ...q,
        });
    }
    async SearchChat(q, req) {
        var _a, _b;
        const user = req.user;
        return this.gw.exec('chat', 'searchChatEntities', {
            user,
            data: { key: q === null || q === void 0 ? void 0 : q.key, type: (_a = q === null || q === void 0 ? void 0 : q.type) !== null && _a !== void 0 ? _a : '', limit: (_b = q === null || q === void 0 ? void 0 : q.limit) !== null && _b !== void 0 ? _b : 5 },
            ...q,
        });
    }
    async listChannelsByRepository(dto, req) {
        const user = req.user;
        const payload = { user, ...dto };
        return this.gw.exec('chat', 'listChannelsByRepository', payload);
    }
    async SearchUsers(q, req) {
        var _a;
        const user = req.user;
        return this.gw.exec('auth', 'searchUsers', {
            user,
            data: { key: q === null || q === void 0 ? void 0 : q.key, limit: (_a = q === null || q === void 0 ? void 0 : q.limit) !== null && _a !== void 0 ? _a : 5 },
            ...q,
        });
    }
    async addMembersToChannel(dto, req) {
        const user = req.user;
        const payload = { user, ...dto };
        return this.gw.exec('chat', 'addMembersToChannel', payload);
    }
    async removeMembersFromChannel(dto, req) {
        const user = req.user;
        const payload = { user, ...dto };
        return this.gw.exec('chat', 'removeMembersFromChannel', payload);
    }
    async listNonMembers(channelId, username, limit, cursor) {
        return this.gw.exec('chat', 'listNonMembers', {
            channelId,
            username,
            limit,
            cursor,
        });
    }
    async searchMessages(query, req, channelId, senderId, startDate, endDate, limit, cursor) {
        const user = req.user;
        if (!(user === null || user === void 0 ? void 0 : user.id))
            return { code: 401, msg: 'Unauthorized', data: null };
        return this.gw.exec('chat', 'searchMessages', {
            userId: user.id,
            query,
            channelId: channelId ? +channelId : undefined,
            senderId: senderId ? +senderId : undefined,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            limit: limit ? +limit : undefined,
            cursor: cursor ? +cursor : undefined,
        });
    }
    async getPresignedUrl(dto, req) {
        const user = req.user;
        const payload = { user, ...dto };
        return this.gw.exec('upload', 'getPresignedUrl', payload);
    }
    async getObjectUrl(dto, req) {
        const user = req.user;
        const payload = { user, ...dto };
        return this.gw.exec('upload', 'getObject', payload);
    }
    async getAvatarPresignedUrl(body, req) {
        const user = req.user;
        return this.gw.exec('upload', 'getAvatarPresignedUrl', {
            userId: user.id,
            filename: body.filename,
            contentType: body.contentType,
        });
    }
    async getSheetUrl(body, req) {
        const user = req.user;
        return this.gw.exec('upload', 'getSheetUrl', {
            channelId: body.channelId,
        });
    }
    async getAttachmentsByChannel(channelId, req, limit, cursor, filename, mimeType, senderId, startDate, endDate) {
        const user = req.user;
        if (!(user === null || user === void 0 ? void 0 : user.id))
            return { code: 401, msg: 'Unauthorized', data: null };
        return this.gw.exec('upload', 'getAttachmentsByChannel', {
            channelId: channelId,
            limit: limit ? +limit : undefined,
            cursor: cursor ? +cursor : undefined,
            filename,
            mimeType,
            senderId: senderId ? senderId : undefined,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
        });
    }
    async get_repo_installation(dto, req) {
        const user = req.user;
        if (!(user === null || user === void 0 ? void 0 : user.id))
            return { code: 401, msg: 'Unauthorized', data: null };
        const cacheKey = `repo_installation:${user.id}+${JSON.stringify(dto)}`;
        const cached = await this.cacheManager.get(cacheKey);
        if (cached) {
            return cached;
        }
        const result = await this.gw.exec('git', 'get_repo_installation', {
            userId: user.id,
            ...dto,
        });
        await this.cacheManager.set(cacheKey, result);
        return result;
    }
    async get_repo_data_by_url(dto, req) {
        const user = req.user;
        if (!(user === null || user === void 0 ? void 0 : user.id))
            return { code: 401, msg: 'Unauthorized', data: null };
        const cacheKey = `repo_data_by_url:${user.id}:${dto.url}`;
        const cached = await this.cacheManager.get(cacheKey);
        if (cached) {
            return cached;
        }
        const result = await this.gw.exec('git', 'get_repo_data_by_url', {
            userId: user.id,
            url: dto.url,
            ...dto,
        });
        await this.cacheManager.set(cacheKey, result, 3 * 60 * 1000);
        return result;
    }
    async get_list_repo_data_by_channel(dto, req) {
        const user = req.user;
        if (!(user === null || user === void 0 ? void 0 : user.id))
            return { code: 401, msg: 'Unauthorized', data: null };
        const result = await this.gw.exec('chat', 'listRepositoriesByChannel', {
            user,
            ...dto,
        });
        if (!(result === null || result === void 0 ? void 0 : result.data)) {
            return { code: 404, msg: 'Not Found', data: null };
        }
        const items = result.data.items || [];
        const itemsHash = (0, crypto_1.createHash)('sha1')
            .update(JSON.stringify(items))
            .digest('hex');
        const cacheKeySnapshot = `repo_snapshot:${user.id}:${JSON.stringify(dto)}`;
        const cacheKeyData = `repo_data_by_channel:${user.id}:${JSON.stringify(dto)}`;
        const oldSnapshot = await this.cacheManager.get(cacheKeySnapshot);
        if (oldSnapshot && oldSnapshot === itemsHash) {
            const cached = await this.cacheManager.get(cacheKeyData);
            if (cached) {
                return cached;
            }
        }
        let data;
        if (items.length > 0) {
            data = await this.gw.exec('git', 'get_repo_by_ids', { items });
        }
        else {
            data = { code: 200, msg: 'Success', data: [] };
        }
        await this.cacheManager.set(cacheKeySnapshot, itemsHash, 10 * 60 * 1000);
        await this.cacheManager.set(cacheKeyData, data, 3 * 60 * 1000);
        return data;
    }
    async getNotifications(query, req) {
        const user = req.user;
        return this.gw.exec('notification', 'get_notifications', {
            userId: user.id,
            query,
        });
    }
    async markAsRead(body, req) {
        const user = req.user;
        console.log('Body mark as read:', body.id);
        return this.gw.exec('notification', 'mark_as_read', {
            notificationId: body.id,
        });
    }
    async markAllAsRead(req) {
        const user = req.user;
        return this.gw.exec('notification', 'mark_all_as_read', {
            userId: user.id,
        });
    }
    async countUnreadNotifications(req) {
        const user = req.user;
        return this.gw.exec('notification', 'get_number_unread_notifications', {
            userId: user.id,
        });
    }
    async adminUserManagement(dto, req) {
        const user = req.user;
        const payload = { user, ...dto };
        return this.gw.exec('auth', 'admin_user_management', payload);
    }
    async adminChannelManagement(dto, req) {
        const user = req.user;
        const payload = { user, ...dto };
        return this.gw.exec('chat', 'admin_channel_management', payload);
    }
    async adminFileManagement(dto, req) {
        const user = req.user;
        const payload = { user, ...dto };
        return this.gw.exec('upload', 'admin_file_management', payload);
    }
};
exports.GatewayController = GatewayController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Gateway health check', description: 'Checks whether the HTTP gateway process is alive.' }),
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], GatewayController.prototype, "health", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Create GitHub App install URL', description: 'Auth required. Calls git/get_install_app_url and returns a GitHub installation redirect URL. JWT user id is encoded in state.' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('github-app/redirect'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "githubAppRedirect", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Unlink GitHub App installation', description: 'Auth required. Calls git/unlink_github_app for the current JWT user.' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('github-app/uninstall'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "githubAppUninstall", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'GitHub App setup callback', description: 'Callback from GitHub App installation. Persists installation_id, refreshes token info, then redirects to the frontend callback.' }),
    (0, swagger_1.ApiQuery)({ name: 'installation_id', required: true, description: 'GitHub installation id returned by GitHub App setup.' }),
    (0, swagger_1.ApiQuery)({ name: 'setup_action', required: false, description: 'GitHub setup action, for example install or update.' }),
    (0, swagger_1.ApiQuery)({ name: 'state', required: true, description: 'Base64url encoded state containing userId and next frontend URL.' }),
    (0, common_1.Get)('github-app/setup'),
    __param(0, (0, common_1.Query)('installation_id')),
    __param(1, (0, common_1.Query)('setup_action')),
    __param(2, (0, common_1.Query)('state')),
    __param(3, (0, common_1.Req)()),
    __param(4, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "setup", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'GitHub webhook receiver', description: 'Receives GitHub webhook payload, verifies x-hub-signature-256, then publishes normalized data to Kafka topic github.webhooks.' }),
    (0, common_1.Post)('github-app/webhook'),
    (0, common_1.HttpCode)(200),
    (0, common_1.HttpCode)(201),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __param(2, (0, common_1.Headers)('x-hub-signature-256')),
    __param(3, (0, common_1.Headers)('x-github-event')),
    __param(4, (0, common_1.Headers)('x-github-delivery')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, String, String]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "handle", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Get GitHub commit details', description: 'Auth required. Calls git/getCommitDetails with owner, repo and sha.' }),
    (0, swagger_1.ApiParam)({ name: 'owner', description: 'GitHub organization or username.' }),
    (0, swagger_1.ApiParam)({ name: 'repo', description: 'Repository name.' }),
    (0, swagger_1.ApiParam)({ name: 'sha', description: 'Commit SHA.' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('github/commit/:owner/:repo/:sha'),
    __param(0, (0, common_1.Param)('owner')),
    __param(1, (0, common_1.Param)('repo')),
    __param(2, (0, common_1.Param)('sha')),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "getCommitDetails", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Compare two GitHub refs', description: 'Auth required. Calls git/compareCommits with owner, repo, base and head.' }),
    (0, swagger_1.ApiParam)({ name: 'owner', description: 'GitHub organization or username.' }),
    (0, swagger_1.ApiParam)({ name: 'repo', description: 'Repository name.' }),
    (0, swagger_1.ApiParam)({ name: 'base', description: 'Base branch, tag or commit SHA.' }),
    (0, swagger_1.ApiParam)({ name: 'head', description: 'Head branch, tag or commit SHA.' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('github/compare/:owner/:repo/:base/:head'),
    __param(0, (0, common_1.Param)('owner')),
    __param(1, (0, common_1.Param)('repo')),
    __param(2, (0, common_1.Param)('base')),
    __param(3, (0, common_1.Param)('head')),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "compareCommits", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Get commit diff', description: 'Auth required. Calls git/getCommitDiff for a single commit.' }),
    (0, swagger_1.ApiParam)({ name: 'owner', description: 'GitHub organization or username.' }),
    (0, swagger_1.ApiParam)({ name: 'repo', description: 'Repository name.' }),
    (0, swagger_1.ApiParam)({ name: 'sha', description: 'Commit SHA.' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('github/commit-diff/:owner/:repo/:sha'),
    __param(0, (0, common_1.Param)('owner')),
    __param(1, (0, common_1.Param)('repo')),
    __param(2, (0, common_1.Param)('sha')),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "getCommitDiff", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Analyze commit diff', description: 'Auth required. Calls git/getCommitAnalysis and allows an optional prompt for AI analysis context.' }),
    (0, swagger_1.ApiParam)({ name: 'owner', description: 'GitHub organization or username.' }),
    (0, swagger_1.ApiParam)({ name: 'repo', description: 'Repository name.' }),
    (0, swagger_1.ApiParam)({ name: 'sha', description: 'Commit SHA.' }),
    (0, swagger_1.ApiQuery)({ name: 'prompt', required: false, description: 'Optional custom analysis instruction.' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('github/commit-analysis/:owner/:repo/:sha'),
    __param(0, (0, common_1.Param)('owner')),
    __param(1, (0, common_1.Param)('repo')),
    __param(2, (0, common_1.Param)('sha')),
    __param(3, (0, common_1.Query)('prompt')),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "getCommitAnalysis", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Start GitHub OAuth login', description: 'Builds the GitHub OAuth authorization URL. frontendUrl is encoded into state and used after backend callback completes.' }),
    (0, swagger_1.ApiQuery)({ name: 'frontendUrl', required: false, description: 'Frontend origin to redirect back to after OAuth, for example http://localhost:8080.' }),
    (0, common_1.Get)('auth/github-oauth/redirect'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('frontendUrl')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "githubOAuthRedirect", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Start GitHub OAuth account update', description: 'Auth required. Builds a GitHub OAuth authorization URL and encodes current userId in state to link/update GitHub data for the logged-in user.' }),
    (0, swagger_1.ApiQuery)({ name: 'frontendUrl', required: false, description: 'Frontend origin to redirect back to after OAuth.' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('auth/github-oauth/redirect-update'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('frontendUrl')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "githubOAuthRedirectUpdate", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'GitHub OAuth backend callback', description: 'Callback URL registered with GitHub. Exchanges code in git/github_oauth_callback, obtains app token info, then redirects to frontend /auth/github/callback.' }),
    (0, swagger_1.ApiQuery)({ name: 'code', required: true, description: 'OAuth authorization code returned by GitHub.' }),
    (0, swagger_1.ApiQuery)({ name: 'state', required: false, description: 'Base64url encoded state generated by redirect endpoint.' }),
    (0, common_1.Get)('auth/github-oauth/callback'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __param(2, (0, common_1.Query)('code')),
    __param(3, (0, common_1.Query)('state')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, String]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "githubOAuthCallback", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Start Google OAuth login', description: 'Builds Google OAuth URL. For Vercel frontend, redirect_uri points to the frontend proxy /api/v1/auth/google-oauth/callback; local flow uses GOOGLE_CALLBACK_URL.' }),
    (0, swagger_1.ApiQuery)({ name: 'frontendUrl', required: false, description: 'Frontend origin to redirect back to after OAuth, for example http://localhost:8080 or the Vercel app URL.' }),
    (0, common_1.Get)('auth/google-oauth/redirect'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('frontendUrl')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "googleOAuthRedirect", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Start Google OAuth account update', description: 'Auth required. Builds Google OAuth URL and encodes current userId plus callback URL in state.' }),
    (0, swagger_1.ApiQuery)({ name: 'frontendUrl', required: false, description: 'Frontend origin to redirect back to after OAuth.' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('auth/google-oauth/redirect-update'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('frontendUrl')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "googleOAuthRedirectUpdate", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Google OAuth backend callback', description: 'Callback URL registered with Google. Exchanges code in git/google_oauth_callback using the same redirect_uri stored in state, then redirects to frontend /auth/google/callback with tokens.' }),
    (0, swagger_1.ApiQuery)({ name: 'code', required: true, description: 'OAuth authorization code returned by Google.' }),
    (0, swagger_1.ApiQuery)({ name: 'state', required: false, description: 'Base64url encoded state containing next frontend URL, optional userId and googleCallbackUrl.' }),
    (0, common_1.Get)('auth/google-oauth/callback'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __param(2, (0, common_1.Query)('code')),
    __param(3, (0, common_1.Query)('state')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, String]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "googleOAuthCallback", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Login with email/password', description: 'Calls auth/login. Returns access and refresh tokens when credentials are valid.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['email', 'password'],
            properties: {
                email: { type: 'string', example: 'user@example.com' },
                password: { type: 'string', example: 'secret123' },
                otp: { type: 'string', nullable: true, description: 'Optional OTP code when two-factor flow requires it.' },
            },
        },
    }),
    (0, common_1.Post)('auth/login'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "login", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Request password reset', description: 'Calls auth/reset_password and sends frontendUrl from request origin so reset links return to the correct frontend.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['email'],
            properties: {
                email: { type: 'string', example: 'user@example.com' },
            },
        },
    }),
    (0, common_1.Post)('auth/reset-password'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "resetPassword", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Register a new account', description: 'Calls auth/register and includes frontendUrl from request origin for email confirmation links.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['email', 'password'],
            properties: {
                email: { type: 'string', example: 'user@example.com' },
                password: { type: 'string', example: 'secret123' },
                username: { type: 'string', example: 'natteam' },
                fullName: { type: 'string', example: 'Nat Team' },
            },
        },
    }),
    (0, common_1.Post)('auth/register'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "register", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Update current user profile', description: 'Auth required. Calls auth/update_profile with JWT user plus request body fields.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                username: { type: 'string' },
                fullName: { type: 'string' },
                avatar: { type: 'string' },
                github_installation_id: { type: 'string' },
            },
        },
    }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('auth/update-profile'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "update_profile", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Get current user profile', description: 'Auth required. Calls auth/get_profile using current JWT user id.' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('auth/get-profile'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "get_profile", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Update password', description: 'Auth required. Calls auth/update_password for the current JWT user.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['oldPassword', 'newPassword'],
            properties: {
                oldPassword: { type: 'string' },
                newPassword: { type: 'string' },
            },
        },
    }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('auth/update-password'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "update_password", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Refresh access token', description: 'Calls auth/refresh with a refresh token.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['refreshToken'],
            properties: {
                refreshToken: { type: 'string' },
            },
        },
    }),
    (0, common_1.Post)('auth/refresh-token'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "refresh", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Confirm email', description: 'Calls auth/confirm_email with token from email confirmation link.' }),
    (0, swagger_1.ApiQuery)({ name: 'token', required: true, description: 'Email confirmation token.' }),
    (0, common_1.Get)('auth/confirm-email'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "confirmEmail", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Join channel', description: 'Auth required. Calls chat/joinChannel with current JWT user and channel data.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['channelId'],
            properties: {
                channelId: { type: 'string', description: 'Channel id to join.' },
            },
        },
    }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('channels/join-channel'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "joinChannel", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Create channel', description: 'Auth required. Calls chat/createChannel. Supports personal/group channels based on type and userIds.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['userIds'],
            properties: {
                name: { type: 'string', description: 'Channel name for group channels.' },
                type: { type: 'string', enum: ['personal', 'group'], example: 'group' },
                userIds: { type: 'array', items: { type: 'string' }, description: 'Member ids to add; current user is injected from JWT.' },
            },
        },
    }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('channels/create-channel'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "createChannel", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Update channel', description: 'Auth required. Calls chat/updateChannel. Used by socket and HTTP flows for channel metadata/member changes.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['channelId'],
            properties: {
                channelId: { type: 'string' },
                name: { type: 'string' },
                addUserIds: { type: 'array', items: { type: 'string' } },
                removeUserIds: { type: 'array', items: { type: 'string' } },
            },
        },
    }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('channels/update-channel'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "updateChannel", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Get registered unread channels', description: 'Auth required. Reads socket unread registration data from Redis for the current user.' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('channels/unread-map'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "getUnreadMap", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Search messages by keyword inside channels', description: 'Auth required. Calls chat/searchMessagesByKeyword with current JWT user and request body filters.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['keyword'],
            properties: {
                keyword: { type: 'string', example: 'bug' },
                channelId: { type: 'string' },
                limit: { type: 'number', example: 20 },
                cursor: { type: 'string' },
            },
        },
    }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('channels/search-keyword-messages'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "searchKeywordMessages", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Add repositories to channel', description: 'Auth required. Calls chat/addRepositoriesToChannel.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['channelId', 'repositories'],
            properties: {
                channelId: { type: 'string' },
                repositories: { type: 'array', items: { type: 'object' }, description: 'Repository records or ids selected by the client.' },
            },
        },
    }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('channels/add-repositories'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "addRepositoriesToChannel", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Remove repositories from channel', description: 'Auth required. Calls chat/removeRepositoriesFromChannel.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['channelId'],
            properties: {
                channelId: { type: 'string' },
                repositoryIds: { type: 'array', items: { type: 'string' } },
            },
        },
    }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('channels/remove-repositories'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "removeRepositoriesFromChannel", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List channels for current user', description: 'Auth required. Calls chat/listChannels. Query filters are forwarded to chat service.' }),
    (0, swagger_1.ApiQuery)({ name: 'q', required: false, description: 'Optional search/filter text.', schema: { type: 'string' } }),
    (0, swagger_1.ApiQuery)({ name: 'type', required: false, description: 'Optional channel type filter.', schema: { type: 'string' } }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, description: 'Optional page size.', schema: { type: 'number' } }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('channels/list-channels'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "listChannels", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List online users', description: 'Auth required. Reads all online users tracked by gateway socket Redis presence.' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('users/list-online'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "listOnlineUser", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List messages in channel', description: 'Auth required. Calls chat/listChannelsMessages. Supports cursor pagination and search anchor options.' }),
    (0, swagger_1.ApiParam)({ name: 'channel_id', description: 'Channel id.' }),
    (0, swagger_1.ApiQuery)({ name: 'before', required: false, description: 'Message id cursor for older messages.', schema: { type: 'string' } }),
    (0, swagger_1.ApiQuery)({ name: 'after', required: false, description: 'Message id cursor for newer messages.', schema: { type: 'string' } }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, description: 'Page size.', schema: { type: 'number' } }),
    (0, swagger_1.ApiQuery)({ name: 'messageId', required: false, description: 'Anchor message id for search mode.', schema: { type: 'string' } }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('channels/list-messages/:channel_id'),
    __param(0, (0, common_1.Param)('channel_id')),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "listMessages", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Search chat entities', description: 'Auth required. Calls chat/searchChatEntities. Searches channels/messages by key and type.' }),
    (0, swagger_1.ApiQuery)({ name: 'key', required: true, description: 'Search keyword.' }),
    (0, swagger_1.ApiQuery)({ name: 'type', required: false, description: 'Entity type filter.', schema: { type: 'string' } }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, description: 'Maximum result count.', schema: { type: 'number', default: 5 } }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('channels/search-chat'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "SearchChat", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List channels by repository', description: 'Auth required. Calls chat/listChannelsByRepository.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['repositoryId'],
            properties: {
                repositoryId: { type: 'string' },
                repositoryUrl: { type: 'string' },
            },
        },
    }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('channels/repository-channels'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "listChannelsByRepository", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Search users', description: 'Auth required. Calls auth/searchUsers with key and limit.' }),
    (0, swagger_1.ApiQuery)({ name: 'key', required: true, description: 'Username/email/name search text.' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, description: 'Maximum result count.', schema: { type: 'number', default: 5 } }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('users/search-user'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "SearchUsers", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Add members to channel', description: 'Auth required. Calls chat/addMembersToChannel.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['channelId', 'userIds'],
            properties: {
                channelId: { type: 'string' },
                userIds: { type: 'array', items: { type: 'string' } },
            },
        },
    }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('channels/add-members'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "addMembersToChannel", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Remove members from channel', description: 'Auth required. Calls chat/removeMembersFromChannel.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['channelId', 'userIds'],
            properties: {
                channelId: { type: 'string' },
                userIds: { type: 'array', items: { type: 'string' } },
            },
        },
    }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('channels/remove-members'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "removeMembersFromChannel", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List users not in channel', description: 'Auth required. Calls chat/listNonMembers for add-member UI.' }),
    (0, swagger_1.ApiParam)({ name: 'channelId', description: 'Channel id.' }),
    (0, swagger_1.ApiQuery)({ name: 'username', required: false, description: 'Search text for username/email/name.' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, description: 'Page size.', schema: { type: 'number' } }),
    (0, swagger_1.ApiQuery)({ name: 'cursor', required: false, description: 'Pagination cursor.' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('channels/:channelId/list-non-members'),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, common_1.Query)('username')),
    __param(2, (0, common_1.Query)('limit')),
    __param(3, (0, common_1.Query)('cursor')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "listNonMembers", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Search messages globally or by channel', description: 'Auth required. Calls chat/searchMessages. Supports sender/date/channel filters and cursor pagination.' }),
    (0, swagger_1.ApiQuery)({ name: 'query', required: true, description: 'Text search query.' }),
    (0, swagger_1.ApiQuery)({ name: 'channelId', required: false, description: 'Filter by channel id.', schema: { type: 'number' } }),
    (0, swagger_1.ApiQuery)({ name: 'senderId', required: false, description: 'Filter by sender user id.', schema: { type: 'number' } }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', required: false, description: 'ISO date lower bound.' }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', required: false, description: 'ISO date upper bound.' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, description: 'Page size.', schema: { type: 'number' } }),
    (0, swagger_1.ApiQuery)({ name: 'cursor', required: false, description: 'Message id cursor.', schema: { type: 'number' } }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('messages/search'),
    __param(0, (0, common_1.Query)('query')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Query)('channelId')),
    __param(3, (0, common_1.Query)('senderId')),
    __param(4, (0, common_1.Query)('startDate')),
    __param(5, (0, common_1.Query)('endDate')),
    __param(6, (0, common_1.Query)('limit')),
    __param(7, (0, common_1.Query)('cursor')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "searchMessages", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Create file presigned upload URL', description: 'Auth required. Calls upload/getPresignedUrl. Used before sending file-upload messages.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['filename', 'contentType'],
            properties: {
                filename: { type: 'string', example: 'report.pdf' },
                contentType: { type: 'string', example: 'application/pdf' },
                size: { type: 'number', description: 'Optional file size in bytes.' },
                channelId: { type: 'string', description: 'Optional channel id for validation/context.' },
            },
        },
    }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('upload/get-presigned-url'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "getPresignedUrl", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Get object public/read URL', description: 'Auth required. Calls upload/getObject.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['key'],
            properties: {
                key: { type: 'string', description: 'Object storage key.' },
            },
        },
    }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('upload/get-object-url'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "getObjectUrl", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Create avatar presigned upload URL', description: 'Auth required. Calls upload/getAvatarPresignedUrl for the current JWT user.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['filename', 'contentType'],
            properties: {
                filename: { type: 'string', example: 'avatar.png' },
                contentType: { type: 'string', example: 'image/png' },
            },
        },
    }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('upload/get-avatar-presigned-url'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "getAvatarPresignedUrl", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Get spreadsheet export URL', description: 'Auth required. Calls upload/getSheetUrl for a channel.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['channelId'],
            properties: {
                channelId: { type: 'string' },
            },
        },
    }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('upload/get-sheet-url'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "getSheetUrl", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List channel attachments', description: 'Auth required. Calls upload/getAttachmentsByChannel with pagination and file filters.' }),
    (0, swagger_1.ApiParam)({ name: 'channelId', description: 'Channel id.' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, description: 'Page size.', schema: { type: 'number' } }),
    (0, swagger_1.ApiQuery)({ name: 'cursor', required: false, description: 'Attachment cursor.', schema: { type: 'number' } }),
    (0, swagger_1.ApiQuery)({ name: 'filename', required: false, description: 'Filter by filename.' }),
    (0, swagger_1.ApiQuery)({ name: 'mimeType', required: false, description: 'Filter by MIME type.' }),
    (0, swagger_1.ApiQuery)({ name: 'senderId', required: false, description: 'Filter by sender user id.' }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', required: false, description: 'ISO date lower bound.' }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', required: false, description: 'ISO date upper bound.' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('channels/:channelId/attachments'),
    __param(0, (0, common_1.Param)('channelId')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Query)('limit')),
    __param(3, (0, common_1.Query)('cursor')),
    __param(4, (0, common_1.Query)('filename')),
    __param(5, (0, common_1.Query)('mimeType')),
    __param(6, (0, common_1.Query)('senderId')),
    __param(7, (0, common_1.Query)('startDate')),
    __param(8, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "getAttachmentsByChannel", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Get repositories from GitHub installation', description: 'Auth required. Calls git/get_repo_installation and caches by current user plus body for 60 seconds.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                installationId: { type: 'string', description: 'Optional GitHub installation id.' },
                page: { type: 'number' },
                per_page: { type: 'number' },
                search: { type: 'string' },
            },
        },
    }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('git/get_repo_installation'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "get_repo_installation", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Get repository data by URL', description: 'Auth required. Calls git/get_repo_data_by_url and caches result by user and URL for 3 minutes.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['url'],
            properties: {
                url: { type: 'string', example: 'https://github.com/owner/repo' },
            },
        },
    }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('git/get_repo_data_by_url'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "get_repo_data_by_url", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Get repository data for a channel', description: 'Auth required. First calls chat/listRepositoriesByChannel, then git/get_repo_by_ids for repository details. Uses snapshot cache to avoid repeated Git calls.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['channelId'],
            properties: {
                channelId: { type: 'string' },
            },
        },
    }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('git/get_list_repo_data_by_channel'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "get_list_repo_data_by_channel", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'List notifications', description: 'Auth required. Calls notification/get_notifications for current JWT user.' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, description: 'Page size.', schema: { type: 'number' } }),
    (0, swagger_1.ApiQuery)({ name: 'cursor', required: false, description: 'Pagination cursor.' }),
    (0, swagger_1.ApiQuery)({ name: 'type', required: false, description: 'Notification type filter.', schema: { type: 'string' } }),
    (0, swagger_1.ApiQuery)({ name: 'isRead', required: false, description: 'Read-state filter.', schema: { type: 'boolean' } }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('notifications'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "getNotifications", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Mark notification as read', description: 'Auth required. Calls notification/mark_as_read.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', description: 'Notification id.' },
            },
        },
    }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('notifications/mark-as-read'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "markAsRead", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Mark all notifications as read', description: 'Auth required. Calls notification/mark_all_as_read for current JWT user.' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('notifications/mark-all-as-read'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "markAllAsRead", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Count unread notifications', description: 'Auth required. Calls notification/get_number_unread_notifications for current JWT user.' }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('notifications/count-unread'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "countUnreadNotifications", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Admin user management', description: 'Auth required. Calls auth/admin_user_management. Body must include the management action expected by AuthService.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['action'],
            properties: {
                action: { type: 'string', description: 'Admin action, for example list, update, delete, lock or unlock.' },
                userId: { type: 'string', description: 'Target user id for single-user actions.' },
                data: { type: 'object', description: 'Action-specific payload.' },
            },
        },
    }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('admin/users'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "adminUserManagement", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Admin channel management', description: 'Auth required. Calls chat/admin_channel_management. Body must include the management action expected by ChatService.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['action'],
            properties: {
                action: { type: 'string', description: 'Admin action, for example list, update, delete or stats.' },
                channelId: { type: 'string', description: 'Target channel id for single-channel actions.' },
                data: { type: 'object', description: 'Action-specific payload.' },
            },
        },
    }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('admin/channels'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "adminChannelManagement", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Admin file management', description: 'Auth required. Calls upload/admin_file_management. Body must include the management action expected by UploadService.' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['action'],
            properties: {
                action: { type: 'string', description: 'Admin action, for example list, unlink, delete or stats.' },
                fileId: { type: 'string', description: 'Target file/attachment id for single-file actions.' },
                data: { type: 'object', description: 'Action-specific payload.' },
            },
        },
    }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('admin/files'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "adminFileManagement", null);
exports.GatewayController = GatewayController = __decorate([
    (0, swagger_1.ApiTags)('Gateway API'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.Controller)('api'),
    __param(3, (0, common_1.Inject)(cache_manager_1.CACHE_MANAGER)),
    __metadata("design:paramtypes", [gateway_service_1.GatewayService,
        socket_service_1.ChatSocketService,
        kafka_service_1.KafkaService, Object])
], GatewayController);
//# sourceMappingURL=gateway.controller.js.map