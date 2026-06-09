"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatSocketService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
const gateway_service_1 = require("./gateway.service");
let ChatSocketService = class ChatSocketService {
    constructor(redis, gw) {
        this.redis = redis;
        this.gw = gw;
        this.unreadKey = (userId) => `unread:${userId}`;
        this.subKey = (socketId) => `unread_subscribe:${socketId}`;
    }
    setServer(server) {
        this.server = server;
    }
    async checkUserStatus(userId, context = 'GENERAL') {
        const plainUserId = (userId === null || userId === void 0 ? void 0 : userId.startsWith('ENC:')) ? this.gw.decryptId(userId) : userId;
        console.log(`🔍 [${context}] Kiểm tra trạng thái user:`, {
            userIdGoc: userId,
            userIdGiaiMa: plainUserId,
            daGiaiMa: userId === null || userId === void 0 ? void 0 : userId.startsWith('ENC:')
        });
        const statusStr = await this.redis.hget('user_status', plainUserId);
        if (!statusStr) {
            console.log(`📵 [${context}] User ${plainUserId} không tìm thấy trong Redis`);
            return {
                userId,
                plainUserId,
                status: null,
                isOnline: false,
                socketId: null
            };
        }
        const status = JSON.parse(statusStr);
        const isOnline = status.online && !!status.socketId;
        console.log(`👤 [${context}] Trạng thái user ${plainUserId}:`, {
            dangOnline: status.online,
            coSocketId: !!status.socketId,
            socketId: status.socketId || 'không có',
            lanCuoiOnline: status.lastSeen ? new Date(status.lastSeen).toISOString() : 'không rõ'
        });
        return {
            userId,
            plainUserId,
            status,
            isOnline,
            socketId: status.socketId || null
        };
    }
    async emitToUserWithLog(userId, event, payload, context = 'SOCKET') {
        const userCheck = await this.checkUserStatus(userId, context);
        if (!userCheck.isOnline) {
            console.log(`❌ [${context}] Không thể gửi '${event}' đến user ${userCheck.plainUserId}: User offline`);
            return false;
        }
        if (!this.server) {
            console.log(`❌ [${context}] Không thể gửi '${event}' đến user ${userCheck.plainUserId}: Server không khả dụng`);
            return false;
        }
        this.server.to(userCheck.socketId).emit(event, payload);
        console.log(`✅ [${context}] Đã gửi '${event}' đến user ${userCheck.plainUserId}:`, {
            socketId: userCheck.socketId,
            eventName: event,
            payloadKeys: Object.keys(payload || {})
        });
        return true;
    }
    async sendNotificationsToUsers(notifications, context = 'NOTIFICATION') {
        if (!notifications || notifications.length === 0) {
            console.log(`⚠️ [${context}] Không có notification nào để gửi`);
            return;
        }
        console.log(`📬 [${context}] Bắt đầu gửi ${notifications.length} notifications`);
        let successCount = 0;
        let offlineCount = 0;
        let errorCount = 0;
        for (const notify of notifications) {
            try {
                const userCheck = await this.checkUserStatus(notify.userId, context);
                if (!userCheck.isOnline) {
                    offlineCount++;
                    continue;
                }
                const sent = await this.emitToUserWithLog(notify.userId, 'receiveNotification', {
                    ...notify,
                    fakeID: Date.now(),
                }, context);
                if (sent) {
                    successCount++;
                }
                else {
                    errorCount++;
                }
            }
            catch (err) {
                console.error(`❌ [${context}] Lỗi khi gửi notification đến user ${notify.userId}:`, (err === null || err === void 0 ? void 0 : err.message) || err);
                errorCount++;
            }
        }
        console.log(`📊 [${context}] Tổng kết gửi notifications:`, {
            tongSo: notifications.length,
            thanhCong: successCount,
            offline: offlineCount,
            loi: errorCount
        });
    }
    async getUnreadMap(userId) {
        const data = await this.redis.hgetall(this.unreadKey(userId));
        const result = {};
        for (const [channelId, count] of Object.entries(data)) {
            result[channelId] = parseInt(count, 10) || 0;
        }
        return result;
    }
    async registerUnreadChannels(socketId, channelIds) {
        await this.redis.set(this.subKey(socketId), JSON.stringify(channelIds || []));
    }
    async getRegisteredUnreadChannels(socketId) {
        const data = await this.redis.get(this.subKey(socketId));
        return data ? JSON.parse(data) : [];
    }
    async markUserOnline(userId, socketId) {
        await this.redis.hset('user_status', userId, JSON.stringify({ online: true, lastSeen: Date.now(), socketId }));
        const all = await this.redis.hgetall('user_status');
        const onlineUsers = [];
        for (const [uid, data] of Object.entries(all)) {
            try {
                const status = JSON.parse(data);
                if (status.online)
                    onlineUsers.push(uid);
            }
            catch (err) {
                console.error('❌ Parse user_status lỗi', uid, err);
            }
        }
        this.server.emit('presenceUpdate', { online: onlineUsers, offline: [] });
    }
    async markUserOffline(userId) {
        const lastSeen = Date.now();
        await this.redis.hset('user_status', userId, JSON.stringify({ online: false, lastSeen }));
        const all = await this.redis.hgetall('user_status');
        const onlineUsers = [];
        for (const [uid, data] of Object.entries(all)) {
            try {
                const status = JSON.parse(data);
                if (status.online)
                    onlineUsers.push(uid);
            }
            catch (err) {
                console.error('❌ Parse user_status lỗi', uid, err);
            }
        }
        this.server.emit('presenceUpdate', {
            online: onlineUsers,
            offline: [{ userId, lastSeen }],
        });
    }
    async getUserStatus(userId) {
        const data = await this.redis.hget('user_status', userId);
        return data ? JSON.parse(data) : { online: false, lastSeen: null };
    }
    async joinChannel(client, channelId) {
        var _a;
        client.join(channelId);
        await this.resetUnread(client, channelId);
        client.emit('joinedRoom', { channelId });
        console.log(`✅ User ${(_a = client.user) === null || _a === void 0 ? void 0 : _a.id} joined channel ${channelId}`);
    }
    leaveChannel(client, channelId) {
        var _a;
        client.leave(channelId);
        console.log(`🚪 User ${(_a = client.user) === null || _a === void 0 ? void 0 : _a.id} left channel ${channelId}`);
    }
    async switchChannel(client, oldChannelId, newChannelId) {
        this.leaveChannel(client, oldChannelId);
        await this.joinChannel(client, newChannelId);
    }
    async createChannel(data) {
        var _a, _b;
        const tempId = Date.now();
        const now = new Date().toISOString();
        const channel = {
            id: tempId,
            fakeID: tempId,
            name: data === null || data === void 0 ? void 0 : data.name,
            type: data === null || data === void 0 ? void 0 : data.type,
            member_count: ((_b = (_a = data === null || data === void 0 ? void 0 : data.userIds) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0) + 1,
            members: [],
            isActive: true,
            created_at: now,
            updated_at: now,
        };
        console.log(`📢 [TẠO KÊNH] Chuẩn bị gửi pending channel đến ${data.userIds.length} users`);
        if ((data === null || data === void 0 ? void 0 : data.type) !== 'personal') {
            let sentCount = 0;
            for (const uid of data.userIds) {
                const sent = await this.emitToUserWithLog(uid, 'receiveChannel', channel, 'TẠO KÊNH - PENDING');
                if (sent)
                    sentCount++;
            }
            console.log(`📊 [TẠO KÊNH] Đã gửi pending channel đến ${sentCount}/${data.userIds.length} users online`);
        }
        try {
            const savedChannel = await this.gw.exec('chat', 'createChannel', data);
            if (savedChannel === null || savedChannel === void 0 ? void 0 : savedChannel.data) {
                const msg = { ...savedChannel.data, fakeID: channel.fakeID };
                console.log(`📢 [TẠO KÊNH] Chuẩn bị gửi saved channel đến ${data.userIds.length} users`);
                let sentCount = 0;
                for (const uid of data.userIds) {
                    const sent = await this.emitToUserWithLog(uid, 'receiveChannel', msg, 'TẠO KÊNH - SAVED');
                    if (sent)
                        sentCount++;
                }
                console.log(`📊 [TẠO KÊNH] Đã gửi saved channel đến ${sentCount}/${data.userIds.length} users online`);
            }
        }
        catch (err) {
            console.error(`❌ [TẠO KÊNH] Lỗi:`, err);
        }
    }
    async updateChannel(data) {
        var _a;
        console.log(`🔄 [CẬP NHẬT KÊNH] Bắt đầu cập nhật kênh ${data.channelId}`, {
            thanhVienHienTai: data.currenetUserIds.length,
            thanhVienThem: data.addUserIds.length,
            thanhVienXoa: data.removeUserIds.length,
        });
        try {
            const channelResponse = await this.gw.exec('chat', 'listChannelsMessages', {
                user: data.user,
                channel_id: data.channelId,
                ...data.q,
                noAuth: true,
            });
            if (!(channelResponse === null || channelResponse === void 0 ? void 0 : channelResponse.data)) {
                console.error(`❌ [CẬP NHẬT KÊNH] Không tìm thấy dữ liệu kênh ${data.channelId}`);
                return;
            }
            const channelInfo = channelResponse.data;
            const datachannel = (channelInfo === null || channelInfo === void 0 ? void 0 : channelInfo.channel) || {};
            const channelName = (datachannel === null || datachannel === void 0 ? void 0 : datachannel.name) || 'kênh';
            console.log(`✅ [CẬP NHẬT KÊNH] Đã lấy thông tin kênh: ${channelName}`);
            if (data.currenetUserIds.length > 0) {
                console.log(`📤 [CẬP NHẬT KÊNH] Đang cập nhật cho ${data.currenetUserIds.length} thành viên hiện tại`);
                let sentCount = 0;
                for (const uid of data.currenetUserIds) {
                    const sent = await this.emitToUserWithLog(uid, 'receiveUpdateChannel', channelInfo, 'CẬP NHẬT KÊNH');
                    if (sent)
                        sentCount++;
                }
                console.log(`📊 [CẬP NHẬT KÊNH] Đã gửi cập nhật đến ${sentCount}/${data.currenetUserIds.length} thành viên online`);
                const result = await this.gw.exec('notification', 'send_notification', {
                    data: {
                        memberIds: data.currenetUserIds,
                        text: `Kênh "${channelName}" có cập nhật mới`,
                        type: 'system',
                        additionalData: { channelId: data.channelId, channelName, action: 'cập nhật' },
                    },
                    type: 'system',
                });
                if ((_a = result === null || result === void 0 ? void 0 : result.data) === null || _a === void 0 ? void 0 : _a.notifications) {
                    await this.sendNotificationsToUsers(result.data.notifications, 'CẬP NHẬT KÊNH');
                }
            }
            if (data.addUserIds.length > 0) {
                console.log(`➕ [CẬP NHẬT KÊNH] Đang thêm ${data.addUserIds.length} thành viên mới`);
                const newChannelPayload = {
                    id: datachannel.id,
                    fakeID: Date.now(),
                    name: datachannel.name,
                    type: datachannel.type,
                    member_count: datachannel.member_count,
                    members: channelInfo.members || [],
                    isActive: true,
                    created_at: datachannel.created_at || new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    ...datachannel,
                };
                let sentCount = 0;
                for (const uid of data.addUserIds) {
                    const sent = await this.emitToUserWithLog(uid, 'receiveChannel', newChannelPayload, 'THÊM THÀNH VIÊN');
                    if (sent)
                        sentCount++;
                }
                console.log(`📊 [CẬP NHẬT KÊNH] Đã gửi thông tin kênh đến ${sentCount}/${data.addUserIds.length} thành viên mới`);
            }
            if (data.removeUserIds.length > 0) {
                console.log(`➖ [CẬP NHẬT KÊNH] Đang xóa ${data.removeUserIds.length} thành viên`);
                const removePayload = {
                    id: datachannel.id,
                    action: 'removed',
                    ...datachannel,
                };
                let sentCount = 0;
                for (const uid of data.removeUserIds) {
                    const sent = await this.emitToUserWithLog(uid, 'receiveRemoveChannel', removePayload, 'XÓA THÀNH VIÊN');
                    if (sent)
                        sentCount++;
                }
                console.log(`📊 [CẬP NHẬT KÊNH] Đã gửi thông báo xóa đến ${sentCount}/${data.removeUserIds.length} thành viên`);
            }
            console.log(`✅ [CẬP NHẬT KÊNH] Cập nhật kênh ${data.channelId} thành công`);
        }
        catch (err) {
            console.error(`❌ [CẬP NHẬT KÊNH] Lỗi khi cập nhật kênh ${data.channelId}:`, (err === null || err === void 0 ? void 0 : err.message) || err);
        }
    }
    async sendMessageToChannel(message) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const tempId = Date.now();
        const now = new Date().toISOString();
        const typeMsg = (_a = message.type) !== null && _a !== void 0 ? _a : 'message';
        const pendingMsg = {
            id: message.isUpdate ? message.id : tempId,
            channelId: message.channelId,
            fakeID: tempId,
            text: message.text,
            type: typeMsg,
            created_at: now,
            updated_at: null,
            isPin: (_b = message.isPin) !== null && _b !== void 0 ? _b : false,
            json_data: message.json_data ? { ...message.json_data } : null,
            replyTo: message.replyTo ? { ...message.replyTo } : null,
            like_data: message.like_data ? { ...message.like_data } : null,
            sender: {
                id: message.user.id,
                username: message.user.username,
                email: message.user.email,
            },
            isMine: true,
            isUpdate: (_c = message.isUpdate) !== null && _c !== void 0 ? _c : false,
            status: 'pending',
        };
        if (this.server) {
            this.server.to(message.channelId).emit('receiveMessage', pendingMsg);
            console.log(`📤 [GỬI TIN NHẮN] Đã emit pending message vào room ${message.channelId}`);
        }
        else {
            console.error(`❌ [GỬI TIN NHẮN] Server không khả dụng`);
        }
        if (message.channelData && message.channelData.isChannelActive === false) {
            const activeChannel = { ...message.channelData, isChannelActive: true };
            console.log(`🔔 [GỬI TIN NHẮN] Channel chưa active, chuẩn bị kích hoạt và gửi đến ${((_d = message.channelData.members) === null || _d === void 0 ? void 0 : _d.length) || 0} thành viên`);
            let sentCount = 0;
            for (const member of message.channelData.members || []) {
                const sent = await this.emitToUserWithLog(member.id, 'receiveChannel', activeChannel, 'KÍCH HOẠT KÊNH');
                if (sent)
                    sentCount++;
            }
            console.log(`📊 [GỬI TIN NHẮN] Đã gửi active channel đến ${sentCount}/${((_e = message.channelData.members) === null || _e === void 0 ? void 0 : _e.length) || 0} thành viên`);
        }
        try {
            const res = await this.gw.exec('chat', 'sendMessage', {
                ...message,
                send_at: now,
            });
            const { channel, ...datas } = res === null || res === void 0 ? void 0 : res.data;
            const finalMessage = {
                ...datas,
                channelId: message.channelId,
                type: datas.type || typeMsg,
                fakeID: tempId,
                isPin: (_f = pendingMsg.isPin) !== null && _f !== void 0 ? _f : false,
                isUpdate: (_g = message.isUpdate) !== null && _g !== void 0 ? _g : false,
                id: message.isUpdate ? message.id : null,
                status: pendingMsg.isUpdated ? (typeMsg === 'remove' ? 'remove' : 'updated') : 'sent',
            };
            this.server.to(message.channelId).emit('receiveMessage', finalMessage);
            console.log(`✅ [GỬI TIN NHẮN] Đã emit final message vào room ${message.channelId}`);
            if (res === null || res === void 0 ? void 0 : res.data) {
                const notifResult = await this.gw.exec('notification', 'send_notification', {
                    data: res.data,
                    type: 'message',
                });
                if ((_h = notifResult === null || notifResult === void 0 ? void 0 : notifResult.data) === null || _h === void 0 ? void 0 : _h.notifications) {
                    await this.sendNotificationsToUsers(notifResult.data.notifications, 'THÔNG BÁO TIN NHẮN');
                }
                else {
                    console.log(`⚠️ [THÔNG BÁO TIN NHẮN] Không có notification nào được tạo`);
                }
            }
            await this.incrementUnread(String(message.channelId), String(message.user.id));
        }
        catch (err) {
            console.error(`❌ [GỬI TIN NHẮN] Lỗi:`, {
                channel: message.channelId,
                error: err === null || err === void 0 ? void 0 : err.message,
                type: message.type
            });
            if (this.server) {
                const errorMessage = {
                    ...pendingMsg,
                    status: 'error',
                    msg: (err === null || err === void 0 ? void 0 : err.message) || 'Gửi tin nhắn thất bại',
                };
                this.server.to(message.channelId).emit('receiveMessage', errorMessage);
            }
        }
    }
    async incrementUnread(channelId, senderId) {
        var _a, _b, _c;
        const sockets = await this.server.fetchSockets();
        for (const socket of sockets) {
            const socketId = socket.id;
            const userId = ((_a = socket.user) === null || _a === void 0 ? void 0 : _a.id) || ((_c = (_b = socket.data) === null || _b === void 0 ? void 0 : _b.user) === null || _c === void 0 ? void 0 : _c.id);
            if (!userId || String(userId) === String(senderId))
                continue;
            const registeredChannels = await this.getRegisteredUnreadChannels(socketId);
            const isReg = registeredChannels.includes(String(channelId));
            const isInChannel = socket.rooms.has(String(channelId));
            if (isReg && !isInChannel) {
                const key = this.unreadKey(String(userId));
                const count = await this.redis.hincrby(key, String(channelId), 1);
                socket.emit('unreadCount', { channelId: String(channelId), count });
            }
        }
    }
    async resetUnread(client, channelId) {
        var _a, _b, _c;
        const userId = ((_a = client.user) === null || _a === void 0 ? void 0 : _a.id) || ((_c = (_b = client.data) === null || _b === void 0 ? void 0 : _b.user) === null || _c === void 0 ? void 0 : _c.id);
        if (!userId)
            return;
        const key = this.unreadKey(String(userId));
        await this.redis.hset(key, String(channelId), 0);
        client.emit('unreadCount', { channelId: String(channelId), count: 0 });
    }
    async broadcastWebhook(data) {
        var _a;
        try {
            const installationId = data.installationId;
            const tempId = Date.now();
            console.log(`🔔 [WEBHOOK GITHUB] Đang xử lý webhook:`, {
                installationId,
                suKien: data.event,
                khoLuuTru: data.repository
            });
            if (!installationId) {
                console.log(`⚠️ [WEBHOOK GITHUB] Không có installation ID, bỏ qua`);
                return;
            }
            const result = await this.gw.exec('notification', 'send_notification', {
                data: data,
                type: 'github'
            });
            if ((_a = result === null || result === void 0 ? void 0 : result.data) === null || _a === void 0 ? void 0 : _a.notifications) {
                await this.sendNotificationsToUsers(result.data.notifications, 'WEBHOOK GITHUB');
            }
            else {
                console.log(`⚠️ [WEBHOOK GITHUB] Không có notification nào được tạo`);
            }
        }
        catch (error) {
            console.error(`❌ [WEBHOOK GITHUB] Lỗi:`, (error === null || error === void 0 ? void 0 : error.message) || error);
        }
    }
};
exports.ChatSocketService = ChatSocketService;
exports.ChatSocketService = ChatSocketService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('REDIS_CLIENT')),
    __metadata("design:paramtypes", [ioredis_1.default,
        gateway_service_1.GatewayService])
], ChatSocketService);
//# sourceMappingURL=socket.service.js.map