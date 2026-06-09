import { Message } from './message.entity';
export type AttachmentType = 'image' | 'video' | 'file' | 'audio';
export declare class Attachment {
    id: number;
    fileUrl: string;
    mimeType: string;
    key: string;
    filename?: string;
    fileSize?: number;
    message: Message;
    created_at: Date;
    updated_at: Date;
}
