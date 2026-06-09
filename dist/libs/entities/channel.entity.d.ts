import { Message } from './message.entity';
import { User } from './user.entity';
import { Repository } from './repository.entity';
import { Sheet } from './sheet.entity';
export declare class Channel {
    id: number | string;
    name: string;
    key: string;
    type: 'personal' | 'group' | 'group-private';
    member_count: number;
    created_at: Date;
    updated_at: Date;
    messages: Message[];
    json_data?: any;
    users: User[];
    owner?: User;
    repositories: Repository[];
    sheet?: Sheet;
    isActive: boolean;
}
