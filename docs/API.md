# API Docs

Base URL local/deploy: `http://<host>:3088/v1/api`

Response chung:

```json
{
  "code": 200,
  "msg": "Success",
  "data": {}
}
```

Các route có ghi `Auth` cần header:

```http
Authorization: Bearer <access_token>
```

## Health

| Method | Path | Auth | Mô tả |
| --- | --- | --- | --- |
| GET | `/health` | No | Kiểm tra gateway còn sống |

## Auth

| Method | Path | Auth | Body/Query chính |
| --- | --- | --- | --- |
| POST | `/auth/register` | No | `email`, `password`, `username` |
| POST | `/auth/login` | No | `email`, `password`, `otp?` |
| POST | `/auth/refresh-token` | No | `refresh_token` |
| POST | `/auth/reset-password` | No | `email`, `captchaToken`, `otp?` |
| GET | `/auth/confirm-email?token=...` | No | `token` |
| POST | `/auth/get-profile` | Yes | none |
| POST | `/auth/update-profile` | Yes | profile fields |
| POST | `/auth/update-password` | Yes | `oldPassword`, `newPassword` |
| GET | `/auth/github-oauth/redirect` | No | Trả URL OAuth GitHub |
| POST | `/auth/github-oauth/redirect-update` | Yes | Trả URL OAuth GitHub gắn user |
| GET | `/auth/github-oauth/callback` | No | `code`, `state?` |

Login example:

```bash
curl -X POST http://localhost:3088/v1/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'
```

## Channels And Messages

| Method | Path | Auth | Body/Query chính |
| --- | --- | --- | --- |
| POST | `/channels/create-channel` | Yes | `name`, `type?`, `userIds` |
| POST | `/channels/update-channel` | Yes | `channel_id`, member/channel fields |
| POST | `/channels/join-channel` | Yes | `channel_id` |
| GET | `/channels/list-channels` | Yes | none |
| GET | `/channels/list-messages/:channel_id` | Yes | `limit?`, `cursor?` |
| GET | `/channels/unread-map` | Yes | none |
| GET | `/channels/search-chat` | Yes | `key`, `type?`, `limit?` |
| POST | `/channels/search-keyword-messages` | Yes | keyword payload |
| GET | `/messages/search` | Yes | `query`, `channelId?`, `senderId?`, `startDate?`, `endDate?`, `limit?`, `cursor?` |
| POST | `/channels/add-members` | Yes | `channel_id`, `member_ids` |
| POST | `/channels/remove-members` | Yes | `channel_id`, `member_ids` |
| GET | `/channels/:channelId/list-non-members` | Yes | `username`, `limit?`, `cursor?` |
| POST | `/channels/add-repositories` | Yes | `channel_id`, `repository_ids` |
| POST | `/channels/remove-repositories` | Yes | `channel_id`, `repository_id` |
| POST | `/channels/repository-channels` | Yes | repository payload |

## Upload

| Method | Path | Auth | Body/Query chính |
| --- | --- | --- | --- |
| POST | `/upload/get-presigned-url` | Yes | `filename`, `contentType` |
| POST | `/upload/get-object-url` | Yes | `key` |
| POST | `/upload/get-avatar-presigned-url` | Yes | `filename`, `contentType` |
| POST | `/upload/get-sheet-url` | Yes | `channelId` |
| GET | `/channels/:channelId/attachments` | Yes | `limit?`, `cursor?`, `filename?`, `mimeType?`, `senderId?`, `startDate?`, `endDate?` |

## GitHub Integration

| Method | Path | Auth | Body/Query chính |
| --- | --- | --- | --- |
| POST | `/github-app/redirect` | Yes | none |
| POST | `/github-app/uninstall` | Yes | none |
| GET | `/github-app/setup` | No | `installation_id`, `setup_action`, `state` |
| POST | `/github-app/webhook` | No | GitHub webhook body, `x-hub-signature-256` |
| GET | `/github/commit/:owner/:repo/:sha` | Yes | none |
| GET | `/github/compare/:owner/:repo/:base/:head` | Yes | none |
| GET | `/github/commit-diff/:owner/:repo/:sha` | Yes | none |
| GET | `/github/commit-analysis/:owner/:repo/:sha` | Yes | `prompt?` |
| POST | `/git/get_repo_installation` | Yes | GitHub installation filter |
| POST | `/git/get_repo_data_by_url` | Yes | `url` |
| POST | `/git/get_list_repo_data_by_channel` | Yes | `channel_id` |

## Notifications

| Method | Path | Auth | Body/Query chính |
| --- | --- | --- | --- |
| GET | `/notifications` | Yes | pagination/filter query |
| POST | `/notifications/mark-as-read` | Yes | `id` |
| POST | `/notifications/mark-all-as-read` | Yes | none |
| POST | `/notifications/count-unread` | Yes | none |

## Admin

| Method | Path | Auth | Body/Query chính |
| --- | --- | --- | --- |
| POST | `/admin/users` | Yes | `method`, user payload |
| POST | `/admin/channels` | Yes | `method`, channel payload |
| POST | `/admin/files` | Yes | `method`, file payload |

## Socket.IO

Socket endpoint dùng cùng origin/port của gateway: `ws://<host>:3088`.

Handshake auth:

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3088', {
  auth: { token: accessToken },
});
```

Client emit:

| Event | Payload |
| --- | --- |
| `register_unread_channels` | `{ "channelIds": ["<channelId>"] }` |
| `join_channel` | `{ "channelId": "<channelId>" }` |
| `leave_channel` | `{ "channelId": "<channelId>" }` |
| `switch_channel` | `{ "oldChannelId": "...", "newChannelId": "..." }` |
| `create_channel` | channel payload |
| `update_channel` | update payload |
| `send_message` | `{ "channelId": "...", "text": "...", "type?": "message" }` |

Server emit:

| Event | Mô tả |
| --- | --- |
| `presenceUpdate` | Danh sách user online/offline |
| `unreadCount` | `{ channelId, count }` |
| `joinedRoom` | Xác nhận join room |
| `receiveChannel` | Channel mới hoặc channel active |
| `receiveUpdateChannel` | Channel được cập nhật |
| `receiveRemoveChannel` | User bị remove khỏi channel |
| `receiveMessage` | Message pending/final/error |
| `receiveNotification` | Notification realtime |

