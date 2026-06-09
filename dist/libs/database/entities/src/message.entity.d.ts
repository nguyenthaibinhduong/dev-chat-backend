import { Channel } from './channel.entity';
import { User } from './user.entity';
import { Attachment } from './attachment.entity';
export declare class Message {
    id: number | string;
    type: string;
    text: string;
    channel: Channel;
    sender: User;
    json_data?: any;
    isPin: boolean;
    replyTo?: any;
    like_data?: any;
    attachments: Attachment[];
    send_at?: Date;
    created_at: Date;
    updated_at: Date;
}
