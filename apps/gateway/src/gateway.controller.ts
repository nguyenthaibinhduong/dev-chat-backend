import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Req,
  Res,
  Inject,
  HttpCode,
  Headers,
  InternalServerErrorException,
} from '@nestjs/common';
import { GatewayService } from './gateway.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Request, Response } from 'express';
import { ChatSocketService } from './socket.service';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { KafkaService } from './kafka/kafka.service';
import { log } from 'console';

type StatePayload = {
  next?: string;
  userId?: string | number;
  googleCallbackUrl?: string;
};

function encodeState(obj: StatePayload) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function decodeState(raw?: string): StatePayload | null {
  if (!raw) return null;
  try {
    const s = raw.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(s, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function normalizeOrigin(value?: string): string | undefined {
  const headerValue = value?.split(',')[0]?.trim();
  if (!headerValue) return undefined;

  try {
    return new URL(headerValue).origin;
  } catch {
    return undefined;
  }
}

function getRequestOrigin(req: Request): string {
  const origin = normalizeOrigin(firstHeaderValue(req.headers.origin));
  if (origin) return origin;

  const referer = normalizeOrigin(firstHeaderValue(req.headers.referer));
  if (referer) return referer;

  const forwardedHost = firstHeaderValue(req.headers['x-forwarded-host']);
  if (forwardedHost) {
    const forwardedProto =
      firstHeaderValue(req.headers['x-forwarded-proto']) || req.protocol || 'https';
    return `${forwardedProto.split(',')[0].trim()}://${forwardedHost.split(',')[0].trim()}`;
  }

  const host = firstHeaderValue(req.headers.host);
  return host ? `${req.protocol || 'http'}://${host}` : '';
}

function getFrontendOrigin(req: Request, frontendUrl?: string): string {
  const explicitOrigin = normalizeOrigin(frontendUrl);
  if (explicitOrigin) return explicitOrigin;

  const requestOrigin = getRequestOrigin(req);
  if (requestOrigin) return requestOrigin;

  return normalizeOrigin(process.env.FE_URL) || '';
}

function getGoogleCallbackUrl(req: Request, frontendUrl?: string): string {
  const frontendOrigin = getFrontendOrigin(req, frontendUrl);
  const configuredFrontendOrigin = normalizeOrigin(process.env.FE_URL);
  const realtimeFrontendOrigin = 'https://realtime-dev-chatapp-dnq2.vercel.app';

  if (
    frontendOrigin &&
    (frontendOrigin === configuredFrontendOrigin ||
      frontendOrigin === realtimeFrontendOrigin)
  ) {
    return `${frontendOrigin}/api/v1/auth/google-oauth/callback`;
  }

  const configuredCallbackUrl = process.env.GOOGLE_CALLBACK_URL?.trim();
  if (configuredCallbackUrl) return configuredCallbackUrl;

  return joinFrontendUrl(getRequestOrigin(req), '/v1/api/auth/google-oauth/callback');
}

function joinFrontendUrl(frontendUrl: string, path: string): string {
  return `${frontendUrl.replace(/\/+$/, '')}${path}`;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new InternalServerErrorException(`Missing required environment variable: ${name}`);
  }

  return value;
}

function verifySignature(
  secret: string,
  bodyRaw: Buffer,
  signature256: string,
): boolean {
  const hmac = createHmac('sha256', secret).update(bodyRaw).digest('hex');
  const expected = Buffer.from(`sha256=${hmac}`, 'utf8');
  const received = Buffer.from(signature256 || '', 'utf8');
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

// Tất cả HTTP từ FE đi qua controller này → định tuyến tới Kafka
@ApiTags('Gateway API')
@ApiBearerAuth('access-token')
@Controller('api')
export class GatewayController {
  // FE: GET /api/channels/unread-map
  constructor(
    private readonly gw: GatewayService,
    private readonly ChatSocketService: ChatSocketService,
    private readonly kafka: KafkaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  @ApiOperation({ summary: 'Gateway health check', description: 'Checks whether the HTTP gateway process is alive.' })
  @Get('health')
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

  @ApiOperation({ summary: 'Create GitHub App install URL', description: 'Auth required. Calls git/get_install_app_url and returns a GitHub installation redirect URL. JWT user id is encoded in state.' })
  @UseGuards(JwtAuthGuard)
  @Post('github-app/redirect')
  async githubAppRedirect(@Req() req: Request) {
    const user = req.user as any;
    const state = encodeState({
      next: getRequestOrigin(req),
      userId: user.id,
    });
    const result: any = await this.gw.exec('git', 'get_install_app_url', {
      state,
    });

    return { url: result.data };
  }

  @ApiOperation({ summary: 'Unlink GitHub App installation', description: 'Auth required. Calls git/unlink_github_app for the current JWT user.' })
  @UseGuards(JwtAuthGuard)
  @Post('github-app/uninstall')
  async githubAppUninstall(@Req() req: Request) {
    const user = req.user as any;
    return await this.gw.exec('git', 'unlink_github_app', {
      userId: user.id,
    });
  }

  @ApiOperation({ summary: 'GitHub App setup callback', description: 'Callback from GitHub App installation. Persists installation_id, refreshes token info, then redirects to the frontend callback.' })
  @ApiQuery({ name: 'installation_id', required: true, description: 'GitHub installation id returned by GitHub App setup.' })
  @ApiQuery({ name: 'setup_action', required: false, description: 'GitHub setup action, for example install or update.' })
  @ApiQuery({ name: 'state', required: true, description: 'Base64url encoded state containing userId and next frontend URL.' })
  @Get('github-app/setup')
  async setup(
    @Query('installation_id') installationId: string,
    @Query('setup_action') setupAction: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: any,
  ) {
    // Giải mã state nếu bạn encode userId/redirect
    const stateDecoded: any = decodeState(state);
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
    const result: any = await this.gw.exec('auth', 'get_token_info', {
      userId: stateDecoded.userId,
    });
    if (result && result?.data) {
      const access_token = result.data.access_token;
      const refresh_token = result.data.refresh_token;
      const frontendUrl = stateDecoded.next || getRequestOrigin(req);
      return res.redirect(
        joinFrontendUrl(
          frontendUrl,
          `/auth/github/callback?access_token=${access_token}&refresh_token=${refresh_token}`,
        ),
      );
    } else {
      return res.redirect(stateDecoded.next || getRequestOrigin(req));
    }
  }

  //github webhook
  @ApiOperation({ summary: 'GitHub webhook receiver', description: 'Receives GitHub webhook payload, verifies x-hub-signature-256, then publishes normalized data to Kafka topic github.webhooks.' })
  @Post('github-app/webhook')
  @HttpCode(200)
  @HttpCode(201)
  async handle(
    @Req() req: any,
    @Res() res: any,
    @Headers('x-hub-signature-256') sig256: string,
    @Headers('x-github-event') ghEvent: string,
    @Headers('x-github-delivery') deliveryId: string,
  ) {
    const secret = process.env.GITHUB_APP_WEBHOOK_SECRET || 'ppB6va3mMw';
    const raw = req.rawBody || Buffer.from(JSON.stringify(req.body));

    // Verify chữ ký GitHub
    if (!verifySignature(secret, raw, sig256)) {
      return res.status(401).send('Invalid signature');
    }

    const payload = JSON.parse(raw.toString());

    console.log('Webhook payload', payload);

    if (payload.commits) {
      payload.commits.forEach((commit: any) => {
        console.log('Commit:', commit.id);
        console.log('Message:', commit.message);
        console.log('Added:', commit.added);
        console.log('Modified:', commit.modified);
        console.log('Removed:', commit.removed);
      });
    }

    // Chuẩn hoá message để gửi đi
    const message = {
      deliveryId,
      event: ghEvent, // ví dụ: "pull_request"
      action: payload.action, // ví dụ: "opened"
      installationId: payload.installation?.id,
      repoId: payload.repository?.id,
      repoFullName: payload.repository?.full_name,
      createdAt: new Date().toISOString(),
      data: payload, // giữ nguyên payload gốc
    };

    // Publish vào Kafka topic
    await this.kafka.publish('github.webhooks', message);

    return res.send('OK');
  }

  @ApiOperation({ summary: 'Get GitHub commit details', description: 'Auth required. Calls git/getCommitDetails with owner, repo and sha.' })
  @ApiParam({ name: 'owner', description: 'GitHub organization or username.' })
  @ApiParam({ name: 'repo', description: 'Repository name.' })
  @ApiParam({ name: 'sha', description: 'Commit SHA.' })
  @UseGuards(JwtAuthGuard)
  @Get('github/commit/:owner/:repo/:sha')
  async getCommitDetails(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Param('sha') sha: string,
    @Req() req: Request,
  ) {
    const user = req.user as any;
    return this.gw.exec('git', 'getCommitDetails', {
      userId: user.id,
      owner,
      repo,
      sha,
    });
  }

  @ApiOperation({ summary: 'Compare two GitHub refs', description: 'Auth required. Calls git/compareCommits with owner, repo, base and head.' })
  @ApiParam({ name: 'owner', description: 'GitHub organization or username.' })
  @ApiParam({ name: 'repo', description: 'Repository name.' })
  @ApiParam({ name: 'base', description: 'Base branch, tag or commit SHA.' })
  @ApiParam({ name: 'head', description: 'Head branch, tag or commit SHA.' })
  @UseGuards(JwtAuthGuard)
  @Get('github/compare/:owner/:repo/:base/:head')
  async compareCommits(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Param('base') base: string,
    @Param('head') head: string,
    @Req() req: Request,
  ) {
    const user = req.user as any;
    return this.gw.exec('git', 'compareCommits', {
      userId: user.id,
      owner,
      repo,
      base,
      head,
    });
  }

  @ApiOperation({ summary: 'Get commit diff', description: 'Auth required. Calls git/getCommitDiff for a single commit.' })
  @ApiParam({ name: 'owner', description: 'GitHub organization or username.' })
  @ApiParam({ name: 'repo', description: 'Repository name.' })
  @ApiParam({ name: 'sha', description: 'Commit SHA.' })
  @UseGuards(JwtAuthGuard)
  @Get('github/commit-diff/:owner/:repo/:sha')
  async getCommitDiff(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Param('sha') sha: string,
    @Req() req: Request,
  ) {
    const user = req.user as any;
    if (!user?.id) return { code: 401, msg: 'Unauthorized', data: null };

    return this.gw.exec('git', 'getCommitDiff', {
      userId: user.id,
      owner,
      repo,
      sha,
    });
  }

  @ApiOperation({ summary: 'Analyze commit diff', description: 'Auth required. Calls git/getCommitAnalysis and allows an optional prompt for AI analysis context.' })
  @ApiParam({ name: 'owner', description: 'GitHub organization or username.' })
  @ApiParam({ name: 'repo', description: 'Repository name.' })
  @ApiParam({ name: 'sha', description: 'Commit SHA.' })
  @ApiQuery({ name: 'prompt', required: false, description: 'Optional custom analysis instruction.' })
  @UseGuards(JwtAuthGuard)
  @Get('github/commit-analysis/:owner/:repo/:sha')
  async getCommitAnalysis(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Param('sha') sha: string,
    @Query('prompt') prompt: string,
    @Req() req: Request,
  ) {
    const user = req.user as any;
    if (!user?.id) return { code: 401, msg: 'Unauthorized', data: null };

    const result = await this.gw.exec('git', 'getCommitAnalysis', {
      userId: user.id,
      owner,
      repo,
      sha,
      prompt: prompt ?? '',
    }, {waitMs: 90000});

    return result;
  }

  // ---------- AUTH ----------
  // FE: POST /api/auth/github_oauth?code=...
  @ApiOperation({ summary: 'Start GitHub OAuth login', description: 'Builds the GitHub OAuth authorization URL. frontendUrl is encoded into state and used after backend callback completes.' })
  @ApiQuery({ name: 'frontendUrl', required: false, description: 'Frontend origin to redirect back to after OAuth, for example http://localhost:8080.' })
  @Get('auth/github-oauth/redirect')
  async githubOAuthRedirect(
    @Req() req: Request,
    @Query('frontendUrl') frontendUrl?: string,
  ) {
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

  @ApiOperation({ summary: 'Start GitHub OAuth account update', description: 'Auth required. Builds a GitHub OAuth authorization URL and encodes current userId in state to link/update GitHub data for the logged-in user.' })
  @ApiQuery({ name: 'frontendUrl', required: false, description: 'Frontend origin to redirect back to after OAuth.' })
  @UseGuards(JwtAuthGuard)
  @Post('auth/github-oauth/redirect-update')
  async githubOAuthRedirectUpdate(
    @Req() req: Request,
    @Query('frontendUrl') frontendUrl?: string,
  ) {
    const user = req.user as any;
    if (!user?.id) return { code: 401, msg: 'Unauthorized', data: null };
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

  @ApiOperation({ summary: 'GitHub OAuth backend callback', description: 'Callback URL registered with GitHub. Exchanges code in git/github_oauth_callback, obtains app token info, then redirects to frontend /auth/github/callback.' })
  @ApiQuery({ name: 'code', required: true, description: 'OAuth authorization code returned by GitHub.' })
  @ApiQuery({ name: 'state', required: false, description: 'Base64url encoded state generated by redirect endpoint.' })
  @Get('auth/github-oauth/callback')
  async githubOAuthCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('code') code: string,
    @Query('state') state?: string,
  ) {
    const stateDecoded = decodeState(state);
    const frontendUrl = stateDecoded?.next || getRequestOrigin(req);
    try {
      const safeReq = {
        session: (req as any).session,
        headers: req.headers,
        user: (req as any).user,
      };
      const result: any = await this.gw.exec('git', 'github_oauth_callback', {
        req: safeReq,
        code,
        state: stateDecoded?.userId ?? state ?? undefined,
        frontendUrl,
      });
      if (result?.data && result.data.user) {
        const isInstall = result.data.isInstall;
        if (isInstall) {
          return res.redirect(result?.data?.nextUrl);
        } else {
          const tokenInfo: any = await this.gw.exec('auth', 'get_token_info', {
            userId: result?.data?.user?.id,
          });
          if (tokenInfo && tokenInfo?.data) {
            const access_token = tokenInfo.data.access_token;
            const refresh_token = tokenInfo.data.refresh_token;
            return res.redirect(
              joinFrontendUrl(
                frontendUrl,
                `/auth/github/callback?access_token=${access_token}&refresh_token=${refresh_token}`,
              ),
            );
          } else {
            return res.redirect(frontendUrl);
          }
        }
      }
    } catch {
      return res.redirect(joinFrontendUrl(frontendUrl, '/error?error=githuboauth'));
    }
  }

  @ApiOperation({ summary: 'Start Google OAuth login', description: 'Builds Google OAuth URL. For Vercel frontend, redirect_uri points to the frontend proxy /api/v1/auth/google-oauth/callback; local flow uses GOOGLE_CALLBACK_URL.' })
  @ApiQuery({ name: 'frontendUrl', required: false, description: 'Frontend origin to redirect back to after OAuth, for example http://localhost:8080 or the Vercel app URL.' })
  @Get('auth/google-oauth/redirect')
  async googleOAuthRedirect(
    @Req() req: Request,
    @Query('frontendUrl') frontendUrl?: string,
  ) {
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

  @ApiOperation({ summary: 'Start Google OAuth account update', description: 'Auth required. Builds Google OAuth URL and encodes current userId plus callback URL in state.' })
  @ApiQuery({ name: 'frontendUrl', required: false, description: 'Frontend origin to redirect back to after OAuth.' })
  @UseGuards(JwtAuthGuard)
  @Post('auth/google-oauth/redirect-update')
  async googleOAuthRedirectUpdate(
    @Req() req: Request,
    @Query('frontendUrl') frontendUrl?: string,
  ) {
    const user = req.user as any;
    if (!user?.id) return { code: 401, msg: 'Unauthorized', data: null };

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

  @ApiOperation({ summary: 'Google OAuth backend callback', description: 'Callback URL registered with Google. Exchanges code in git/google_oauth_callback using the same redirect_uri stored in state, then redirects to frontend /auth/google/callback with tokens.' })
  @ApiQuery({ name: 'code', required: true, description: 'OAuth authorization code returned by Google.' })
  @ApiQuery({ name: 'state', required: false, description: 'Base64url encoded state containing next frontend URL, optional userId and googleCallbackUrl.' })
  @Get('auth/google-oauth/callback')
  async googleOAuthCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('code') code: string,
    @Query('state') state?: string,
  ) {
    const stateDecoded = decodeState(state);
    const frontendUrl = stateDecoded?.next || normalizeOrigin(process.env.FE_URL) || getRequestOrigin(req);
    const requestId = Math.random().toString(36).slice(2, 10);
    const redirectUri = stateDecoded?.googleCallbackUrl;

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
        state: stateDecoded?.userId,
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

      const result: any = await this.gw.exec(
        'git',
        'google_oauth_callback',
        gitPayload,
        { waitMs: 90000 },
      );

      console.log('[GoogleOAuth][gateway][git-result]', {
        requestId,
        hasResult: Boolean(result),
        hasData: Boolean(result?.data),
        hasUser: Boolean(result?.data?.user),
        userId: result?.data?.user?.id,
      });

      if (result?.data && result.data.user) {
        const tokenInfo: any = await this.gw.exec('auth', 'get_token_info', {
          userId: result.data.user.id,
        });

        console.log('[GoogleOAuth][gateway][token-info-result]', {
          requestId,
          hasTokenInfo: Boolean(tokenInfo),
          hasData: Boolean(tokenInfo?.data),
          hasAccessToken: Boolean(tokenInfo?.data?.access_token),
          hasRefreshToken: Boolean(tokenInfo?.data?.refresh_token),
        });

        if (tokenInfo?.data) {
          const access_token = tokenInfo.data.access_token;
          const refresh_token = tokenInfo.data.refresh_token;
          const finalRedirect = joinFrontendUrl(
            frontendUrl,
            `/auth/google/callback?access_token=${access_token}&refresh_token=${refresh_token}`,
          );

          console.log('[GoogleOAuth][gateway][redirect-success]', {
            requestId,
            frontendUrl,
            finalRedirectPath: '/auth/google/callback',
          });

          return res.redirect(
            finalRedirect,
          );
        }
      }

      console.warn('[GoogleOAuth][gateway][missing-user-or-token]', {
        requestId,
        result,
      });

      return res.redirect(frontendUrl);
    } catch (error: any) {
      console.error('[GoogleOAuth][gateway][callback:error]', {
        requestId,
        message: error?.message,
        response: error?.response,
        status: error?.status,
        stack: error?.stack,
      });

      return res.redirect(joinFrontendUrl(frontendUrl, '/error?error=googleoauth'));
    }
  }

  // FE: POST /api/auth/login
  // Body: { email: string, password: string, otp?: string }
  @ApiOperation({ summary: 'Login with email/password', description: 'Calls auth/login. Returns access and refresh tokens when credentials are valid.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', example: 'user@example.com' },
        password: { type: 'string', example: 'secret123' },
        otp: { type: 'string', nullable: true, description: 'Optional OTP code when two-factor flow requires it.' },
      },
    },
  })
  @Post('auth/login')
  async login(@Body() dto: any) {
    // uỷ quyền cho AuthService: { cmd: 'login' }
    return this.gw.exec('auth', 'login', dto);
  }



  @ApiOperation({ summary: 'Request password reset', description: 'Calls auth/reset_password and sends frontendUrl from request origin so reset links return to the correct frontend.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', example: 'user@example.com' },
      },
    },
  })
  @Post('auth/reset-password')
  async resetPassword(@Body() dto: any, @Req() req: Request) {
    // uỷ quyền cho AuthService: { cmd: 'reset_password' }
    return this.gw.exec('auth', 'reset_password', {
      ...dto,
      frontendUrl: getRequestOrigin(req),
    });
  }

  @ApiOperation({ summary: 'Register a new account', description: 'Calls auth/register and includes frontendUrl from request origin for email confirmation links.' })
  @ApiBody({
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
  })
  @Post('auth/register')
  async register(@Body() dto: any, @Req() req: Request) {
    return this.gw.exec('auth', 'register', {
      ...dto,
      frontendUrl: getRequestOrigin(req),
    });
  }
  @ApiOperation({ summary: 'Update current user profile', description: 'Auth required. Calls auth/update_profile with JWT user plus request body fields.' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        fullName: { type: 'string' },
        avatar: { type: 'string' },
        github_installation_id: { type: 'string' },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @Post('auth/update-profile')
  async update_profile(@Body() dto: any, @Req() req: Request) {
    // Đính kèm user từ JWT để ChatService kiểm soát quyền truy cập kênh
    const user = req.user as any;
    const payload = { user, ...dto };
    return this.gw.exec('auth', 'update_profile', payload);
  }
  // FE: POST /api/auth/get_profile
  // Body: { userId: string }
  @ApiOperation({ summary: 'Get current user profile', description: 'Auth required. Calls auth/get_profile using current JWT user id.' })
  @UseGuards(JwtAuthGuard)
  @Post('auth/get-profile')
  async get_profile(@Req() req: Request) {
    const user = req.user as any;
    if (!user?.id) return { code: 401, msg: 'Unauthorized', data: null };
    // Lấy map chưa đọc từ Redis
    return this.gw.exec('auth', 'get_profile', { userId: user.id });
  }

  @ApiOperation({ summary: 'Update password', description: 'Auth required. Calls auth/update_password for the current JWT user.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['oldPassword', 'newPassword'],
      properties: {
        oldPassword: { type: 'string' },
        newPassword: { type: 'string' },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @Post('auth/update-password')
  async update_password(@Body() dto: any, @Req() req: Request) {
    const user = req.user as any;
    return this.gw.exec('auth', 'update_password', { user, ...dto });
  }

  // FE: POST /api/auth/refresh
  // Body: { refreshToken: string }
  @ApiOperation({ summary: 'Refresh access token', description: 'Calls auth/refresh with a refresh token.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['refreshToken'],
      properties: {
        refreshToken: { type: 'string' },
      },
    },
  })
  @Post('auth/refresh-token')
  async refresh(@Body() dto: any) {
    return this.gw.exec('auth', 'refresh', dto);
  }

  // FE: POST /api/auth/verify-token

  // @Post('auth/verify-token')
  // async verifyToken(@Body() dto: { token: string }) {
  //   return this.gw.exec('auth', 'verify_token', dto);
  // }

  @ApiOperation({ summary: 'Confirm email', description: 'Calls auth/confirm_email with token from email confirmation link.' })
  @ApiQuery({ name: 'token', required: true, description: 'Email confirmation token.' })
  @Get('auth/confirm-email')
  async confirmEmail(@Query() dto: { token: string }) {
    return this.gw.exec('auth', 'confirm_email', dto);
  }

  @ApiOperation({ summary: 'Join channel', description: 'Auth required. Calls chat/joinChannel with current JWT user and channel data.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['channelId'],
      properties: {
        channelId: { type: 'string', description: 'Channel id to join.' },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @Post('channels/join-channel')
  async joinChannel(@Body() dto: any, @Req() req: Request) {
    // Đính kèm user từ JWT để ChatService kiểm soát quyền truy cập kênh
    const user = req.user as any;
    const payload = { user, ...dto };
    console.log('Join Channel Payload:', payload);
    
    return this.gw.exec('chat', 'joinChannel', payload);
  }
  // ---------- CHAT ----------
  // FE: POST /api/channels/:channelId/messages
  // Body: { text: string, snippetId?: string }
  // Param: channelId: string
  @ApiOperation({ summary: 'Create channel', description: 'Auth required. Calls chat/createChannel. Supports personal/group channels based on type and userIds.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['userIds'],
      properties: {
        name: { type: 'string', description: 'Channel name for group channels.' },
        type: { type: 'string', enum: ['personal', 'group'], example: 'group' },
        userIds: { type: 'array', items: { type: 'string' }, description: 'Member ids to add; current user is injected from JWT.' },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @Post('channels/create-channel')
  async createChannel(@Body() dto: any, @Req() req: Request) {
    // Đính kèm user từ JWT để ChatService kiểm soát quyền truy cập kênh
    const user = req.user as any;
    const payload = { user, ...dto };
    return this.gw.exec('chat', 'createChannel', payload);
  }

  @ApiOperation({ summary: 'Update channel', description: 'Auth required. Calls chat/updateChannel. Used by socket and HTTP flows for channel metadata/member changes.' })
  @ApiBody({
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
  })
  @UseGuards(JwtAuthGuard)
  @Post('channels/update-channel')
  async updateChannel(@Body() dto: any, @Req() req: Request) {
    // Đính kèm user từ JWT để ChatService kiểm soát quyền truy cập kênh
    const user = req.user as any;
    const payload = { user, ...dto };
    return this.gw.exec('chat', 'updateChannel', payload);
  }

  @ApiOperation({ summary: 'Get registered unread channels', description: 'Auth required. Reads socket unread registration data from Redis for the current user.' })
  @UseGuards(JwtAuthGuard)
  @Get('channels/unread-map')
  async getUnreadMap(@Req() req: Request) {
    const user = req.user as any;
    if (!user?.id) return { code: 401, msg: 'Unauthorized', data: null };
    // Lấy map chưa đọc từ Redis
    // Trả về { channelId: count }
    const data = await this.ChatSocketService.getRegisteredUnreadChannels(
      user.id,
    );
    return { code: 200, msg: 'Success', data };
  }

  @ApiOperation({ summary: 'Search messages by keyword inside channels', description: 'Auth required. Calls chat/searchMessagesByKeyword with current JWT user and request body filters.' })
  @ApiBody({
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
  })
  @UseGuards(JwtAuthGuard)
  @Post('channels/search-keyword-messages')
  async searchKeywordMessages(@Body() dto: any, @Req() req: Request) {
    const user = req.user as any;
    const payload = { user, ...dto };
    return this.gw.exec('chat', 'searchMessagesByKeyword', payload);
  }
  // ---------- CHAT ----------
  // FE: POST /api/channels/:channelId/messages
  // Body: { text: string, snippetId?: string }
  // Param: channelId: string
  // @UseGuards(JwtAuthGuard)
  // @Post('channels/send-messages')
  // async sendMessage(@Body() dto: any, @Req() req: Request) {
  //   // Đính kèm user từ JWT để ChatService kiểm soát quyền truy cập kênh
  //   const user = req.user as any;
  //   const payload = { user, ...dto };
  //   return this.gw.exec('chat', 'sendMessage', payload);
  // }

  @ApiOperation({ summary: 'Add repositories to channel', description: 'Auth required. Calls chat/addRepositoriesToChannel.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['channelId', 'repositories'],
      properties: {
        channelId: { type: 'string' },
        repositories: { type: 'array', items: { type: 'object' }, description: 'Repository records or ids selected by the client.' },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @Post('channels/add-repositories')
  async addRepositoriesToChannel(@Body() dto: any, @Req() req: Request) {
    // Đính kèm user từ JWT để ChatService kiểm soát quyền truy cập kênh
    const user = req.user as any;
    const payload = { user, ...dto };
    return this.gw.exec('chat', 'addRepositoriesToChannel', payload);
  }

  @ApiOperation({ summary: 'Remove repositories from channel', description: 'Auth required. Calls chat/removeRepositoriesFromChannel.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['channelId'],
      properties: {
        channelId: { type: 'string' },
        repositoryIds: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @Post('channels/remove-repositories')
  async removeRepositoriesFromChannel(@Body() dto: any, @Req() req: Request) {
    // Đính kèm user từ JWT để ChatService kiểm soát quyền truy cập kênh
    const user = req.user as any;
    const payload = { user, ...dto };
    return this.gw.exec('chat', 'removeRepositoriesFromChannel', payload);
  }

  // FE: GET /api/channels/:channelId/messages
  // Param: channelId: string
  // Query: { cursor?: string }
  @ApiOperation({ summary: 'List channels for current user', description: 'Auth required. Calls chat/listChannels. Query filters are forwarded to chat service.' })
  @ApiQuery({ name: 'q', required: false, description: 'Optional search/filter text.', schema: { type: 'string' } })
  @ApiQuery({ name: 'type', required: false, description: 'Optional channel type filter.', schema: { type: 'string' } })
  @ApiQuery({ name: 'limit', required: false, description: 'Optional page size.', schema: { type: 'number' } })
  @UseGuards(JwtAuthGuard)
  @Get('channels/list-channels')
  async listChannels(
    @Query() q: any,
    @Req() req: Request, // 👈 lấy request
  ) {
    const user = req.user as any; // JwtAuthGuard đã inject user vào đây
    return this.gw.exec('chat', 'listChannels', {
      user, // 👈 truyền userId sang service chat
      ...q,
    });
  }

  @ApiOperation({ summary: 'List online users', description: 'Auth required. Reads all online users tracked by gateway socket Redis presence.' })
  @UseGuards(JwtAuthGuard)
  @Get('users/list-online')
  async listOnlineUser() {
    // JwtAuthGuard đã inject user vào đây
    return this.gw.getAllOnlineUsers();
  }

  @ApiOperation({ summary: 'List messages in channel', description: 'Auth required. Calls chat/listChannelsMessages. Supports cursor pagination and search anchor options.' })
  @ApiParam({ name: 'channel_id', description: 'Channel id.' })
  @ApiQuery({ name: 'before', required: false, description: 'Message id cursor for older messages.', schema: { type: 'string' } })
  @ApiQuery({ name: 'after', required: false, description: 'Message id cursor for newer messages.', schema: { type: 'string' } })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size.', schema: { type: 'number' } })
  @ApiQuery({ name: 'messageId', required: false, description: 'Anchor message id for search mode.', schema: { type: 'string' } })
  @UseGuards(JwtAuthGuard)
  @Get('channels/list-messages/:channel_id')
  async listMessages(
    @Param('channel_id') channel_id: string,
    @Query() q: any,
    @Req() req: Request, // 👈 lấy request
  ) {
    const user = req.user as any; // JwtAuthGuard đã inject user vào đây
    return this.gw.exec('chat', 'listChannelsMessages', {
      user, // 👈 truyền userId sang service chat
      channel_id,
      ...q,
    });
  }

  @ApiOperation({ summary: 'Search chat entities', description: 'Auth required. Calls chat/searchChatEntities. Searches channels/messages by key and type.' })
  @ApiQuery({ name: 'key', required: true, description: 'Search keyword.' })
  @ApiQuery({ name: 'type', required: false, description: 'Entity type filter.', schema: { type: 'string' } })
  @ApiQuery({ name: 'limit', required: false, description: 'Maximum result count.', schema: { type: 'number', default: 5 } })
  @UseGuards(JwtAuthGuard)
  @Get('channels/search-chat')
  async SearchChat(
    @Query() q: any,
    @Req() req: Request, // 👈 lấy request
  ) {
    const user = req.user as any; // JwtAuthGuard đã inject user vào đây
    return this.gw.exec('chat', 'searchChatEntities', {
      user,
      data: { key: q?.key, type: q?.type ?? '', limit: q?.limit ?? 5 },
      ...q,
    });
  }

  @ApiOperation({ summary: 'List channels by repository', description: 'Auth required. Calls chat/listChannelsByRepository.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['repositoryId'],
      properties: {
        repositoryId: { type: 'string' },
        repositoryUrl: { type: 'string' },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @Post('channels/repository-channels')
  async listChannelsByRepository(@Body() dto: any, @Req() req: Request) {
    const user = req.user as any;
    const payload = { user, ...dto };
    return this.gw.exec('chat', 'listChannelsByRepository', payload);
  }

  @ApiOperation({ summary: 'Search users', description: 'Auth required. Calls auth/searchUsers with key and limit.' })
  @ApiQuery({ name: 'key', required: true, description: 'Username/email/name search text.' })
  @ApiQuery({ name: 'limit', required: false, description: 'Maximum result count.', schema: { type: 'number', default: 5 } })
  @UseGuards(JwtAuthGuard)
  @Get('users/search-user')
  async SearchUsers(
    @Query() q: any,
    @Req() req: Request, // 👈 lấy request
  ) {
    const user = req.user as any; // JwtAuthGuard đã inject user vào đây
    return this.gw.exec('auth', 'searchUsers', {
      user,
      data: { key: q?.key, limit: q?.limit ?? 5 },
      ...q,
    });
  }

  // Thêm thành viên vào channel
  @ApiOperation({ summary: 'Add members to channel', description: 'Auth required. Calls chat/addMembersToChannel.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['channelId', 'userIds'],
      properties: {
        channelId: { type: 'string' },
        userIds: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @Post('channels/add-members')
  async addMembersToChannel(@Body() dto: any, @Req() req: Request) {
    const user = req.user as any;
    const payload = { user, ...dto };
    return this.gw.exec('chat', 'addMembersToChannel', payload);
  }

  @ApiOperation({ summary: 'Remove members from channel', description: 'Auth required. Calls chat/removeMembersFromChannel.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['channelId', 'userIds'],
      properties: {
        channelId: { type: 'string' },
        userIds: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @Post('channels/remove-members')
  async removeMembersFromChannel(@Body() dto: any, @Req() req: Request) {
    const user = req.user as any;
    const payload = { user, ...dto };
    return this.gw.exec('chat', 'removeMembersFromChannel', payload);
  }

  @ApiOperation({ summary: 'List users not in channel', description: 'Auth required. Calls chat/listNonMembers for add-member UI.' })
  @ApiParam({ name: 'channelId', description: 'Channel id.' })
  @ApiQuery({ name: 'username', required: false, description: 'Search text for username/email/name.' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size.', schema: { type: 'number' } })
  @ApiQuery({ name: 'cursor', required: false, description: 'Pagination cursor.' })
  @UseGuards(JwtAuthGuard)
  @Get('channels/:channelId/list-non-members')
  async listNonMembers(
    @Param('channelId') channelId: string,
    @Query('username') username: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.gw.exec('chat', 'listNonMembers', {
      channelId,
      username,
      limit,
      cursor,
    });
  }

  @ApiOperation({ summary: 'Search messages globally or by channel', description: 'Auth required. Calls chat/searchMessages. Supports sender/date/channel filters and cursor pagination.' })
  @ApiQuery({ name: 'query', required: true, description: 'Text search query.' })
  @ApiQuery({ name: 'channelId', required: false, description: 'Filter by channel id.', schema: { type: 'number' } })
  @ApiQuery({ name: 'senderId', required: false, description: 'Filter by sender user id.', schema: { type: 'number' } })
  @ApiQuery({ name: 'startDate', required: false, description: 'ISO date lower bound.' })
  @ApiQuery({ name: 'endDate', required: false, description: 'ISO date upper bound.' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size.', schema: { type: 'number' } })
  @ApiQuery({ name: 'cursor', required: false, description: 'Message id cursor.', schema: { type: 'number' } })
  @UseGuards(JwtAuthGuard)
  @Get('messages/search')
  async searchMessages(
    @Query('query') query: string,
    @Req() req: Request,
    @Query('channelId') channelId?: string,
    @Query('senderId') senderId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const user = req.user as any;
    if (!user?.id) return { code: 401, msg: 'Unauthorized', data: null };

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

  //Upload file
  @ApiOperation({ summary: 'Create file presigned upload URL', description: 'Auth required. Calls upload/getPresignedUrl. Used before sending file-upload messages.' })
  @ApiBody({
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
  })
  @UseGuards(JwtAuthGuard)
  @Post('upload/get-presigned-url')
  async getPresignedUrl(@Body() dto: any, @Req() req: Request) {
    const user = req.user as any;
    const payload = { user, ...dto };
    return this.gw.exec('upload', 'getPresignedUrl', payload);
  }

  @ApiOperation({ summary: 'Get object public/read URL', description: 'Auth required. Calls upload/getObject.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['key'],
      properties: {
        key: { type: 'string', description: 'Object storage key.' },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @Post('upload/get-object-url')
  async getObjectUrl(@Body() dto: any, @Req() req: Request) {
    const user = req.user as any;
    const payload = { user, ...dto };
    return this.gw.exec('upload', 'getObject', payload);
  }

  @ApiOperation({ summary: 'Create avatar presigned upload URL', description: 'Auth required. Calls upload/getAvatarPresignedUrl for the current JWT user.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['filename', 'contentType'],
      properties: {
        filename: { type: 'string', example: 'avatar.png' },
        contentType: { type: 'string', example: 'image/png' },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @Post('upload/get-avatar-presigned-url')
  async getAvatarPresignedUrl(
    @Body() body: { filename: string; contentType: string },
    @Req() req: Request,
  ) {
    const user = req.user as any;
    return this.gw.exec('upload', 'getAvatarPresignedUrl', {
      userId: user.id,
      filename: body.filename,
      contentType: body.contentType,
    });
  }

  @ApiOperation({ summary: 'Get spreadsheet export URL', description: 'Auth required. Calls upload/getSheetUrl for a channel.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['channelId'],
      properties: {
        channelId: { type: 'string' },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @Post('upload/get-sheet-url')
  async getSheetUrl(@Body() body: { channelId: string }, @Req() req: Request) {
    const user = req.user as any;

    return this.gw.exec('upload', 'getSheetUrl', {
      channelId: body.channelId,
    });
  }

  @ApiOperation({ summary: 'List channel attachments', description: 'Auth required. Calls upload/getAttachmentsByChannel with pagination and file filters.' })
  @ApiParam({ name: 'channelId', description: 'Channel id.' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size.', schema: { type: 'number' } })
  @ApiQuery({ name: 'cursor', required: false, description: 'Attachment cursor.', schema: { type: 'number' } })
  @ApiQuery({ name: 'filename', required: false, description: 'Filter by filename.' })
  @ApiQuery({ name: 'mimeType', required: false, description: 'Filter by MIME type.' })
  @ApiQuery({ name: 'senderId', required: false, description: 'Filter by sender user id.' })
  @ApiQuery({ name: 'startDate', required: false, description: 'ISO date lower bound.' })
  @ApiQuery({ name: 'endDate', required: false, description: 'ISO date upper bound.' })
  @UseGuards(JwtAuthGuard)
  @Get('channels/:channelId/attachments')
  async getAttachmentsByChannel(
    @Param('channelId') channelId: string,
    @Req() req: Request,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('filename') filename?: string,
    @Query('mimeType') mimeType?: string,
    @Query('senderId') senderId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const user = req.user as any;
    if (!user?.id) return { code: 401, msg: 'Unauthorized', data: null };
    
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

  // GITHUB
  @ApiOperation({ summary: 'Get repositories from GitHub installation', description: 'Auth required. Calls git/get_repo_installation and caches by current user plus body for 60 seconds.' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        installationId: { type: 'string', description: 'Optional GitHub installation id.' },
        page: { type: 'number' },
        per_page: { type: 'number' },
        search: { type: 'string' },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @Post('git/get_repo_installation')
  async get_repo_installation(@Body() dto: any,@Req() req: Request) {
    const user = req.user as any;
    if (!user?.id) return { code: 401, msg: 'Unauthorized', data: null };

    // Tạo cache key duy nhất theo user
    const cacheKey = `repo_installation:${user.id}+${JSON.stringify(dto)}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.gw.exec('git', 'get_repo_installation', {
      userId: user.id,
      ...dto,
    });

    // Lưu cache với TTL 60 giây
    await this.cacheManager.set(cacheKey, result);

    return result;
  }

  @ApiOperation({ summary: 'Get repository data by URL', description: 'Auth required. Calls git/get_repo_data_by_url and caches result by user and URL for 3 minutes.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string', example: 'https://github.com/owner/repo' },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @Post('git/get_repo_data_by_url')
  async get_repo_data_by_url(@Body() dto: any, @Req() req: Request) {
    const user = req.user as any;
    if (!user?.id) return { code: 401, msg: 'Unauthorized', data: null };
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
    await this.cacheManager.set(cacheKey, result, 3 * 60 * 1000); // 3 phút
    return result;
  }

  @ApiOperation({ summary: 'Get repository data for a channel', description: 'Auth required. First calls chat/listRepositoriesByChannel, then git/get_repo_by_ids for repository details. Uses snapshot cache to avoid repeated Git calls.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['channelId'],
      properties: {
        channelId: { type: 'string' },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @Post('git/get_list_repo_data_by_channel')
  async get_list_repo_data_by_channel(@Body() dto: any, @Req() req: Request) {
    const user = req.user as any;
    if (!user?.id) return { code: 401, msg: 'Unauthorized', data: null };

    // 1. Lấy danh sách repo id từ chat service
    const result = await this.gw.exec('chat', 'listRepositoriesByChannel', {
      user,
      ...dto,
    });

    if (!result?.data) {
      return { code: 404, msg: 'Not Found', data: null };
    }

    const items: string[] = result.data.items || [];

    // 2. Tạo snapshot hash cho items
    const itemsHash = createHash('sha1')
      .update(JSON.stringify(items))
      .digest('hex');

    const cacheKeySnapshot = `repo_snapshot:${user.id}:${JSON.stringify(dto)}`;
    const cacheKeyData = `repo_data_by_channel:${user.id}:${JSON.stringify(dto)}`;

    // 3. Kiểm tra snapshot cũ
    const oldSnapshot = await this.cacheManager.get<string>(cacheKeySnapshot);

    if (oldSnapshot && oldSnapshot === itemsHash) {
      // Snapshot không đổi => lấy cache data
      const cached = await this.cacheManager.get<any>(cacheKeyData);
      if (cached) {
        return cached;
      }
    }

    // 4. Nếu snapshot khác hoặc cache trống => gọi Git
    let data: any;
    if (items.length > 0) {
      data = await this.gw.exec('git', 'get_repo_by_ids', { items });
    } else {
      data = { code: 200, msg: 'Success', data: [] };
    }

    // 5. Cập nhật cache
    await this.cacheManager.set(cacheKeySnapshot, itemsHash, 10 * 60 * 1000); // 10 phút
    await this.cacheManager.set(cacheKeyData, data, 3 * 60 * 1000); // 3 phút

    return data;
  }

  //Notification
  @ApiOperation({ summary: 'List notifications', description: 'Auth required. Calls notification/get_notifications for current JWT user.' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size.', schema: { type: 'number' } })
  @ApiQuery({ name: 'cursor', required: false, description: 'Pagination cursor.' })
  @ApiQuery({ name: 'type', required: false, description: 'Notification type filter.', schema: { type: 'string' } })
  @ApiQuery({ name: 'isRead', required: false, description: 'Read-state filter.', schema: { type: 'boolean' } })
  @UseGuards(JwtAuthGuard)
  @Get('notifications')
  async getNotifications(@Query() query: any, @Req() req: Request) {
    const user = req.user as any;
    return this.gw.exec('notification', 'get_notifications', {
      userId: user.id,
      query,
    });
  }

  @ApiOperation({ summary: 'Mark notification as read', description: 'Auth required. Calls notification/mark_as_read.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Notification id.' },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @Post('notifications/mark-as-read')
  async markAsRead(@Body() body: any, @Req() req: Request) {
    const user = req.user as any;
    console.log('Body mark as read:', body.id);
    return this.gw.exec('notification', 'mark_as_read', {
      notificationId: body.id,
    });
  }

  @ApiOperation({ summary: 'Mark all notifications as read', description: 'Auth required. Calls notification/mark_all_as_read for current JWT user.' })
  @UseGuards(JwtAuthGuard)
  @Post('notifications/mark-all-as-read')
  async markAllAsRead(@Req() req: Request) {
    const user = req.user as any;
    return this.gw.exec('notification', 'mark_all_as_read', {
      userId: user.id,
    });
  }

  @ApiOperation({ summary: 'Count unread notifications', description: 'Auth required. Calls notification/get_number_unread_notifications for current JWT user.' })
  @UseGuards(JwtAuthGuard)
  @Post('notifications/count-unread')
  async countUnreadNotifications(@Req() req: Request) {
    const user = req.user as any;
    return this.gw.exec('notification', 'get_number_unread_notifications', {
      userId: user.id,
    });
  }


//// ADMIN MANAGERMENT
  @ApiOperation({ summary: 'Admin user management', description: 'Auth required. Calls auth/admin_user_management. Body must include the management action expected by AuthService.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', description: 'Admin action, for example list, update, delete, lock or unlock.' },
        userId: { type: 'string', description: 'Target user id for single-user actions.' },
        data: { type: 'object', description: 'Action-specific payload.' },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @Post('admin/users')
  async adminUserManagement(@Body() dto: any, @Req() req: Request) {
    const user = req.user as any;
    const payload = { user, ...dto };
    return this.gw.exec('auth', 'admin_user_management', payload);
  }
  
  @ApiOperation({ summary: 'Admin channel management', description: 'Auth required. Calls chat/admin_channel_management. Body must include the management action expected by ChatService.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', description: 'Admin action, for example list, update, delete or stats.' },
        channelId: { type: 'string', description: 'Target channel id for single-channel actions.' },
        data: { type: 'object', description: 'Action-specific payload.' },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @Post('admin/channels')
  async adminChannelManagement(@Body() dto: any, @Req() req: Request) {
    const user = req.user as any;
    const payload = { user, ...dto };
    return this.gw.exec('chat', 'admin_channel_management', payload);
  }




  @ApiOperation({ summary: 'Admin file management', description: 'Auth required. Calls upload/admin_file_management. Body must include the management action expected by UploadService.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', description: 'Admin action, for example list, unlink, delete or stats.' },
        fileId: { type: 'string', description: 'Target file/attachment id for single-file actions.' },
        data: { type: 'object', description: 'Action-specific payload.' },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @Post('admin/files')
  async adminFileManagement(@Body() dto: any, @Req() req: Request) {
    const user = req.user as any;
    const payload = { user, ...dto };
    return this.gw.exec('upload', 'admin_file_management', payload);
  }

}
