import { Channel } from './channel.entity';
export declare class User {
    id: number | string;
    username?: string;
    email: string;
    password?: string;
    provider?: string;
    provider_id?: string;
    role: string;
    refresh_token?: string;
    created_at: Date;
    updated_at: Date;
    channels: Channel[];
    verification_token: string;
    email_verified: boolean;
    github_verified: boolean;
    github_installation_id?: string;
    github_user_id?: string;
    github_email?: string;
    github_avatar?: string;
    avatar?: string;
    isActive: boolean;
    otpCode?: string;
    otpExp?: Date;
    otpAttempts?: number;
}
