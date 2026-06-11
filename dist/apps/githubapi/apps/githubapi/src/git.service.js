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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const entities_1 = require("../../../libs/entities/src");
const entities_2 = require("../../../libs/entities/src");
const common_2 = require("../../../libs/common/src");
const jwt = __importStar(require("jsonwebtoken"));
async function fetchWithTimeout(url, init, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal,
        });
    }
    finally {
        clearTimeout(timeoutId);
    }
}
let GitService = class GitService extends common_2.BaseService {
    constructor(messageRepo, channelRepo, userRepo) {
        super(messageRepo);
        this.messageRepo = messageRepo;
        this.channelRepo = channelRepo;
        this.userRepo = userRepo;
    }
    async initGenAI() {
        const { GoogleGenAI } = await import('@google/genai');
        this.genAI = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
        });
    }
    cleanCommitData(rawCommit) {
        const cleanedFiles = rawCommit.files
            .filter((file) => {
            const ignorePatterns = [
                'package-lock.json',
                'yarn.lock',
                '.png',
                '.jpg',
                '.svg',
            ];
            return !ignorePatterns.some((pattern) => file.filename.endsWith(pattern));
        })
            .map((file) => ({
            filename: file.filename,
            status: file.status,
            additions: file.additions,
            deletions: file.deletions,
            patch: file.patch || '[No patch data - Binary or Large File]',
        }));
        return {
            message: rawCommit.commit.message,
            author: rawCommit.commit.author.name,
            date: rawCommit.commit.author.date,
            stats: rawCommit.stats,
            files: cleanedFiles,
        };
    }
    formatCommitToPrompt(data) {
        let promptContext = `Commit Message: ${data.message}\n`;
        promptContext += `Author: ${data.author}\n`;
        promptContext += `Stats: +${data.stats.additions} / -${data.stats.deletions}\n\n`;
        promptContext += `--- CHANGES ---\n`;
        data.files.forEach((file) => {
            promptContext += `File: ${file.filename} (${file.status})\n`;
            if (file.patch) {
                promptContext += `Diff:\n${file.patch}\n`;
            }
            promptContext += `----------------\n`;
        });
        return promptContext;
    }
    async exchangeOAuthCodeForToken(code) {
        const res = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code,
                redirect_uri: process.env.GITHUB_CALLBACK_URL,
            }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
            return {
                ok: false,
                status: res.status,
                error: data.error_description || data.error || JSON.stringify(data),
            };
        }
        return { ok: true, token: data.access_token };
    }
    normalizeFrontendUrl(frontendUrl) {
        if (!frontendUrl) {
            throw new common_2.RpcCustomException('Missing frontend origin header', 400);
        }
        return frontendUrl.replace(/\/+$/, '');
    }
    async githubOAuthCallback(req, code, state, frontendUrl) {
        var _a, _b;
        try {
            if (!code) {
                throw new common_2.RpcCustomException('Missing code', 400);
            }
            const result = await this.exchangeOAuthCodeForToken(code);
            if (!result.ok) {
                throw new common_2.RpcCustomException(`token exchange failed: ${result.status} ${result.error}`, 400);
            }
            const userToken = result.token;
            const ghUser = await this.fetchGitHubUser(userToken);
            let email = (_a = ghUser.email) !== null && _a !== void 0 ? _a : (await this.fetchPrimaryEmail(userToken));
            if (!email) {
                email = `${ghUser.id}+noreply@users.github.com`;
            }
            let user = null;
            if (state) {
                user = await this.userRepo.findOne({ where: { id: state } });
            }
            else {
                user = await this.userRepo.findOne({ where: { github_email: email } });
            }
            if (user) {
                user = await this.updateGithubUserInfoIfChanged(user.id, userToken);
                if (user.github_verified && !state) {
                    return {
                        user: { id: user.id },
                        isInstall: false,
                    };
                }
                if ((!user.github_installation_id && state) ||
                    (state && !user.github_verified)) {
                    const nextUrl = this.normalizeFrontendUrl(frontendUrl);
                    const statePayload = { next: nextUrl, userId: user.id };
                    const encoded = Buffer.from(JSON.stringify(statePayload), 'utf8').toString('base64url');
                    const installUrl = this.getInstallAppUrl(encoded);
                    return {
                        nextUrl: installUrl,
                        user: { id: user.id },
                        isInstall: true,
                    };
                }
                if (!user.github_verified && !user.github_installation_id && !state) {
                    const nextUrl = this.normalizeFrontendUrl(frontendUrl);
                    const statePayload = { next: nextUrl, userId: user.id };
                    const encoded = Buffer.from(JSON.stringify(statePayload), 'utf8').toString('base64url');
                    const installUrl = this.getInstallAppUrl(encoded);
                    return {
                        nextUrl: installUrl,
                        user: { id: user.id },
                        isInstall: true,
                    };
                }
                return {
                    user: { id: user.id },
                    isInstall: false,
                };
            }
            user = this.userRepo.create({
                email,
                username: (_b = ghUser.login) !== null && _b !== void 0 ? _b : null,
                role: 'user',
                github_user_id: String(ghUser.id),
                github_avatar: ghUser.avatar_url,
                github_email: email,
                github_verified: true,
                provider: 'github',
                provider_id: String(ghUser.id),
            });
            await this.userRepo.save(user);
            const nextUrl = this.normalizeFrontendUrl(frontendUrl);
            const statePayload = { next: nextUrl, userId: user.id };
            const encoded = Buffer.from(JSON.stringify(statePayload), 'utf8').toString('base64url');
            const installUrl = this.getInstallAppUrl(encoded);
            req.session = {
                user: {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    githubOAuthToken: userToken,
                    githubVerified: true,
                },
            };
            return { nextUrl: installUrl, user, isInstall: true };
        }
        catch (error) {
            if (error instanceof common_2.RpcCustomException) {
                throw error;
            }
            throw new common_2.RpcCustomException('Không thể xác thực người dùng GitHub hoặc đã tồn tại tài khoản', 404);
        }
    }
    async exchangeGoogleOAuthCodeForToken(code, redirectUriOverride) {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const redirectUri = redirectUriOverride || process.env.GOOGLE_CALLBACK_URL;
        console.log('[GoogleOAuth][git][token-exchange:start]', {
            hasCode: Boolean(code),
            hasClientId: Boolean(clientId),
            hasClientSecret: Boolean(clientSecret),
            redirectUri,
            redirectUriSource: redirectUriOverride ? 'callback-state' : 'env',
        });
        if (!clientId || !clientSecret || !redirectUri) {
            console.error('[GoogleOAuth][git][token-exchange:missing-env]', {
                hasClientId: Boolean(clientId),
                hasClientSecret: Boolean(clientSecret),
                hasRedirectUri: Boolean(redirectUri),
            });
            return {
                ok: false,
                status: 500,
                error: 'Missing required Google OAuth environment variables',
            };
        }
        const res = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                code,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
            }),
        }, 15000);
        const data = await res.json();
        console.log('[GoogleOAuth][git][token-exchange:response]', {
            status: res.status,
            ok: res.ok,
            hasAccessToken: Boolean(data === null || data === void 0 ? void 0 : data.access_token),
            error: data === null || data === void 0 ? void 0 : data.error,
            errorDescription: data === null || data === void 0 ? void 0 : data.error_description,
        });
        if (!res.ok || data.error) {
            return {
                ok: false,
                status: res.status,
                error: data.error_description || data.error || JSON.stringify(data),
            };
        }
        return { ok: true, token: data.access_token };
    }
    async googleOAuthCallback(code, state, frontendUrl, redirectUri) {
        var _a, _b;
        console.log('[GoogleOAuth][git][callback:start]', {
            hasCode: Boolean(code),
            state,
            frontendUrl,
            redirectUri,
        });
        try {
            if (!code) {
                throw new common_2.RpcCustomException('Missing code', 400);
            }
            const result = await this.exchangeGoogleOAuthCodeForToken(code, redirectUri);
            if (!result.ok) {
                throw new common_2.RpcCustomException(`token exchange failed: ${result.status} ${result.error}`, 400);
            }
            const googleUser = await this.fetchGoogleUser(result.token);
            console.log('[GoogleOAuth][git][userinfo:success]', {
                sub: googleUser === null || googleUser === void 0 ? void 0 : googleUser.sub,
                email: googleUser === null || googleUser === void 0 ? void 0 : googleUser.email,
                emailVerified: googleUser === null || googleUser === void 0 ? void 0 : googleUser.email_verified,
                hasName: Boolean(googleUser === null || googleUser === void 0 ? void 0 : googleUser.name),
                hasPicture: Boolean(googleUser === null || googleUser === void 0 ? void 0 : googleUser.picture),
            });
            if (!(googleUser === null || googleUser === void 0 ? void 0 : googleUser.sub) || !(googleUser === null || googleUser === void 0 ? void 0 : googleUser.email)) {
                throw new common_2.RpcCustomException('Google account has no verified identity', 400);
            }
            if (googleUser.email_verified === false) {
                throw new common_2.RpcCustomException('Google email is not verified', 400);
            }
            let user = null;
            if (state) {
                console.log('[GoogleOAuth][git][user:lookup-by-state]', { state });
                user = await this.userRepo.findOne({ where: { id: state } });
                if (!user) {
                    throw new common_2.RpcCustomException('User not found', 404);
                }
                const emailOwner = await this.userRepo.findOne({
                    where: { email: googleUser.email },
                });
                console.log('[GoogleOAuth][git][user:email-owner-check]', {
                    stateUserId: user.id,
                    emailOwnerId: emailOwner === null || emailOwner === void 0 ? void 0 : emailOwner.id,
                });
                if (emailOwner && String(emailOwner.id) !== String(user.id)) {
                    throw new common_2.RpcCustomException('Google email belongs to another user', 409);
                }
            }
            else {
                console.log('[GoogleOAuth][git][user:lookup-by-google]', {
                    providerId: String(googleUser.sub),
                    email: googleUser.email,
                });
                user = await this.userRepo.findOne({
                    where: [
                        { provider: 'google', provider_id: String(googleUser.sub) },
                        { email: googleUser.email },
                    ],
                });
            }
            if (user) {
                console.log('[GoogleOAuth][git][user:found]', {
                    userId: user.id,
                    isActive: user.isActive,
                    provider: user.provider,
                    hasProviderId: Boolean(user.provider_id),
                });
                if (!user.isActive) {
                    throw new common_2.RpcCustomException('User is disabled', 403);
                }
                let changed = false;
                if (!user.provider || user.provider === 'google') {
                    if (user.provider !== 'google') {
                        user.provider = 'google';
                        changed = true;
                    }
                    if (user.provider_id !== String(googleUser.sub)) {
                        user.provider_id = String(googleUser.sub);
                        changed = true;
                    }
                }
                if (!user.username && googleUser.name) {
                    user.username = googleUser.name;
                    changed = true;
                }
                if (!user.avatar && googleUser.picture) {
                    user.avatar = googleUser.picture;
                    changed = true;
                }
                if (!user.email_verified) {
                    user.email_verified = true;
                    changed = true;
                }
                if (changed) {
                    await this.userRepo.save(user);
                }
                console.log('[GoogleOAuth][git][user:return-existing]', {
                    userId: user.id,
                    changed,
                });
                return { user: { id: user.id } };
            }
            user = this.userRepo.create({
                email: googleUser.email,
                username: (_a = googleUser.name) !== null && _a !== void 0 ? _a : googleUser.email.split('@')[0],
                role: 'user',
                avatar: (_b = googleUser.picture) !== null && _b !== void 0 ? _b : null,
                email_verified: true,
                provider: 'google',
                provider_id: String(googleUser.sub),
            });
            await this.userRepo.save(user);
            console.log('[GoogleOAuth][git][user:created]', {
                userId: user.id,
                email: user.email,
            });
            return { user: { id: user.id } };
        }
        catch (error) {
            console.error('[GoogleOAuth][git][callback:error]', {
                message: error === null || error === void 0 ? void 0 : error.message,
                name: error === null || error === void 0 ? void 0 : error.name,
                response: error === null || error === void 0 ? void 0 : error.response,
                status: error === null || error === void 0 ? void 0 : error.status,
                stack: error === null || error === void 0 ? void 0 : error.stack,
            });
            if (error instanceof common_2.RpcCustomException) {
                throw error;
            }
            if ((error === null || error === void 0 ? void 0 : error.name) === 'AbortError') {
                throw new common_2.RpcCustomException('Google OAuth request timed out', 504);
            }
            throw new common_2.RpcCustomException('Khong the xac thuc nguoi dung Google hoac tai khoan da ton tai', 404);
        }
    }
    async fetchGoogleUser(accessToken) {
        console.log('[GoogleOAuth][git][userinfo:start]', {
            hasAccessToken: Boolean(accessToken),
        });
        const res = await fetchWithTimeout('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
        }, 15000);
        if (!res.ok) {
            const body = await res.text();
            console.error('[GoogleOAuth][git][userinfo:error]', {
                status: res.status,
                body,
            });
            throw new common_2.RpcCustomException('Failed to fetch Google user');
        }
        return res.json();
    }
    async fetchGitHubUser(userToken) {
        const res = await fetch('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${userToken}` },
        });
        if (!res.ok)
            throw new common_2.RpcCustomException('Failed to fetch /user');
        return res.json();
    }
    async fetchPrimaryEmail(userToken) {
        var _a, _b;
        const res = await fetch('https://api.github.com/user/emails', {
            headers: { Authorization: `Bearer ${userToken}` },
        });
        if (!res.ok)
            return null;
        const emails = await res.json();
        const primary = (_a = emails === null || emails === void 0 ? void 0 : emails.find((e) => e.primary)) !== null && _a !== void 0 ? _a : emails === null || emails === void 0 ? void 0 : emails[0];
        return (_b = primary === null || primary === void 0 ? void 0 : primary.email) !== null && _b !== void 0 ? _b : null;
    }
    async listUserInstallations(userToken) {
        const res = await fetch('https://api.github.com/user/installations', {
            headers: {
                Authorization: `Bearer ${userToken}`,
                Accept: 'application/vnd.github+json',
            },
        });
        const text = await res.text();
        if (!res.ok) {
        }
        return JSON.parse(text);
    }
    createAppJWT() {
        const now = Math.floor(Date.now() / 1000);
        const payload = {
            iat: now - 60,
            exp: now + 9 * 60,
            iss: process.env.GITHUB_APP_ID,
        };
        const privateKey = (process.env.GITHUB_APP_PRIVATE_KEY || '').replace(/\\n/g, '\n');
        return jwt.sign(payload, privateKey, { algorithm: 'RS256' });
    }
    async createInstallationAccessToken(installationId) {
        if (!installationId || Number.isNaN(Number(installationId))) {
            throw new common_2.RpcCustomException(`Invalid installationId: ${installationId}`, 400);
        }
        const appJwt = this.createAppJWT();
        const url = `https://api.github.com/app/installations/${installationId}/access_tokens`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${appJwt}`,
                Accept: 'application/vnd.github+json',
                'User-Agent': 'mychat-app/1.0 (+http://localhost:3088)',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        });
        const bodyText = await res.text();
        const reqId = res.headers.get('x-github-request-id');
        const ratelimit = `${res.headers.get('x-ratelimit-remaining')}/${res.headers.get('x-ratelimit-limit')}`;
        const wwwAuth = res.headers.get('www-authenticate');
        if (res.status !== 201) {
            if (wwwAuth)
                console.error('[IAT] www-authenticate=', wwwAuth);
            try {
                const j = JSON.parse(bodyText);
                `Failed to create IAT: ${res.status} ${j.message || ''}`;
            }
            catch {
                `Failed to create IAT: ${res.status}`;
            }
        }
        try {
            return JSON.parse(bodyText);
        }
        catch {
        }
    }
    async fetchFromGithubEndpoint(userId, endpoint, params = {}, method = 'GET') {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user)
            throw new common_2.RpcCustomException('User not found', 404);
        const iatRes = await this.createInstallationAccessToken(Number(user.github_installation_id));
        const url = new URL(`https://api.github.com/${endpoint}`);
        Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
        const fetchOptions = {
            method: method,
            headers: {
                Authorization: `Bearer ${iatRes.token}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json',
            },
        };
        if (method === 'POST' || method === 'PUT') {
            fetchOptions.body = JSON.stringify(params);
        }
        const res = await fetch(url.toString(), fetchOptions);
        if (!res.ok) {
            throw new common_2.RpcCustomException(`GitHub API failed: ${res.statusText}`, res.status);
        }
        return res.json();
    }
    async listInstallationRepos(userId, data) {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user)
            throw new common_2.RpcCustomException('User not found', 404);
        const dataUserId = (user === null || user === void 0 ? void 0 : user.role) === 'admin' && data.toUserId ? data.toUserId : userId;
        const result = await this.fetchFromGithubEndpoint(dataUserId, 'installation/repositories', {
            page: data.page,
            per_page: data.perPage,
        });
        return result;
    }
    async fetchFromGithubUrl(userId, rawUrl, params = {}) {
        var _a;
        const whereClause = params.installation_id
            ? { github_installation_id: params.installation_id }
            : { id: userId };
        const user = await this.userRepo.findOne({ where: whereClause });
        if (!user)
            throw new common_2.RpcCustomException('User not found', 404);
        const installationId = Number((_a = user.github_installation_id) !== null && _a !== void 0 ? _a : params.installation_id);
        const iatRes = await this.createInstallationAccessToken(installationId);
        const cleanUrl = rawUrl.replace(/\{.*\}/, '');
        const url = new URL(cleanUrl);
        Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
        const res = await fetch(url, {
            headers: {
                Authorization: `Bearer ${iatRes.token}`,
                Accept: 'application/vnd.github+json',
            },
        });
        return res.json();
    }
    async getMultipleReposInfo(items) {
        const promises = items.map((item) => {
            const rawUrl = `https://api.github.com/repositories/${item.repo_id}`;
            return this.fetchFromGithubUrl(item.user_id, rawUrl);
        });
        const allData = await Promise.all(promises);
        return allData.map((data, index) => ({
            repo_id: items[index].repo_id,
            user_id: items[index].user_id,
            repo_installation: items[index].repo_installation,
            repo_info: data,
        }));
    }
    async loadFromRepoLink(userId, url, params) {
        return this.fetchFromGithubUrl(userId, url, params);
    }
    async createPullRequest(iat, owner, repo, params) {
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${iat}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(params),
        });
        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`Failed to create PR: ${res.status} ${txt}`);
        }
        return res.json();
    }
    getInstallAppUrl(state) {
        const slug = process.env.GITHUB_APP_SLUG;
        const base = `https://github.com/apps/${slug}/installations/new`;
        if (!state)
            return base;
        return `${base}?state=${encodeURIComponent(state)}`;
    }
    async githubAppSetup(userId, installationId, userToken) {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user)
            throw new common_2.RpcCustomException('User not found', 404);
        user.github_installation_id = String(installationId);
        await this.userRepo.save(user);
        return {
            github_installation_id: installationId,
            github_user_id: user.github_user_id,
            github_login: user.github_login,
            github_email: user.github_email,
            github_avatar: user.github_avatar,
        };
    }
    async updateGithubUserInfoIfChanged(userId, userToken) {
        var _a;
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user)
            throw new common_2.RpcCustomException('User not found', 404);
        let changed = false;
        const ghUser = await this.fetchGitHubUser(userToken);
        const email = (_a = ghUser.email) !== null && _a !== void 0 ? _a : (await this.fetchPrimaryEmail(userToken));
        if (ghUser) {
            if (user.github_user_id !== String(ghUser.id)) {
                user.github_user_id = String(ghUser.id);
                changed = true;
            }
            if (user.github_login !== ghUser.login) {
                user.github_login = ghUser.login;
                changed = true;
            }
            if (!user.github_verified) {
                user.github_verified = true;
                changed = true;
            }
            if (user.github_avatar !== ghUser.avatar_url) {
                user.github_avatar = ghUser.avatar_url;
                changed = true;
            }
        }
        if (email && user.github_email !== email) {
            user.github_email = email;
            changed = true;
        }
        if (changed) {
            await this.userRepo.save(user);
            return user;
        }
        return null;
    }
    async unlinkGitHubApp(userId) {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) {
            throw new common_2.RpcCustomException('User not found', 404);
        }
        const installationId = user.github_installation_id;
        if (!installationId) {
            throw new common_2.RpcCustomException('User has no GitHub App installation', 400);
        }
        let githubUnlinkSuccess = false;
        try {
            await this.deleteInstallation(Number(installationId));
            githubUnlinkSuccess = true;
            console.log(`✅ Successfully uninstalled GitHub App for installation ${installationId}`);
        }
        catch (error) {
            console.warn(`⚠️ Failed to uninstall from GitHub: ${error.message}`);
        }
        const repoRepo = this.messageRepo.manager.getRepository('Repository');
        const repos = await repoRepo
            .createQueryBuilder('repo')
            .leftJoinAndSelect('repo.channels', 'channels')
            .leftJoin('repo.user', 'user')
            .where('user.github_installation_id = :installationId', {
            installationId,
        })
            .getMany();
        for (const repo of repos) {
            if (repo.channels && repo.channels.length > 0) {
                repo.channels = [];
                await repoRepo.save(repo);
            }
        }
        if (repos.length > 0) {
            const repoIds = repos.map((repo) => repo.id);
            await repoRepo.delete({ id: (0, typeorm_2.In)(repoIds) });
        }
        user.github_installation_id = null;
        user.github_verified = false;
        user.github_user_id = null;
        user.github_email = null;
        user.github_avatar = null;
        await this.userRepo.save(user);
        return {
            message: 'GitHub App unlinked successfully',
            userId: user.id,
            removedInstallationId: installationId,
            removedReposCount: repos.length,
            githubUnlinkSuccess,
        };
    }
    async deleteInstallation(installationId) {
        const appJwt = this.createAppJWT();
        const url = `https://api.github.com/app/installations/${installationId}`;
        const res = await fetch(url, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${appJwt}`,
                Accept: 'application/vnd.github+json',
                'User-Agent': 'mychat-app/1.0',
                'X-GitHub-Api-Version': '2022-11-28',
            },
        });
        if (!res.ok) {
            const errorText = await res.text();
            throw new common_2.RpcCustomException(`Failed to delete installation: ${res.status} ${errorText}`, res.status);
        }
        return true;
    }
    async getCommitDetails(userId, owner, repo, sha) {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user)
            throw new common_2.RpcCustomException('User not found', 404);
        const iatRes = await this.createInstallationAccessToken(Number(user.github_installation_id));
        const url = `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`;
        const res = await fetch(url, {
            headers: {
                Authorization: `Bearer ${iatRes.token}`,
                Accept: 'application/vnd.github+json',
            },
        });
        if (!res.ok) {
            throw new common_2.RpcCustomException(`Failed to fetch commit: ${res.statusText}`, res.status);
        }
        return res.json();
    }
    async compareCommits(userId, owner, repo, base, head) {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user)
            throw new common_2.RpcCustomException('User not found', 404);
        const iatRes = await this.createInstallationAccessToken(Number(user.github_installation_id));
        const url = `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`;
        const res = await fetch(url, {
            headers: {
                Authorization: `Bearer ${iatRes.token}`,
                Accept: 'application/vnd.github+json',
            },
        });
        if (!res.ok) {
            throw new common_2.RpcCustomException(`Failed to compare commits: ${res.statusText}`, res.status);
        }
        return res;
    }
    async getCommitDiff(userId, owner, repo, sha) {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user)
            throw new common_2.RpcCustomException('User not found', 404);
        const iatRes = await this.createInstallationAccessToken(Number(user.github_installation_id));
        const url = `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`;
        const res = await fetch(url, {
            headers: {
                Authorization: `Bearer ${iatRes.token}`,
                Accept: 'application/vnd.github.v3.diff',
            },
        });
        if (!res.ok) {
            throw new common_2.RpcCustomException(`Failed to fetch diff: ${res.statusText}`, res.status);
        }
        return res.text();
    }
    async getCommitAnalysisFromGemini(userId, owner, repo, sha, prompt) {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user)
            throw new common_2.RpcCustomException('User not found', 404);
        const rawCommit = await this.getCommitDetails(userId, owner, repo, sha);
        console.log('Raw commit', rawCommit);
        if (!rawCommit) {
            throw new Error('Không tìm thấy commit');
        }
        const cleanedData = this.cleanCommitData(rawCommit);
        const context = this.formatCommitToPrompt(cleanedData);
        const finalPrompt = `
    ${prompt}
    
    Đây là chi tiết commit:
    ${context}
  `;
        if (!this.genAI)
            await this.initGenAI();
        try {
            const result = await this.genAI.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
            });
            return result === null || result === void 0 ? void 0 : result.text;
        }
        catch (error) {
            throw new common_2.RpcCustomException(`Failed to analyze commit: ${(error === null || error === void 0 ? void 0 : error.message) || error}`, 500);
        }
    }
};
exports.GitService = GitService;
exports.GitService = GitService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(entities_1.Message)),
    __param(1, (0, typeorm_1.InjectRepository)(entities_2.Channel)),
    __param(2, (0, typeorm_1.InjectRepository)(entities_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], GitService);
//# sourceMappingURL=git.service.js.map