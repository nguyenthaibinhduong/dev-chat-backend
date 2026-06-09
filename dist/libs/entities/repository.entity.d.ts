import { User } from './user.entity';
import { Channel } from './channel.entity';
export declare class Repository {
    id: number;
    repo_id: string;
    user: User;
    channels: Channel[];
}
