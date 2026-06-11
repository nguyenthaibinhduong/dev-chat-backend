import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';

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

function getRequestOrigin(req: any): string | undefined {
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
  return host ? `${req.protocol || 'http'}://${host}` : undefined;
}

function joinUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    const clientID = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientID || !clientSecret) {
      throw new Error('Missing required Google OAuth environment variables');
    }

    super({
      clientID,
      clientSecret,
      scope: ['email', 'profile'],
    });
  }

  authenticate(req: any, options?: any) {
    const origin = getRequestOrigin(req);
    if (!origin) {
      return this.error(new Error('Missing request origin header'));
    }

    return super.authenticate(req, {
      ...options,
      callbackURL: joinUrl(origin, 'auth/google-oauth/callback'),
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ) {
    const email = profile.emails?.[0]?.value;

    const user = {
      provider: 'google',
      providerId: profile.id,
      username: profile.displayName || email?.split('@')[0],
      email,
      avatar: profile.photos?.[0]?.value,
      accessToken,
      refreshToken,
    };

    done(null, user);
  }
}
