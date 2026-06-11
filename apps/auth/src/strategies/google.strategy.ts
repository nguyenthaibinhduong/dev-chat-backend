import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    const clientID = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const callbackURL =
      process.env.GOOGLE_CALLBACK_URL ||
      'http://localhost:3088/api/auth/google-oauth/callback';

    if (!clientID || !clientSecret || !callbackURL) {
      throw new Error('Missing required Google OAuth environment variables');
    }

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['email', 'profile'],
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
