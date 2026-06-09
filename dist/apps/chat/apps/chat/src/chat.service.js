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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const entities_1 = require("../../../libs/entities/src");
const entities_2 = require("../../../libs/entities/src");
const common_2 = require("../../../libs/common/src");
const microservices_1 = require("@nestjs/microservices");
const entities_3 = require("../../../libs/entities/src");
const banned_keywords_1 = require("./banned-keywords");
let ChatService = class ChatService extends common_2.BaseService {
    constructor(messageRepo, channelRepo, userRepo, attachmentRepo) {
        super(messageRepo);
        this.messageRepo = messageRepo;
        this.channelRepo = channelRepo;
        this.userRepo = userRepo;
        this.attachmentRepo = attachmentRepo;
        this.BANNED_KEYWORDS = banned_keywords_1.ALL_BANNED_KEYWORDS;
        console.log('✅ Content moderation với keyword filter đã khởi tạo');
    }
    simpleKeywordFilter(text) {
        const lowerText = text.toLowerCase();
        const foundKeywords = [];
        for (const keyword of this.BANNED_KEYWORDS) {
            if (lowerText.includes(keyword.toLowerCase())) {
                foundKeywords.push(keyword);
            }
        }
        if (foundKeywords.length > 0) {
            console.log(`🚫 Simple filter detected banned keywords: ${foundKeywords.join(', ')}`);
            return { flagged: true, categories: ['banned_keyword'] };
        }
        return { flagged: false, categories: [] };
    }
    async moderateContent(text) {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return { flagged: false, categories: [] };
        }
        return this.simpleKeywordFilter(text);
    }
    async joinChannel(user, data) {
        console.log('log join to channel', { user, data });
        if (!(user === null || user === void 0 ? void 0 : user.id)) {
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy người dùng', status: 401 });
        }
        if (!(data === null || data === void 0 ? void 0 : data.id) || !(data === null || data === void 0 ? void 0 : data.type)) {
            throw new microservices_1.RpcException({ msg: 'Thiếu thông tin kênh hoặc loại kênh', status: 400 });
        }
        if (data.type === 'group') {
            const channel = await this.channelRepo.findOne({
                where: { id: data.id, type: 'group' },
                relations: ['users'],
            });
            if (!channel) {
                throw new microservices_1.RpcException({ msg: 'Không tìm thấy kênh công khai', status: 404 });
            }
            if (!channel.isActive) {
                throw new microservices_1.RpcException({ msg: 'Kênh đã bị vô hiệu hóa', status: 403 });
            }
            const isMember = channel.users.some((u) => String(u.id) === String(user.id));
            if (isMember) {
                return { msg: 'Bạn đang là thành viên của kênh này', channel };
            }
            const userEntity = await this.userRepo.findOne({
                where: { id: user.id }
            });
            if (!userEntity) {
                throw new microservices_1.RpcException({
                    msg: 'Không tìm thấy người dùng',
                    status: 404
                });
            }
            channel.users.push(userEntity);
            channel.member_count = channel.users.length;
            await this.channelRepo.save(channel);
            return { msg: 'Tham gia kênh thành công', channel };
        }
        else if (data.type === 'personal') {
            const userId = String(user.id);
            const otherId = String(data.id);
            console.log("log join to personal channel", { userId, otherId });
            if (userId === otherId) {
                throw new microservices_1.RpcException({ msg: 'Không thể nhắn tin với chính mình', status: 400 });
            }
            const userPersonalChannels = await this.channelRepo.find({
                where: { type: 'personal', users: { id: user.id } },
                relations: ['users'],
            });
            const foundChannel = userPersonalChannels.find((c) => c.users.length === 2 &&
                c.users.some((u) => String(u.id) === userId) &&
                c.users.some((u) => String(u.id) === otherId));
            if (foundChannel) {
                const messageCount = await this.messageRepo.count({
                    where: { channel: { id: foundChannel.id } },
                });
                return {
                    msg: messageCount > 0 ? 'Bạn đã nhắn tin với người này' : 'Chưa có tin nhắn nào',
                    channel: foundChannel,
                    hasMessages: messageCount > 0,
                    messageCount,
                };
            }
            const currentUser = await this.userRepo.findOne({ where: { id: user.id } });
            const otherUser = await this.userRepo.findOne({ where: { id: data.id } });
            if (!otherUser) {
                throw new microservices_1.RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
            }
            const newChannel = this.channelRepo.create({
                name: 'Personal Chat',
                type: 'personal',
                users: [currentUser, otherUser],
                member_count: 2,
            });
            const saved = await this.channelRepo.save(newChannel);
            return {
                msg: 'Hai bạn có thể nhắn tin với nhau',
                channel: saved,
                hasMessages: false,
                messageCount: 0,
            };
        }
        throw new microservices_1.RpcException({ msg: 'Kênh không hợp lệ', status: 400 });
    }
    async createChannel(user, params) {
        if (!user || !user.id) {
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy người dùng', status: 401 });
        }
        let memberIds = [...params.userIds];
        const owner = await this.check_exist_with_data(entities_1.User, { id: user.id }, 'Tài khoản không hợp lệ');
        memberIds = memberIds.filter((id) => id !== user.id);
        if (!memberIds.includes(user.id)) {
            memberIds.push(user.id);
        }
        const members = await this.check_exist_with_datas(entities_1.User, { id: (0, typeorm_2.In)(memberIds) }, 'Danh sách thành viên không hợp lệ');
        if (members.length !== memberIds.length) {
            throw new microservices_1.RpcException({
                msg: 'Thiếu thành viên kênh chat',
                status: 400,
            });
        }
        let type = 'group';
        if (members.length === 2) {
            type = 'personal';
        }
        else if (members.length > 2 && params.type === 'group-private') {
            type = 'group-private';
        }
        else if (members.length > 2 && params.type === 'group') {
            type = 'group';
        }
        const channel = this.channelRepo.create({
            name: params.name || (type === 'personal' ? `Personal Chat` : `Group Chat`),
            type,
            json_data: type === 'group-private' ? params.json_data : undefined,
            key: type === 'group-private' ? params.key : undefined,
            users: members,
            member_count: members.length,
            owner: type === 'group' || type === 'group-private' ? owner : undefined,
        });
        const saved = await this.channelRepo.save(channel);
        const fullChannel = await this.channelRepo.findOne({
            where: { id: saved.id },
            relations: ['users'],
        });
        let isChannelActive = true;
        let channelName = fullChannel.name;
        if (fullChannel.type === 'personal') {
            const msgCount = await this.messageRepo.count({
                where: { channel: { id: fullChannel.id } },
            });
            isChannelActive = msgCount > 0;
            const otherUser = (fullChannel.users || []).find((u) => String(u.id) !== String(user.id));
            if (otherUser && otherUser.username) {
                channelName = otherUser.username;
            }
        }
        const { users, name, ...rest } = fullChannel;
        return {
            ...rest,
            name: channelName,
            isChannelActive,
            members: ((fullChannel === null || fullChannel === void 0 ? void 0 : fullChannel.users) || []).map((u) => this.remove_field_user({ ...u })),
        };
    }
    async sendMessage(user, data, attachments) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        console.log(`🔍 [DEBUG] Chat service sendMessage called with:`, {
            channelId: data.channelId,
            type: data.type,
            hasJsonData: !!data.json_data,
            jsonDataType: typeof data.json_data,
            text: ((_a = data.text) === null || _a === void 0 ? void 0 : _a.substring(0, 100)) + '...',
        });
        const channel = await this.check_exist_with_data(entities_2.Channel, { id: data.channelId }, 'Kênh chat không tồn tại');
        const sender = await this.check_exist_with_data(entities_1.User, { id: user.id }, 'Người gửi không tồn tại');
        if (!channel)
            throw new microservices_1.RpcException({ msg: 'Kênh chat không tồn tại', status: 404 });
        if (!channel.isActive) {
            throw new microservices_1.RpcException({
                msg: 'Kênh đã bị vô hiệu hóa, không thể gửi tin nhắn',
                status: 403,
            });
        }
        let finalText = data.text;
        const messageType = data.type || 'message';
        if ((messageType === 'message' || messageType === 'reply-message') && finalText) {
            const moderation = await this.moderateContent(finalText);
            if (moderation.flagged) {
                console.warn(`⚠️ Content flagged for user ${user.id} in channel ${data.channelId}:`, moderation.categories);
                finalText = '⚠️ Tin nhắn có nội dung không phù hợp';
                console.log(`📝 Original flagged message: "${data.text.substring(0, 100)}..."`);
            }
        }
        if (data.isUpdate && data.id) {
            const existing = await this.messageRepo.findOne({
                where: { id: data.id, channel: { id: data.channelId } },
                relations: ['sender', 'attachments', 'channel'],
            });
            if (!existing) {
                throw new microservices_1.RpcException({ msg: 'Tin nhắn không tồn tại', status: 404 });
            }
            const existingSenderId = typeof existing.sender === 'object'
                ? (_b = existing.sender) === null || _b === void 0 ? void 0 : _b.id
                : existing.sender;
            if (String(existingSenderId) !== String(user.id) &&
                data.type == 'remove') {
                throw new microservices_1.RpcException({
                    msg: 'Bạn không có quyền sửa hay xóa tin nhắn này',
                    status: 403,
                });
            }
            existing.text = (_c = data.text) !== null && _c !== void 0 ? _c : existing.text;
            existing.json_data = (_d = data.json_data) !== null && _d !== void 0 ? _d : existing.json_data;
            existing.type = (_e = data.type) !== null && _e !== void 0 ? _e : existing.type;
            existing.isPin = (_f = data.isPin) !== null && _f !== void 0 ? _f : existing.isPin;
            existing.like_data = (_g = data.like_data) !== null && _g !== void 0 ? _g : existing.like_data;
            console.log('✏️ [DEBUG] Updating message:', {
                id: existing.id,
                type: existing.type,
                hasJsonData: !!existing.json_data,
                text: ((_h = existing.text) === null || _h === void 0 ? void 0 : _h.substring(0, 50)) + '...',
            });
            await this.messageRepo.save(existing);
            return existing;
        }
        const messageData = {
            ...data,
            text: finalText,
            channel,
            sender,
            send_at: data.send_at,
            type: messageType,
            json_data: data.json_data || null,
        };
        console.log(`🔍 [DEBUG] Creating message with data:`, {
            type: messageData.type,
            hasJsonData: !!messageData.json_data,
            text: ((_j = messageData.text) === null || _j === void 0 ? void 0 : _j.substring(0, 50)) + '...',
        });
        const message = this.messageRepo.create(messageData);
        await this.messageRepo.save(message);
        console.log(`🔍 [DEBUG] Message saved to database:`, {
            id: message.id,
            type: message.type,
            hasJsonData: !!message.json_data,
            text: ((_k = message.text) === null || _k === void 0 ? void 0 : _k.substring(0, 50)) + '...',
        });
        if (attachments && attachments.length > 0) {
            message.attachments = this.attachmentRepo.create(attachments.map((a) => ({
                ...a,
                message,
            })));
        }
        await this.messageRepo.save(message);
        const msgCount = await this.messageRepo.count({
            where: { channel: { id: channel.id } },
        });
        if (msgCount === 1) {
            return {
                ...message,
                channel: {
                    id: channel.id,
                    type: channel.type,
                    member_count: channel.member_count,
                    members: (channel.users || []).map((u) => this.remove_field_user({ ...u })),
                    created_at: channel.created_at,
                    updated_at: channel.updated_at,
                    isChannelActive: true,
                },
            };
        }
        console.log(`🔍 [DEBUG] Returning message:`, {
            id: message.id,
            type: message.type,
            hasJsonData: !!message.json_data,
            text: ((_l = message.text) === null || _l === void 0 ? void 0 : _l.substring(0, 50)) + '...',
        });
        return message;
    }
    async listChannels(user) {
        var _a, _b;
        if (!user || !user.id) {
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy người dùng', status: 401 });
        }
        const channels = await this.channelRepo
            .createQueryBuilder('channel')
            .leftJoinAndSelect('channel.users', 'member')
            .leftJoinAndSelect('channel.owner', 'owner')
            .leftJoin('channel.users', 'user')
            .where('user.id = :userId', { userId: user === null || user === void 0 ? void 0 : user.id })
            .andWhere('channel.isActive = :isActive', { isActive: true })
            .getMany();
        const result = [];
        for (const channel of channels) {
            let isChannelActive = true;
            let channelName = channel.name;
            if (channel.type === 'personal') {
                const msgCount = await this.messageRepo.count({
                    where: { channel: { id: channel.id } },
                });
                isChannelActive = msgCount > 0;
                const otherUser = (channel.users || []).find((u) => String(u.id) !== String(user.id));
                if (otherUser && otherUser.username) {
                    channelName = otherUser.username;
                }
            }
            let ownerInfo = null;
            if ((channel.type === 'group' || channel.type === 'group-private') &&
                channel.owner) {
                ownerInfo = this.remove_field_user({
                    ...channel.owner,
                    avatar: (_a = channel.owner.avatar) !== null && _a !== void 0 ? _a : null,
                    github_avatar: (_b = channel.owner.github_avatar) !== null && _b !== void 0 ? _b : null,
                });
            }
            result.push({
                id: channel.id,
                name: channelName,
                key: channel.key,
                json_data: channel.json_data,
                type: channel.type,
                member_count: channel.member_count,
                owner: ownerInfo,
                members: (channel.users || []).map((u) => {
                    var _a, _b;
                    return this.remove_field_user({
                        ...u,
                        avatar: (_a = u.avatar) !== null && _a !== void 0 ? _a : null,
                        github_avatar: (_b = u.github_avatar) !== null && _b !== void 0 ? _b : null,
                    });
                }),
                created_at: channel.created_at,
                updated_at: channel.updated_at,
                isChannelActive,
            });
        }
        return result;
    }
    async updateChannel(userId, channelId, params) {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) {
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
        }
        const isAdmin = user.role === 'admin';
        const channel = await this.channelRepo.findOne({
            where: { id: channelId },
            relations: ['users', 'owner'],
        });
        if (!channel) {
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy kênh', status: 404 });
        }
        if (channel.type === 'personal') {
            throw new microservices_1.RpcException({
                msg: 'Không thể cập nhật kênh personal',
                status: 400,
            });
        }
        if (!isAdmin) {
            const isOwner = channel.owner && String(channel.owner.id) === String(userId);
            let isPM = false;
            if (channel.type === 'group-private' && channel.json_data) {
                try {
                    const jsonData = typeof channel.json_data === 'string'
                        ? JSON.parse(channel.json_data)
                        : channel.json_data;
                    if ((jsonData === null || jsonData === void 0 ? void 0 : jsonData.userRoles) && Array.isArray(jsonData.userRoles)) {
                        const userRole = jsonData.userRoles.find((ur) => String(ur.userId) === String(userId));
                        if (userRole && userRole.roles && Array.isArray(userRole.roles)) {
                            isPM = userRole.roles.includes(1);
                        }
                    }
                }
                catch (error) {
                    console.error('Error parsing json_data:', error);
                }
            }
            const hasPermission = isOwner ||
                (channel.type === 'group-private' && isPM) ||
                channel.type === 'group';
            if (!hasPermission) {
                throw new microservices_1.RpcException({
                    msg: channel.type === 'group-private'
                        ? 'Bạn không có quyền cập nhật kênh này (chỉ Owner hoặc PM)'
                        : 'Bạn không có quyền cập nhật kênh này',
                    status: 403,
                });
            }
        }
        if (params.name !== undefined && params.name.trim()) {
            channel.name = params.name.trim();
        }
        if (params.isActive !== undefined) {
            channel.isActive = params.isActive;
        }
        if (params.type !== undefined) {
            if (params.type !== 'group' && params.type !== 'group-private') {
                throw new microservices_1.RpcException({
                    msg: 'Loại kênh không hợp lệ',
                    status: 400,
                });
            }
            if (channel.type === 'group-private' && params.type === 'group') {
                channel.key = null;
                channel.json_data = null;
            }
            channel.type = params.type;
        }
        if (channel.type === 'group-private') {
            if (params.key !== undefined) {
                channel.key = params.key;
            }
            if (params.json_data !== undefined) {
                if (params.json_data) {
                    try {
                        const jsonData = typeof params.json_data === 'string'
                            ? JSON.parse(params.json_data)
                            : params.json_data;
                        if (jsonData.userRoles && Array.isArray(jsonData.userRoles)) {
                            for (const userRole of jsonData.userRoles) {
                                if (!Array.isArray(userRole.roles)) {
                                    throw new microservices_1.RpcException({
                                        msg: 'Cấu trúc json_data không hợp lệ: roles phải là mảng',
                                        json_data: jsonData,
                                        status: 400,
                                    });
                                }
                            }
                        }
                        channel.json_data = jsonData;
                    }
                    catch (error) {
                        if (error instanceof microservices_1.RpcException) {
                            throw error;
                        }
                        throw new microservices_1.RpcException({
                            msg: 'json_data không hợp lệ: ' + error.message,
                            status: 400,
                        });
                    }
                }
                else {
                    channel.json_data = params.json_data;
                }
            }
        }
        else {
            channel.key = null;
            channel.json_data = null;
        }
        if (params.addUserIds && params.addUserIds.length > 0) {
            const usersToAdd = await this.userRepo.findBy({
                id: (0, typeorm_2.In)(params.addUserIds),
            });
            if (usersToAdd.length !== params.addUserIds.length) {
                throw new microservices_1.RpcException({
                    msg: 'Một số thành viên không tồn tại',
                    status: 400,
                });
            }
            const currentMemberIds = new Set(channel.users.map((u) => String(u.id)));
            const newMembers = usersToAdd.filter((u) => !currentMemberIds.has(String(u.id)));
            if (newMembers.length > 0) {
                channel.users.push(...newMembers);
                channel.member_count = channel.users.length;
            }
        }
        if (params.removeUserIds && params.removeUserIds.length > 0) {
            if (params.removeUserIds.some((id) => { var _a; return String(id) === String((_a = channel.owner) === null || _a === void 0 ? void 0 : _a.id); })) {
                throw new microservices_1.RpcException({
                    msg: 'Không thể xóa owner khỏi kênh',
                    status: 400,
                });
            }
            const removeIdSet = new Set(params.removeUserIds.map(String));
            channel.users = channel.users.filter((u) => !removeIdSet.has(String(u.id)));
            channel.member_count = channel.users.length;
            if (channel.users.length < 2) {
                throw new microservices_1.RpcException({
                    msg: 'Kênh phải có ít nhất 2 thành viên',
                    status: 400,
                });
            }
        }
        await this.channelRepo.save(channel);
        const updatedChannel = await this.channelRepo.findOne({
            where: { id: channelId },
            relations: ['users', 'owner'],
        });
        return {
            id: updatedChannel.id,
            name: updatedChannel.name,
            type: updatedChannel.type,
            key: updatedChannel.key,
            json_data: updatedChannel.json_data,
            member_count: updatedChannel.member_count,
            isActive: updatedChannel.isActive,
            owner: updatedChannel.owner
                ? this.remove_field_user({ ...updatedChannel.owner })
                : null,
            members: (updatedChannel.users || []).map((u) => {
                var _a, _b;
                return this.remove_field_user({
                    ...u,
                    avatar: (_a = u.avatar) !== null && _a !== void 0 ? _a : null,
                    github_avatar: (_b = u.github_avatar) !== null && _b !== void 0 ? _b : null,
                });
            }),
            created_at: updatedChannel.created_at,
            updated_at: updatedChannel.updated_at,
        };
    }
    async fetchHistory(user, channelId, options, noAuth = false) {
        var _a, _b, _c, _d, _e, _f;
        console.log('fetch History Dtaat', {
            user,
            channelId,
            options,
            noAuth
        });
        if (noAuth) {
            const channel = await this.channelRepo
                .createQueryBuilder('channel')
                .leftJoinAndSelect('channel.owner', 'owner')
                .leftJoinAndSelect('channel.users', 'member')
                .where('channel.id = :channelId', { channelId })
                .getOne();
            if (!channel) {
                throw new microservices_1.RpcException({
                    msg: 'Không tìm thấy kênh chat',
                    status: 404,
                });
            }
            const members = (channel.users || []).map((u) => {
                var _a, _b;
                return ({
                    id: u.id,
                    username: u.username,
                    email: u.email,
                    avatar: (_a = u.avatar) !== null && _a !== void 0 ? _a : null,
                    github_avatar: (_b = u.github_avatar) !== null && _b !== void 0 ? _b : null,
                    isOwner: channel.owner && String(u.id) === String(channel.owner.id),
                });
            });
            const { users, ...channelInfo } = channel;
            return {
                channel: channelInfo,
                members,
                items: [],
                total: null,
                page: null,
                pageSize: 0,
                hasMoreOlder: false,
                hasMoreNewer: false,
                cursors: {
                    before: null,
                    after: null,
                },
            };
        }
        const pageSize = Math.min(200, Math.max(1, (_a = options === null || options === void 0 ? void 0 : options.pageSize) !== null && _a !== void 0 ? _a : 50));
        const searchRadius = Math.min(100, Math.max(1, (_b = options === null || options === void 0 ? void 0 : options.searchRadius) !== null && _b !== void 0 ? _b : 25));
        const channelExists = await this.channelRepo.findOne({
            where: { id: channelId, isActive: true },
            select: ['id'],
        });
        if (!channelExists) {
            throw new microservices_1.RpcException({
                msg: 'Không tìm thấy kênh chat hoặc kênh đã bị vô hiệu hóa',
                status: 404,
            });
        }
        if (user.role !== 'admin') {
            const isMember = await this.channelRepo
                .createQueryBuilder('c')
                .innerJoin('c.users', 'u', 'u.id = :userId', { userId: user.id })
                .where('c.id = :channelId', { channelId })
                .getExists();
            if (!isMember) {
                throw new microservices_1.RpcException({
                    msg: 'Bạn không có quyền truy cập kênh này',
                    status: 403,
                });
            }
        }
        const channel = await this.channelRepo
            .createQueryBuilder('channel')
            .leftJoinAndSelect('channel.owner', 'owner')
            .leftJoinAndSelect('channel.users', 'member')
            .where('channel.id = :channelId', { channelId })
            .getOne();
        if (!channel) {
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy kênh chat', status: 404 });
        }
        if (options === null || options === void 0 ? void 0 : options.messageId) {
            const targetMessage = await this.messageRepo.findOne({
                where: { id: options.messageId, channel: { id: channelId } },
                select: ['id', 'send_at'],
            });
            if (!targetMessage) {
                throw new microservices_1.RpcException({
                    msg: 'Không tìm thấy tin nhắn',
                    status: 404,
                });
            }
            const olderMessages = await this.messageRepo
                .createQueryBuilder('message')
                .leftJoinAndSelect('message.sender', 'sender')
                .leftJoinAndSelect('message.attachments', 'attachment')
                .where('message.channelId = :channelId', { channelId })
                .andWhere(`(message.send_at < :targetTime)
         OR (message.send_at = :targetTime AND message.id < :targetId)`, { targetTime: targetMessage.send_at, targetId: targetMessage.id })
                .orderBy('message.send_at', 'DESC')
                .addOrderBy('message.id', 'DESC')
                .take(searchRadius)
                .getMany();
            const newerMessages = await this.messageRepo
                .createQueryBuilder('message')
                .leftJoinAndSelect('message.sender', 'sender')
                .leftJoinAndSelect('message.attachments', 'attachment')
                .where('message.channelId = :channelId', { channelId })
                .andWhere(`(message.send_at > :targetTime)
         OR (message.send_at = :targetTime AND message.id > :targetId)`, { targetTime: targetMessage.send_at, targetId: targetMessage.id })
                .orderBy('message.send_at', 'ASC')
                .addOrderBy('message.id', 'ASC')
                .take(searchRadius)
                .getMany();
            const targetMessageFull = await this.messageRepo.findOne({
                where: { id: options.messageId },
                relations: ['sender', 'attachments'],
            });
            const rows = [
                ...olderMessages.reverse(),
                targetMessageFull,
                ...newerMessages,
            ];
            const items = rows.map((msg) => {
                let senderInfo = undefined;
                let isMine = false;
                if (msg.sender) {
                    if (typeof msg.sender === 'object') {
                        senderInfo = this.remove_field_user({
                            ...msg.sender,
                            avatar: msg.sender.avatar || msg.sender.github_avatar,
                        });
                        isMine = String(msg.sender.id) === String(user.id);
                    }
                    else {
                        const senderObj = (channel.users || []).find((u) => String(u.id) === String(msg.sender));
                        senderInfo = senderObj
                            ? this.remove_field_user({ ...senderObj })
                            : undefined;
                        isMine = String(msg.sender) === String(user.id);
                    }
                }
                const attachments = (msg.attachments || []).map((att) => ({
                    id: att.id,
                    filename: att.filename,
                    fileUrl: att.fileUrl,
                    mimeType: att.mimeType,
                    fileSize: att.fileSize,
                    key: att.key,
                }));
                return {
                    ...msg,
                    channelId: msg.channelId || (msg.channel ? msg.channel.id : null),
                    sender: senderInfo,
                    attachments,
                    isMine,
                    isSearch: String(msg.id) === String(options.messageId),
                };
            });
            const oldest = items[0];
            const newest = items[items.length - 1];
            const targetIndex = items.findIndex((m) => m.isSearch);
            const members = (channel.users || []).map((u) => {
                var _a, _b;
                return ({
                    id: u.id,
                    username: u.username,
                    email: u.email,
                    avatar: (_a = u.avatar) !== null && _a !== void 0 ? _a : null,
                    github_avatar: (_b = u.github_avatar) !== null && _b !== void 0 ? _b : null,
                    isMine: String(u.id) === String(user.id),
                    isOwner: channel.owner && String(u.id) === String(channel.owner.id),
                });
            });
            const { users, ...channelInfo } = channel;
            return {
                channel: channelInfo,
                members,
                items,
                total: null,
                page: null,
                pageSize: items.length,
                hasMoreOlder: olderMessages.length === searchRadius,
                hasMoreNewer: newerMessages.length === searchRadius,
                searchMode: true,
                targetIndex,
                cursors: {
                    before: (_c = oldest === null || oldest === void 0 ? void 0 : oldest.id) !== null && _c !== void 0 ? _c : null,
                    after: (_d = newest === null || newest === void 0 ? void 0 : newest.id) !== null && _d !== void 0 ? _d : null,
                },
            };
        }
        const getAnchor = async (id) => {
            if (!id)
                return undefined;
            return this.messageRepo.findOne({
                where: { id },
                select: ['id', 'send_at'],
            });
        };
        const anchorBefore = await getAnchor(options === null || options === void 0 ? void 0 : options.before);
        const anchorAfter = !(options === null || options === void 0 ? void 0 : options.before)
            ? await getAnchor(options === null || options === void 0 ? void 0 : options.after)
            : undefined;
        const baseQB = this.messageRepo
            .createQueryBuilder('message')
            .leftJoinAndSelect('message.sender', 'sender')
            .leftJoinAndSelect('message.attachments', 'attachment')
            .where('message.channelId = :channelId', { channelId });
        if (options === null || options === void 0 ? void 0 : options.since) {
            const sinceDate = new Date(options.since);
            if (!isNaN(sinceDate.getTime())) {
                baseQB.andWhere('message.send_at >= :sinceDate', { sinceDate });
            }
        }
        let rows = [];
        let hasMoreOlder = false;
        let hasMoreNewer = false;
        if (options === null || options === void 0 ? void 0 : options.latest) {
            rows = await baseQB
                .orderBy('message.send_at', 'DESC')
                .addOrderBy('message.id', 'DESC')
                .take(1)
                .getMany();
            rows = rows.reverse();
        }
        else if (anchorBefore) {
            const r = await baseQB
                .andWhere(`(message.send_at < :anchorTime)
         OR (message.send_at = :anchorTime AND message.id < :anchorId)`, { anchorTime: anchorBefore.send_at, anchorId: anchorBefore.id })
                .orderBy('message.send_at', 'DESC')
                .addOrderBy('message.id', 'DESC')
                .take(pageSize + 1)
                .getMany();
            hasMoreOlder = r.length > pageSize;
            rows = r.slice(0, pageSize);
            rows = rows.reverse();
        }
        else if (anchorAfter) {
            const rAsc = await baseQB
                .andWhere(`(message.send_at > :anchorTime)
         OR (message.send_at = :anchorTime AND message.id > :anchorId)`, { anchorTime: anchorAfter.send_at, anchorId: anchorAfter.id })
                .orderBy('message.send_at', 'ASC')
                .addOrderBy('message.id', 'ASC')
                .take(pageSize + 1)
                .getMany();
            hasMoreNewer = rAsc.length > pageSize;
            rows = rAsc.slice(0, pageSize);
        }
        else {
            const r = await baseQB
                .orderBy('message.send_at', 'DESC')
                .addOrderBy('message.id', 'DESC')
                .take(pageSize + 1)
                .getMany();
            hasMoreOlder = r.length > pageSize;
            rows = r.slice(0, pageSize).reverse();
        }
        const items = rows.map((msg) => {
            let senderInfo = undefined;
            let isMine = false;
            if (msg.sender) {
                if (typeof msg.sender === 'object') {
                    senderInfo = this.remove_field_user({
                        ...msg.sender,
                        avatar: msg.sender.avatar || msg.sender.github_avatar,
                    });
                    isMine = String(msg.sender.id) === String(user.id);
                }
                else {
                    const senderObj = (channel.users || []).find((u) => String(u.id) === String(msg.sender));
                    senderInfo = senderObj
                        ? this.remove_field_user({ ...senderObj })
                        : undefined;
                    isMine = String(msg.sender) === String(user.id);
                }
            }
            const attachments = (msg.attachments || []).map((att) => ({
                id: att.id,
                filename: att.filename,
                fileUrl: att.fileUrl,
                mimeType: att.mimeType,
                fileSize: att.fileSize,
                key: att.key,
            }));
            return {
                ...msg,
                channelId: msg.channelId || (msg.channel ? msg.channel.id : null),
                sender: senderInfo,
                attachments,
                isMine,
                isSearch: false,
            };
        });
        const oldest = items[0];
        const newest = items[items.length - 1];
        const nextBefore = (_e = oldest === null || oldest === void 0 ? void 0 : oldest.id) !== null && _e !== void 0 ? _e : null;
        const nextAfter = (_f = newest === null || newest === void 0 ? void 0 : newest.id) !== null && _f !== void 0 ? _f : null;
        const members = (channel.users || []).map((u) => {
            var _a, _b;
            return ({
                id: u.id,
                username: u.username,
                email: u.email,
                avatar: (_a = u.avatar) !== null && _a !== void 0 ? _a : null,
                github_avatar: (_b = u.github_avatar) !== null && _b !== void 0 ? _b : null,
                isMine: String(u.id) === String(user.id),
                isOwner: channel.owner && String(u.id) === String(channel.owner.id),
            });
        });
        const { users, ...channelInfo } = channel;
        return {
            channel: channelInfo,
            members,
            items,
            total: null,
            page: null,
            pageSize,
            hasMoreOlder,
            hasMoreNewer,
            cursors: {
                before: nextBefore,
                after: nextAfter,
            },
        };
    }
    async searchChatEntities(user, data) {
        const key = ((data === null || data === void 0 ? void 0 : data.key) || '').trim().toLowerCase();
        const type = (data === null || data === void 0 ? void 0 : data.type) || 'all';
        const limit = (data === null || data === void 0 ? void 0 : data.limit) || 5;
        if (!key) {
            return { users: [], channels: { personal: [], group: [], private: [] } };
        }
        const searchUsers = async () => {
            const users = await this.userRepo
                .createQueryBuilder('u')
                .select(['u.id', 'u.username', 'u.email'])
                .where('(LOWER(u.username) LIKE :key OR LOWER(u.email) LIKE :key) AND u.id != :uid', { key: `%${key}%`, uid: user.id })
                .take(limit)
                .getMany();
            return users.map((u) => this.remove_field_user({ ...u }));
        };
        const searchGroupChannels = async () => {
            const channels = await this.channelRepo
                .createQueryBuilder('c')
                .select(['c.id', 'c.name', 'c.type'])
                .where('c.type = :type', { type: 'group' })
                .andWhere('c.isActive = :isActive', { isActive: true })
                .andWhere('LOWER(c.name) LIKE :key', { key: `%${key}%` })
                .take(limit)
                .getMany();
            const memberIds = await this.channelRepo
                .createQueryBuilder('c')
                .innerJoin('c.users', 'u', 'u.id = :uid', { uid: user.id })
                .select('c.id', 'id')
                .where('c.type = :type', { type: 'group' })
                .getRawMany();
            const memberSet = new Set(memberIds.map((m) => m.id));
            return channels.map((ch) => ({
                ...ch,
                isMember: memberSet.has(ch.id),
            }));
        };
        const searchPrivateChannels = async () => {
            const channels = await this.channelRepo
                .createQueryBuilder('c')
                .innerJoin('c.users', 'u', 'u.id = :uid', { uid: user.id })
                .leftJoinAndSelect('c.users', 'members')
                .select(['c.id', 'c.name', 'c.type', 'c.key', 'c.json_data'])
                .addSelect([
                'members.id',
                'members.username',
                'members.email',
                'members.avatar',
                'members.github_avatar',
            ])
                .where('c.type = :type', { type: 'group-private' })
                .andWhere('c.isActive = :isActive', { isActive: true })
                .andWhere('LOWER(c.name) LIKE :key', { key: `%${key}%` })
                .take(limit)
                .getMany();
            return channels.map((ch) => {
                var _a, _b;
                return ({
                    id: ch.id,
                    name: ch.name,
                    type: ch.type,
                    key: (_a = ch.key) !== null && _a !== void 0 ? _a : null,
                    json_data: (_b = ch.json_data) !== null && _b !== void 0 ? _b : null,
                    isMember: true,
                    members: (ch.users || []).map((u) => {
                        var _a, _b;
                        return this.remove_field_user({
                            ...u,
                            avatar: (_a = u.avatar) !== null && _a !== void 0 ? _a : null,
                            github_avatar: (_b = u.github_avatar) !== null && _b !== void 0 ? _b : null,
                        });
                    }),
                });
            });
        };
        const searchPersonalChannels = async () => {
            const channels = await this.channelRepo
                .createQueryBuilder('c')
                .innerJoin('c.users', 'u')
                .innerJoin('c.users', 'ou')
                .select(['c.id', 'c.type', 'ou.username'])
                .where('c.type = :type', { type: 'personal' })
                .andWhere('c.isActive = :isActive', { isActive: true })
                .andWhere('u.id = :uid', { uid: user.id })
                .andWhere('ou.id != :uid', { uid: user.id })
                .andWhere('LOWER(ou.username) LIKE :key', { key: `%${key}%` })
                .take(limit)
                .getRawMany();
            return channels.map((ch) => ({
                id: ch.c_id,
                name: ch.ou_username,
                isMember: true,
            }));
        };
        const result = {
            users: [],
            channels: { personal: [], group: [], private: [] },
        };
        if (type === 'user') {
            result.users = await searchUsers();
        }
        else if (type === 'group') {
            result.channels.group = await searchGroupChannels();
        }
        else if (type === 'group-private') {
            result.channels.private = await searchPrivateChannels();
        }
        else if (type === 'personal') {
            result.channels.personal = await searchPersonalChannels();
        }
        else {
            [
                result.users,
                result.channels.group,
                result.channels.private,
                result.channels.personal,
            ] = await Promise.all([
                searchUsers(),
                searchGroupChannels(),
                searchPrivateChannels(),
                searchPersonalChannels(),
            ]);
        }
        return result;
    }
    async addRepositoriesToChannel(userId, channelId, repoIds) {
        var _a;
        if (!Array.isArray(repoIds) || repoIds.length === 0) {
            throw new microservices_1.RpcException({
                msg: 'Danh sách Repository không hợp lệ',
                status: 400,
            });
        }
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) {
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy user', status: 404 });
        }
        if (!user.github_installation_id) {
            throw new microservices_1.RpcException({
                msg: 'User chưa cài đặt GitHub App',
                status: 400,
            });
        }
        const channel = await this.channelRepo.findOne({
            where: { id: channelId },
            relations: ['users'],
        });
        if (!channel) {
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy channel', status: 404 });
        }
        if (!channel.isActive) {
            throw new microservices_1.RpcException({ msg: 'Kênh đã bị vô hiệu hóa', status: 403 });
        }
        const isMember = channel.users.some((u) => String(u.id) === String(user.id));
        if (!isMember) {
            throw new microservices_1.RpcException({
                msg: 'Bạn không phải thành viên của kênh này',
                status: 403,
            });
        }
        const repoRepo = this.attachmentRepo.manager.getRepository(entities_3.Repository);
        for (const rpid of repoIds) {
            const repo = await repoRepo.findOne({
                where: { repo_id: rpid, user: { id: user.id } },
                relations: ['channels'],
            });
            if (repo &&
                ((_a = repo.channels) === null || _a === void 0 ? void 0 : _a.some((c) => String(c.id) === String(channel.id)))) {
                throw new microservices_1.RpcException({
                    msg: `Không được thêm trùng Repository`,
                    status: 400,
                });
            }
        }
        const repos = [];
        for (const rpid of repoIds) {
            let repo = await repoRepo.findOne({
                where: { repo_id: rpid, user: { id: user.id } },
                relations: ['channels'],
            });
            if (!repo) {
                repo = repoRepo.create({ repo_id: rpid, user });
                await repoRepo.save(repo);
            }
            if (!repo.channels)
                repo.channels = [];
            const alreadyLinked = repo.channels.some((c) => String(c.id) === String(channel.id));
            if (!alreadyLinked) {
                repo.channels.push(channel);
                await repoRepo.save(repo);
            }
            repos.push(repo);
        }
        return {
            repositories: repos.map((r) => ({
                id: r.id,
                repo_id: r.repo_id,
            })),
        };
    }
    async listRepositoriesByChannel(userId, channelId, data) {
        var _a, _b, _c;
        const order = (_a = data.order) !== null && _a !== void 0 ? _a : 'asc';
        const limit = (_b = data.limit) !== null && _b !== void 0 ? _b : 20;
        const page = (_c = data.page) !== null && _c !== void 0 ? _c : 1;
        const user = await this.userRepo.findOne({
            where: { id: userId },
            select: ['id', 'role']
        });
        if (!user) {
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
        }
        const isAdmin = user.role === 'admin';
        const channel = await this.channelRepo.findOne({
            where: { id: channelId },
            relations: ['users', 'repositories', 'repositories.user'],
        });
        if (!channel) {
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy channel', status: 404 });
        }
        if (!channel.isActive) {
            throw new microservices_1.RpcException({ msg: 'Kênh đã bị vô hiệu hóa', status: 403 });
        }
        if (!isAdmin) {
            const isMember = channel.users.some((u) => String(u.id) === String(userId));
            if (!isMember) {
                throw new microservices_1.RpcException({
                    msg: 'Bạn không phải thành viên của kênh này',
                    status: 403,
                });
            }
        }
        let repos = [...(channel.repositories || [])];
        repos.sort((a, b) => order === 'asc'
            ? Number(a.id) - Number(b.id)
            : Number(b.id) - Number(a.id));
        const total = repos.length;
        const start = (page - 1) * limit;
        const end = start + limit;
        const pagedRepos = repos.slice(start, end);
        return {
            total,
            page,
            limit,
            items: pagedRepos.map((repo) => {
                var _a, _b;
                return ({
                    repo_id: repo.repo_id,
                    user_id: ((_a = repo.user) === null || _a === void 0 ? void 0 : _a.id) || null,
                    repo_installation: ((_b = repo.user) === null || _b === void 0 ? void 0 : _b.github_installation_id) || null,
                });
            }),
        };
    }
    async removeRepositoryFromChannel(userId, channelId, repoId) {
        const user = await this.userRepo.findOne({
            where: { id: userId },
            select: ['id', 'role']
        });
        if (!user)
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy user', status: 404 });
        const isAdmin = user.role === 'admin';
        const channel = await this.channelRepo.findOne({
            where: { id: channelId },
            relations: ['users', 'repositories', 'owner'],
        });
        if (!channel)
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy channel', status: 404 });
        if (!channel.isActive)
            throw new microservices_1.RpcException({ msg: 'Kênh đã bị vô hiệu hóa', status: 403 });
        if (!isAdmin) {
            const isMember = channel.users.some((u) => String(u.id) === String(userId));
            if (!isMember)
                throw new microservices_1.RpcException({
                    msg: 'Bạn không phải thành viên của kênh này',
                    status: 403,
                });
        }
        const repoRepo = this.attachmentRepo.manager.getRepository(entities_3.Repository);
        const repo = await repoRepo.findOne({
            where: { repo_id: String(repoId) },
            relations: ['channels', 'user'],
        });
        if (!repo ||
            !repo.channels.some((c) => String(c.id) === String(channelId))) {
            throw new microservices_1.RpcException({
                msg: 'Repository không tồn tại trong kênh này',
                status: 404,
            });
        }
        if (!isAdmin) {
            const isRepoOwner = String(repo.user.id) === String(userId);
            const isChannelOwner = channel.owner && String(channel.owner.id) === String(userId);
            if (!isRepoOwner && !isChannelOwner) {
                throw new microservices_1.RpcException({
                    msg: 'Bạn không có quyền xóa repository này khỏi kênh',
                    status: 403,
                });
            }
        }
        repo.channels = repo.channels.filter((c) => String(c.id) !== String(channelId));
        await repoRepo.save(repo);
        return {
            msg: 'Đã xóa repository khỏi kênh',
            repo_id: repoId,
            channel_id: channelId,
        };
    }
    async addMembersToChannel(userId, channelId, memberIds) {
        var _a;
        if (!Array.isArray(memberIds) || memberIds.length === 0) {
            throw new microservices_1.RpcException({
                msg: 'Danh sách thành viên không hợp lệ',
                status: 400,
            });
        }
        const channel = await this.channelRepo.findOne({
            where: { id: channelId },
            relations: ['users', 'owner'],
        });
        if (!channel) {
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy channel', status: 404 });
        }
        if (!channel.isActive) {
            throw new microservices_1.RpcException({ msg: 'Kênh đã bị vô hiệu hóa', status: 403 });
        }
        const isOwner = String((_a = channel === null || channel === void 0 ? void 0 : channel.owner) === null || _a === void 0 ? void 0 : _a.id) === String(userId);
        if (!isOwner) {
            throw new microservices_1.RpcException({
                msg: 'Bạn không có quyền thêm thành viên vào kênh này',
                status: 403,
            });
        }
        const users = await this.userRepo.findBy({ id: (0, typeorm_2.In)(memberIds) });
        channel.users.push(...users);
        await this.channelRepo.save(channel);
        return {
            msg: 'Đã thêm thành viên vào kênh',
            channel_id: channelId,
            member_ids: memberIds,
        };
    }
    async removeMembersFromChannel(userId, channelId, memberIds) {
        var _a;
        if (!Array.isArray(memberIds) || memberIds.length === 0) {
            throw new microservices_1.RpcException({
                msg: 'Danh sách thành viên không hợp lệ',
                status: 400,
            });
        }
        const channel = await this.channelRepo.findOne({
            where: { id: channelId },
            relations: ['users'],
        });
        if (!channel) {
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy channel', status: 404 });
        }
        if (!channel.isActive) {
            throw new microservices_1.RpcException({ msg: 'Kênh đã bị vô hiệu hóa', status: 403 });
        }
        const isOwner = String((_a = channel === null || channel === void 0 ? void 0 : channel.owner) === null || _a === void 0 ? void 0 : _a.id) === String(userId);
        if (!isOwner) {
            throw new microservices_1.RpcException({
                msg: 'Bạn không có quyền xóa thành viên khỏi kênh này',
                status: 403,
            });
        }
        channel.users = channel.users.filter((u) => !memberIds.includes(u.id));
        await this.channelRepo.save(channel);
        return {
            msg: 'Đã xóa thành viên khỏi kênh',
            channel_id: channelId,
            member_ids: memberIds,
        };
    }
    async listNonMembers(channelId, username, limit, cursor) {
        limit = limit !== null && limit !== void 0 ? limit : 20;
        const channel = await this.channelRepo.findOne({
            where: { id: channelId },
            relations: ['users'],
        });
        if (!channel) {
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy channel', status: 404 });
        }
        if (!channel.isActive) {
            throw new microservices_1.RpcException({ msg: 'Kênh đã bị vô hiệu hóa', status: 403 });
        }
        const memberIds = channel.users.map((u) => u.id);
        const qb = this.userRepo
            .createQueryBuilder('user')
            .where('user.id NOT IN (:...memberIds)', {
            memberIds: memberIds.length > 0 ? memberIds : [0],
        })
            .orderBy('user.id', 'ASC')
            .take(limit + 1);
        if (cursor) {
            qb.andWhere('user.id > :cursor', { cursor });
        }
        if (username && username.trim()) {
            qb.andWhere('LOWER(user.username) LIKE :username', {
                username: `%${username.trim().toLowerCase()}%`,
            });
        }
        const users = await qb
            .select(['user.id', 'user.username', 'user.email'])
            .getMany();
        const hasMore = users.length > limit;
        const items = users.slice(0, limit);
        const nextCursor = hasMore ? items[items.length - 1].id : null;
        return {
            users: items.map((u) => this.remove_field_user({ ...u })),
            nextCursor,
            hasMore,
        };
    }
    async searchMessages(userId, params) {
        const { query, channelId, senderId, startDate, endDate, limit = 20, cursor, } = params;
        if (!query || query.trim().length < 2) {
            return { items: [], nextCursor: null, hasMore: false };
        }
        const user = await this.userRepo.findOne({
            where: { id: userId },
            select: ['id', 'role']
        });
        if (!user) {
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
        }
        const isAdmin = user.role === 'admin';
        const qb = this.messageRepo
            .createQueryBuilder('message')
            .leftJoinAndSelect('message.channel', 'channel')
            .leftJoinAndSelect('message.sender', 'sender')
            .leftJoinAndSelect('message.attachments', 'attachments')
            .where('message.text ILIKE :query', { query: `%${query.trim()}%` })
            .andWhere('message.type IN (:...types)', {
            types: ['message', 'reply-message', 'file-upload'],
        })
            .orderBy('message.created_at', 'DESC')
            .addOrderBy('message.id', 'DESC')
            .take(limit + 1);
        if (cursor) {
            qb.andWhere('message.id < :cursor', { cursor });
        }
        if (channelId) {
            if (!isAdmin) {
                const isMember = await this.channelRepo
                    .createQueryBuilder('c')
                    .innerJoin('c.users', 'u', 'u.id = :userId', { userId })
                    .where('c.id = :channelId', { channelId })
                    .andWhere('c.isActive = :isActive', { isActive: true })
                    .getExists();
                if (!isMember) {
                    throw new microservices_1.RpcException({
                        msg: 'Bạn không có quyền xem kênh này hoặc kênh không khả dụng',
                        status: 403,
                    });
                }
            }
            else {
                const channelActive = await this.channelRepo
                    .createQueryBuilder('c')
                    .where('c.id = :channelId', { channelId })
                    .andWhere('c.isActive = :isActive', { isActive: true })
                    .getExists();
                if (!channelActive) {
                    throw new microservices_1.RpcException({
                        msg: 'Kênh không tồn tại hoặc không khả dụng',
                        status: 404,
                    });
                }
            }
            qb.andWhere('channel.id = :channelId', { channelId });
        }
        else {
            if (isAdmin) {
                qb.andWhere('channel.isActive = :isActive', { isActive: true });
            }
            else {
                const userChannels = await this.channelRepo
                    .createQueryBuilder('channel')
                    .leftJoin('channel.users', 'user')
                    .where('user.id = :userId', { userId })
                    .andWhere('channel.isActive = :isActive', { isActive: true })
                    .select('channel.id')
                    .getMany();
                const channelIds = userChannels.map((c) => c.id);
                if (channelIds.length === 0) {
                    return { items: [], nextCursor: null, hasMore: false };
                }
                qb.andWhere('channel.id IN (:...channelIds)', { channelIds });
            }
        }
        if (senderId) {
            qb.andWhere('sender.id = :senderId', { senderId });
        }
        if (startDate) {
            qb.andWhere('message.created_at >= :startDate', { startDate });
        }
        if (endDate) {
            qb.andWhere('message.created_at <= :endDate', { endDate });
        }
        const messages = await qb.getMany();
        const hasMore = messages.length > limit;
        const items = messages.slice(0, limit);
        const nextCursor = hasMore ? items[items.length - 1].id : null;
        const formatted = items.map((msg) => ({
            ...msg,
            sender: msg.sender
                ? {
                    id: msg.sender.id,
                    username: msg.sender.username,
                    email: msg.sender.email,
                    avatar: msg.sender.avatar,
                }
                : null,
        }));
        return {
            items: formatted,
            nextCursor,
            hasMore,
        };
    }
    async searchMessagesByKeyword(userId, params) {
        const { key, channelId, limit = 20, page = 1 } = params;
        if (!key || key.trim().length < 2) {
            return {
                items: [],
                total: 0,
                page: 1,
                limit,
                totalPages: 0,
                hasMore: false,
            };
        }
        const keyword = key.trim().toLowerCase();
        const take = Math.min(100, Math.max(1, limit));
        const skip = (Math.max(1, page) - 1) * take;
        const user = await this.userRepo.findOne({
            where: { id: userId },
            select: ['id', 'role']
        });
        if (!user) {
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
        }
        const isAdmin = user.role === 'admin';
        const qb = this.messageRepo
            .createQueryBuilder('message')
            .leftJoinAndSelect('message.channel', 'channel')
            .leftJoinAndSelect('message.sender', 'sender')
            .leftJoinAndSelect('message.attachments', 'attachments')
            .where('LOWER(message.text) LIKE :keyword', { keyword: `%${keyword}%` })
            .andWhere('message.type IN (:...types)', {
            types: [
                'message',
                'reply-message',
                'file-upload',
                'code-card',
                'tool',
                'ba-require',
                'tester-report',
            ],
        });
        if (channelId) {
            if (!isAdmin) {
                const isMember = await this.channelRepo
                    .createQueryBuilder('c')
                    .innerJoin('c.users', 'u', 'u.id = :userId', { userId })
                    .where('c.id = :channelId', { channelId })
                    .andWhere('c.isActive = :isActive', { isActive: true })
                    .getExists();
                if (!isMember) {
                    throw new microservices_1.RpcException({
                        msg: 'Bạn không có quyền xem kênh này',
                        status: 403,
                    });
                }
            }
            else {
                const channelActive = await this.channelRepo
                    .createQueryBuilder('c')
                    .where('c.id = :channelId', { channelId })
                    .andWhere('c.isActive = :isActive', { isActive: true })
                    .getExists();
                if (!channelActive) {
                    throw new microservices_1.RpcException({
                        msg: 'Kênh không tồn tại hoặc không khả dụng',
                        status: 404,
                    });
                }
            }
            qb.andWhere('channel.id = :channelId', { channelId });
        }
        else {
            if (isAdmin) {
                qb.andWhere('channel.isActive = :isActive', { isActive: true });
            }
            else {
                const userChannels = await this.channelRepo
                    .createQueryBuilder('channel')
                    .innerJoin('channel.users', 'user', 'user.id = :userId', { userId })
                    .andWhere('channel.isActive = :isActive', { isActive: true })
                    .select('channel.id')
                    .getMany();
                const channelIds = userChannels.map((c) => c.id);
                if (channelIds.length === 0) {
                    return {
                        items: [],
                        total: 0,
                        page: 1,
                        limit: take,
                        totalPages: 0,
                        hasMore: false,
                    };
                }
                qb.andWhere('channel.id IN (:...channelIds)', { channelIds });
            }
        }
        const total = await qb.getCount();
        const totalPages = Math.ceil(total / take);
        const hasMore = page < totalPages;
        const messages = await qb
            .orderBy('message.send_at', 'DESC')
            .addOrderBy('message.id', 'DESC')
            .skip(skip)
            .take(take)
            .getMany();
        const items = messages.map((msg) => {
            var _a, _b, _c, _d, _e, _f;
            let senderInfo = null;
            if (msg.sender) {
                senderInfo = {
                    id: msg.sender.id,
                    username: msg.sender.username,
                    email: msg.sender.email,
                    avatar: (_b = (_a = msg.sender.avatar) !== null && _a !== void 0 ? _a : msg.sender.github_avatar) !== null && _b !== void 0 ? _b : null,
                };
            }
            const attachments = (msg.attachments || []).map((att) => ({
                id: att.id,
                filename: att.filename,
                fileUrl: att.fileUrl,
                mimeType: att.mimeType,
                fileSize: att.fileSize,
                key: att.key,
            }));
            let highlightedText = msg.text;
            if (msg.text && keyword) {
                const regex = new RegExp(`(${keyword})`, 'gi');
                highlightedText = msg.text.replace(regex, '<mark>$1</mark>');
            }
            return {
                id: msg.id,
                text: msg.text,
                highlightedText: highlightedText,
                send_at: msg.send_at,
                created_at: msg.created_at,
                type: msg.type,
                json_data: msg.json_data,
                channelId: (_c = msg.channel) === null || _c === void 0 ? void 0 : _c.id,
                channelName: (_d = msg.channel) === null || _d === void 0 ? void 0 : _d.name,
                channelType: (_e = msg.channel) === null || _e === void 0 ? void 0 : _e.type,
                sender: senderInfo,
                attachments,
                isMine: String((_f = msg.sender) === null || _f === void 0 ? void 0 : _f.id) === String(userId),
            };
        });
        return {
            items,
            total,
            page: Math.max(1, page),
            limit: take,
            totalPages,
            hasMore,
            keyword,
        };
    }
    async getChannelsByRepositoryId(userId, repoId) {
        var _a;
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) {
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy user', status: 404 });
        }
        const repoRepo = this.attachmentRepo.manager.getRepository(entities_3.Repository);
        const repo = await repoRepo.findOne({
            where: { repo_id: String(repoId) },
            relations: ['channels', 'channels.users', 'user'],
        });
        if (!repo) {
            throw new microservices_1.RpcException({
                msg: 'Repository không tồn tại',
                status: 404,
            });
        }
        const userChannels = (repo.channels || []).filter((channel) => channel.isActive && channel.users.some((u) => String(u.id) === String(userId)));
        return {
            repo_id: repo.repo_id,
            repo_owner_id: (_a = repo.user) === null || _a === void 0 ? void 0 : _a.id,
            total_channels: userChannels.length,
            channel_ids: userChannels.map((ch) => ch.id),
            channels: userChannels.map((ch) => ({
                id: ch.id,
                name: ch.name,
                type: ch.type,
                member_count: ch.member_count,
            })),
        };
    }
    async getChannelsByRepositoryIds(userId, data) {
        if (!Array.isArray(data.repoIds) || data.repoIds.length === 0) {
            throw new microservices_1.RpcException({
                msg: 'Danh sách repository IDs không hợp lệ',
                status: 400,
            });
        }
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) {
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy user', status: 404 });
        }
        const repoRepo = this.attachmentRepo.manager.getRepository(entities_3.Repository);
        const repos = await repoRepo.find({
            where: { repo_id: (0, typeorm_2.In)(data.repoIds) },
            relations: ['channels', 'channels.users'],
        });
        const channelIds = new Set();
        for (const repo of repos) {
            for (const channel of repo.channels || []) {
                const isMember = channel.users.some((u) => String(u.id) === String(userId));
                if (isMember && channel.isActive) {
                    channelIds.add(String(channel.id));
                }
            }
        }
        return Array.from(channelIds);
    }
    async channelCRUD(userId, data, method) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) {
            throw new microservices_1.RpcException({ msg: 'Không tìm thấy người dùng', status: 404 });
        }
        if (user.role !== 'admin') {
            throw new microservices_1.RpcException({
                msg: 'Không có quyền thực hiện hành động này',
                status: 403,
            });
        }
        switch (method) {
            case 'create': {
                if (!data.name || !data.type || !Array.isArray(data.userIds)) {
                    throw new microservices_1.RpcException({
                        msg: 'Thiếu thông tin: name, type, userIds',
                        status: 400,
                    });
                }
                if (data.userIds.length < 2) {
                    throw new microservices_1.RpcException({
                        msg: 'Channel phải có ít nhất 2 thành viên',
                        status: 400,
                    });
                }
                const members = await this.userRepo.findBy({
                    id: (0, typeorm_2.In)(data.userIds),
                });
                if (members.length !== data.userIds.length) {
                    throw new microservices_1.RpcException({
                        msg: 'Một số user không tồn tại',
                        status: 400,
                    });
                }
                let owner = null;
                if (data.type === 'group' || data.type === 'group-private') {
                    const ownerId = data.ownerId || data.userIds[0];
                    owner = members.find((m) => String(m.id) === String(ownerId));
                    if (!owner) {
                        throw new microservices_1.RpcException({
                            msg: 'Owner phải là thành viên của channel',
                            status: 400,
                        });
                    }
                }
                const newChannel = this.channelRepo.create({
                    name: data.name.trim(),
                    type: data.type,
                    users: members,
                    member_count: members.length,
                    owner: owner || undefined,
                    key: data.type === 'group-private' ? data.key : null,
                    json_data: data.type === 'group-private' ? data.json_data : null,
                });
                const saved = await this.channelRepo.save(newChannel);
                const fullChannel = await this.channelRepo.findOne({
                    where: { id: saved.id },
                    relations: ['users', 'owner'],
                });
                return {
                    id: fullChannel.id,
                    name: fullChannel.name,
                    type: fullChannel.type,
                    key: fullChannel.key,
                    json_data: fullChannel.json_data,
                    member_count: fullChannel.member_count,
                    owner: fullChannel.owner
                        ? this.remove_field_user({ ...fullChannel.owner })
                        : null,
                    members: (fullChannel.users || []).map((u) => {
                        var _a, _b;
                        return this.remove_field_user({
                            ...u,
                            avatar: (_b = (_a = u.avatar) !== null && _a !== void 0 ? _a : u.github_avatar) !== null && _b !== void 0 ? _b : null,
                        });
                    }),
                    isActive: fullChannel.isActive,
                    created_at: fullChannel.created_at,
                    updated_at: fullChannel.updated_at,
                };
            }
            case 'read-one': {
                if (!data.id) {
                    throw new microservices_1.RpcException({
                        msg: 'Thiếu channelId',
                        status: 400,
                    });
                }
                const channel = await this.channelRepo.findOne({
                    where: { id: data.id },
                    relations: ['users', 'owner', 'repositories'],
                });
                if (!channel) {
                    throw new microservices_1.RpcException({
                        msg: 'Không tìm thấy channel',
                        status: 404,
                    });
                }
                const messageCount = await this.messageRepo.count({
                    where: { channel: { id: channel.id } },
                });
                const pageSize = Math.min(200, Math.max(1, (_a = data === null || data === void 0 ? void 0 : data.pageSize) !== null && _a !== void 0 ? _a : 50));
                const getAnchor = async (id) => {
                    if (!id)
                        return undefined;
                    return this.messageRepo.findOne({
                        where: { id },
                        select: ['id', 'send_at'],
                    });
                };
                const anchorBefore = await getAnchor(data === null || data === void 0 ? void 0 : data.before);
                const anchorAfter = !(data === null || data === void 0 ? void 0 : data.before) ? await getAnchor(data === null || data === void 0 ? void 0 : data.after) : undefined;
                const baseQB = this.messageRepo
                    .createQueryBuilder('message')
                    .leftJoinAndSelect('message.sender', 'sender')
                    .leftJoinAndSelect('message.attachments', 'attachment')
                    .where('message.channelId = :channelId', { channelId: data.id });
                let rows = [];
                let hasMoreOlder = false;
                let hasMoreNewer = false;
                if (data === null || data === void 0 ? void 0 : data.latest) {
                    rows = await baseQB
                        .orderBy('message.send_at', 'DESC')
                        .addOrderBy('message.id', 'DESC')
                        .take(1)
                        .getMany();
                    rows = rows.reverse();
                }
                else if (anchorBefore) {
                    const r = await baseQB
                        .andWhere(`(message.send_at < :anchorTime) OR (message.send_at = :anchorTime AND message.id < :anchorId)`, { anchorTime: anchorBefore.send_at, anchorId: anchorBefore.id })
                        .orderBy('message.send_at', 'DESC')
                        .addOrderBy('message.id', 'DESC')
                        .take(pageSize + 1)
                        .getMany();
                    hasMoreOlder = r.length > pageSize;
                    rows = r.slice(0, pageSize).reverse();
                }
                else if (anchorAfter) {
                    const rAsc = await baseQB
                        .andWhere(`(message.send_at > :anchorTime) OR (message.send_at = :anchorTime AND message.id > :anchorId)`, { anchorTime: anchorAfter.send_at, anchorId: anchorAfter.id })
                        .orderBy('message.send_at', 'ASC')
                        .addOrderBy('message.id', 'ASC')
                        .take(pageSize + 1)
                        .getMany();
                    hasMoreNewer = rAsc.length > pageSize;
                    rows = rAsc.slice(0, pageSize);
                }
                else {
                    const r = await baseQB
                        .orderBy('message.send_at', 'DESC')
                        .addOrderBy('message.id', 'DESC')
                        .take(pageSize + 1)
                        .getMany();
                    hasMoreOlder = r.length > pageSize;
                    rows = r.slice(0, pageSize).reverse();
                }
                const messages = rows.map((msg) => {
                    var _a, _b;
                    let senderInfo = undefined;
                    if (msg.sender) {
                        senderInfo = {
                            id: msg.sender.id,
                            username: msg.sender.username,
                            email: msg.sender.email,
                            avatar: (_b = (_a = msg.sender.avatar) !== null && _a !== void 0 ? _a : msg.sender.github_avatar) !== null && _b !== void 0 ? _b : null,
                        };
                    }
                    const attachments = (msg.attachments || []).map((att) => ({
                        id: att.id,
                        filename: att.filename,
                        fileUrl: att.fileUrl,
                        mimeType: att.mimeType,
                        fileSize: att.fileSize,
                        key: att.key,
                    }));
                    return {
                        ...msg,
                        channelId: msg.channelId || (msg.channel ? msg.channel.id : null),
                        sender: senderInfo,
                        attachments,
                    };
                });
                const oldest = messages[0];
                const newest = messages[messages.length - 1];
                const nextBefore = (_b = oldest === null || oldest === void 0 ? void 0 : oldest.id) !== null && _b !== void 0 ? _b : null;
                const nextAfter = (_c = newest === null || newest === void 0 ? void 0 : newest.id) !== null && _c !== void 0 ? _c : null;
                return {
                    id: channel.id,
                    name: channel.name,
                    type: channel.type,
                    key: channel.key,
                    json_data: channel.json_data,
                    member_count: channel.member_count,
                    messageCount,
                    isActive: channel.isActive,
                    owner: channel.owner
                        ? this.remove_field_user({ ...channel.owner })
                        : null,
                    members: (channel.users || []).map((u) => {
                        var _a, _b;
                        return this.remove_field_user({
                            ...u,
                            avatar: (_b = (_a = u.avatar) !== null && _a !== void 0 ? _a : u.github_avatar) !== null && _b !== void 0 ? _b : null,
                        });
                    }),
                    repositories: (channel.repositories || []).map((r) => ({
                        id: r.id,
                        repo_id: r.repo_id,
                    })),
                    messages: {
                        items: messages,
                        pageSize: messages.length,
                        hasMoreOlder,
                        hasMoreNewer,
                        cursors: {
                            before: nextBefore,
                            after: nextAfter,
                        },
                    },
                    created_at: channel.created_at,
                    updated_at: channel.updated_at,
                };
            }
            case 'read-all': {
                const keySearch = ((data === null || data === void 0 ? void 0 : data.keySearch) || '').toString().trim().toLowerCase();
                const limit = Math.max(1, Math.min(200, Number((_d = data === null || data === void 0 ? void 0 : data.limit) !== null && _d !== void 0 ? _d : 20)));
                const page = Math.max(1, Number((_e = data === null || data === void 0 ? void 0 : data.page) !== null && _e !== void 0 ? _e : 1));
                const order = (data === null || data === void 0 ? void 0 : data.order) === 'oldest' ? 'ASC' : 'DESC';
                const typeFilter = (data === null || data === void 0 ? void 0 : data.type) && data.type !== 'all' ? data.type : null;
                const hasMessagesFilter = data && Object.prototype.hasOwnProperty.call(data, 'hasMessages')
                    ? data.hasMessages
                    : undefined;
                const qb = this.channelRepo
                    .createQueryBuilder('channel')
                    .leftJoinAndSelect('channel.owner', 'owner')
                    .leftJoinAndSelect('channel.users', 'member');
                if (keySearch) {
                    qb.andWhere('LOWER(channel.name) LIKE :k', { k: `%${keySearch}%` });
                }
                if (typeFilter) {
                    qb.andWhere('channel.type = :type', { type: typeFilter });
                }
                qb.orderBy('channel.created_at', order);
                qb.skip((page - 1) * limit).take(limit);
                const [channels, total] = await qb.getManyAndCount();
                const items = await Promise.all(channels.map(async (ch) => {
                    var _a, _b;
                    const messageCount = await this.messageRepo.count({
                        where: { channel: { id: ch.id } },
                    });
                    if (typeof hasMessagesFilter === 'boolean' &&
                        ((hasMessagesFilter && messageCount === 0) ||
                            (!hasMessagesFilter && messageCount > 0))) {
                        return null;
                    }
                    return {
                        id: ch.id,
                        name: ch.name,
                        type: ch.type,
                        key: (_a = ch.key) !== null && _a !== void 0 ? _a : null,
                        json_data: (_b = ch.json_data) !== null && _b !== void 0 ? _b : null,
                        member_count: ch.member_count,
                        messageCount,
                        owner: ch.owner ? this.remove_field_user({ ...ch.owner }) : null,
                        members: (ch.users || []).map((u) => {
                            var _a, _b;
                            return this.remove_field_user({
                                ...u,
                                avatar: (_b = (_a = u.avatar) !== null && _a !== void 0 ? _a : u.github_avatar) !== null && _b !== void 0 ? _b : null,
                            });
                        }),
                        isActive: ch.isActive,
                        created_at: ch.created_at,
                        updated_at: ch.updated_at,
                    };
                }));
                const filteredItems = items.filter((item) => item !== null);
                const hasMore = page * limit < total;
                return {
                    items: filteredItems,
                    total: filteredItems.length,
                    page,
                    limit,
                    hasMore,
                };
            }
            case 'update': {
                if (!data.channelId) {
                    throw new microservices_1.RpcException({
                        msg: 'Thiếu channelId',
                        status: 400,
                    });
                }
                const channel = await this.channelRepo.findOne({
                    where: { id: data.channelId },
                    relations: ['users', 'owner'],
                });
                if (!channel) {
                    throw new microservices_1.RpcException({
                        msg: 'Không tìm thấy channel',
                        status: 404,
                    });
                }
                if (data.name !== undefined && data.name.trim()) {
                    channel.name = data.name.trim();
                }
                if (data.type !== undefined) {
                    if (channel.type === 'personal') {
                        throw new microservices_1.RpcException({
                            msg: 'Không thể thay đổi loại kênh personal',
                            status: 400,
                        });
                    }
                    if (data.type !== 'group' && data.type !== 'group-private') {
                        throw new microservices_1.RpcException({
                            msg: 'Loại kênh không hợp lệ',
                            status: 400,
                        });
                    }
                    channel.type = data.type;
                    if (data.type === 'group') {
                        channel.key = null;
                        channel.json_data = null;
                    }
                }
                if (channel.type === 'group-private') {
                    if (data.key !== undefined)
                        channel.key = data.key;
                    if (data.json_data !== undefined)
                        channel.json_data = data.json_data;
                }
                else if (channel.type === 'group') {
                    channel.key = null;
                    channel.json_data = null;
                }
                if (data.ownerId !== undefined) {
                    const newOwner = await this.userRepo.findOne({
                        where: { id: data.ownerId },
                    });
                    if (!newOwner) {
                        throw new microservices_1.RpcException({
                            msg: 'Owner mới không tồn tại',
                            status: 404,
                        });
                    }
                    const isOwnerMember = channel.users.some((u) => String(u.id) === String(newOwner.id));
                    if (!isOwnerMember) {
                        throw new microservices_1.RpcException({
                            msg: 'Owner mới phải là thành viên của kênh',
                            status: 400,
                        });
                    }
                    channel.owner = newOwner;
                }
                if (data.addUserIds && Array.isArray(data.addUserIds) && data.addUserIds.length > 0) {
                    if (channel.type !== 'group' && channel.type !== 'group-private') {
                        throw new microservices_1.RpcException({
                            msg: 'Chỉ có thể thêm thành viên vào kênh group hoặc group-private',
                            status: 400,
                        });
                    }
                    const usersToAdd = await this.userRepo.findBy({
                        id: (0, typeorm_2.In)(data.addUserIds),
                    });
                    if (usersToAdd.length !== data.addUserIds.length) {
                        throw new microservices_1.RpcException({
                            msg: 'Một số thành viên không tồn tại',
                            status: 400,
                        });
                    }
                    const currentMemberIds = new Set(channel.users.map((u) => String(u.id)));
                    const newMembers = usersToAdd.filter((u) => !currentMemberIds.has(String(u.id)));
                    if (newMembers.length > 0) {
                        channel.users.push(...newMembers);
                        channel.member_count = channel.users.length;
                        if (channel.type === 'group-private' && channel.json_data) {
                            try {
                                const jsonData = typeof channel.json_data === 'string'
                                    ? JSON.parse(channel.json_data)
                                    : channel.json_data;
                                if (jsonData.userRoles && Array.isArray(jsonData.userRoles)) {
                                    for (const newMember of newMembers) {
                                        const existingRole = jsonData.userRoles.find((ur) => String(ur.userId) === String(newMember.id));
                                        if (!existingRole) {
                                            jsonData.userRoles.push({
                                                userId: newMember.id,
                                                roles: [4],
                                            });
                                        }
                                    }
                                    channel.json_data = jsonData;
                                }
                            }
                            catch (error) {
                                console.error('Error updating json_data with new members:', error);
                            }
                        }
                    }
                }
                if (data.removeUserIds && Array.isArray(data.removeUserIds) && data.removeUserIds.length > 0) {
                    if (channel.type !== 'group' && channel.type !== 'group-private') {
                        throw new microservices_1.RpcException({
                            msg: 'Chỉ có thể xóa thành viên khỏi kênh group hoặc group-private',
                            status: 400,
                        });
                    }
                    const removeIdSet = new Set(data.removeUserIds.map(String));
                    channel.users = channel.users.filter((u) => !removeIdSet.has(String(u.id)));
                    channel.member_count = channel.users.length;
                    if (channel.type === 'group-private' && channel.json_data) {
                        try {
                            const jsonData = typeof channel.json_data === 'string'
                                ? JSON.parse(channel.json_data)
                                : channel.json_data;
                            if (jsonData.userRoles && Array.isArray(jsonData.userRoles)) {
                                jsonData.userRoles = jsonData.userRoles.filter((ur) => !removeIdSet.has(String(ur.userId)));
                                channel.json_data = jsonData;
                            }
                        }
                        catch (error) {
                            console.error('Error updating json_data after removing members:', error);
                        }
                    }
                    if (channel.owner) {
                        const ownerRemoved = data.removeUserIds.some((id) => String(id) === String(channel.owner.id));
                        if (ownerRemoved) {
                            if (channel.users.length > 0) {
                                channel.owner = channel.users[0];
                            }
                            else {
                                channel.owner = null;
                            }
                        }
                    }
                    if (channel.users.length < 2 && channel.type !== 'personal') {
                        throw new microservices_1.RpcException({
                            msg: 'Kênh phải có ít nhất 2 thành viên',
                            status: 400,
                        });
                    }
                }
                await this.channelRepo.save(channel);
                const updated = await this.channelRepo.findOne({
                    where: { id: data.channelId },
                    relations: ['users', 'owner'],
                });
                return {
                    id: updated.id,
                    name: updated.name,
                    type: updated.type,
                    key: updated.key,
                    json_data: updated.json_data,
                    member_count: updated.member_count,
                    owner: updated.owner
                        ? this.remove_field_user({ ...updated.owner })
                        : null,
                    members: (updated.users || []).map((u) => {
                        var _a, _b;
                        return this.remove_field_user({
                            ...u,
                            avatar: (_b = (_a = u.avatar) !== null && _a !== void 0 ? _a : u.github_avatar) !== null && _b !== void 0 ? _b : null,
                        });
                    }),
                    created_at: updated.created_at,
                    updated_at: updated.updated_at,
                };
            }
            case 'delete': {
                if (!data.id) {
                    throw new microservices_1.RpcException({
                        msg: 'Thiếu id',
                        status: 400,
                    });
                }
                const channel = await this.channelRepo.findOne({
                    where: { id: data.id },
                    relations: ['users', 'messages', 'repositories'],
                });
                if (!channel) {
                    throw new microservices_1.RpcException({
                        msg: 'Không tìm thấy channel',
                        status: 404,
                    });
                }
                const channelInfo = {
                    id: channel.id,
                    name: channel.name,
                    type: channel.type,
                    member_count: channel.member_count,
                };
                if (data.hard === true) {
                    const messageCount = await this.messageRepo.count({
                        where: { channel: { id: channel.id } },
                    });
                    await this.messageRepo.delete({ channel: { id: channel.id } });
                    await this.channelRepo.remove(channel);
                    return {
                        msg: 'Đã xóa vĩnh viễn channel và tất cả tin nhắn',
                        channelId: data.channelId,
                        channelInfo,
                        deletedMessages: messageCount,
                    };
                }
                else {
                    await this.channelRepo.remove(channel);
                    return {
                        msg: 'Đã xóa channel (giữ lại tin nhắn)',
                        channelId: data.channelId,
                        channelInfo,
                    };
                }
            }
            case 'toggle-active': {
                if (!data.id) {
                    throw new microservices_1.RpcException({
                        msg: 'Thiếu channelId',
                        status: 400,
                    });
                }
                const channel = await this.channelRepo.findOne({
                    where: { id: data.id },
                    relations: ['users', 'owner'],
                });
                if (!channel) {
                    throw new microservices_1.RpcException({
                        msg: 'Không tìm thấy channel',
                        status: 404,
                    });
                }
                channel.isActive = !channel.isActive;
                await this.channelRepo.save(channel);
                return {
                    msg: `Đã ${channel.isActive ? 'kích hoạt' : 'vô hiệu hóa'} kênh`,
                    channelId: channel.id,
                    isActive: channel.isActive,
                    name: channel.name,
                    type: channel.type,
                };
            }
            case 'stats': {
                const totalChannels = await this.channelRepo.count();
                const personalChannels = await this.channelRepo.count({
                    where: { type: 'personal' },
                });
                const groupChannels = await this.channelRepo.count({
                    where: { type: 'group' },
                });
                const privateChannels = await this.channelRepo.count({
                    where: { type: 'group-private' },
                });
                const totalMessages = await this.messageRepo.count();
                const allChannels = await this.channelRepo.find({
                    relations: ['owner', 'messages'],
                });
                const channelsWithCount = allChannels.map((ch) => {
                    var _a;
                    return ({
                        channel: ch,
                        messageCount: ((_a = ch.messages) === null || _a === void 0 ? void 0 : _a.length) || 0,
                    });
                });
                channelsWithCount.sort((a, b) => b.messageCount - a.messageCount);
                const top5 = channelsWithCount.slice(0, 5);
                return {
                    totalChannels,
                    personalChannels,
                    groupChannels,
                    privateChannels,
                    totalMessages,
                    topChannels: top5.map((item) => ({
                        id: item.channel.id,
                        name: item.channel.name,
                        type: item.channel.type,
                        member_count: item.channel.member_count,
                        messageCount: item.messageCount,
                        owner: item.channel.owner ? this.remove_field_user({ ...item.channel.owner }) : null,
                    })),
                };
            }
            case 'delete-message-channel': {
                if (!data.messageId) {
                    throw new microservices_1.RpcException({
                        msg: 'Thiếu messageId',
                        status: 400,
                    });
                }
                const message = await this.messageRepo.findOne({
                    where: { id: data.messageId },
                    relations: ['channel', 'sender', 'attachments'],
                });
                if (!message) {
                    throw new microservices_1.RpcException({
                        msg: 'Không tìm thấy tin nhắn',
                        status: 404,
                    });
                }
                if (data.channelId && String((_f = message.channel) === null || _f === void 0 ? void 0 : _f.id) !== String(data.channelId)) {
                    throw new microservices_1.RpcException({
                        msg: 'Tin nhắn không thuộc channel này',
                        status: 400,
                    });
                }
                const messageInfo = {
                    id: message.id,
                    text: message.text,
                    type: message.type,
                    channelId: ((_g = message.channel) === null || _g === void 0 ? void 0 : _g.id) || null,
                    channelName: ((_h = message.channel) === null || _h === void 0 ? void 0 : _h.name) || null,
                    senderId: ((_j = message.sender) === null || _j === void 0 ? void 0 : _j.id) || null,
                    senderUsername: ((_k = message.sender) === null || _k === void 0 ? void 0 : _k.username) || null,
                    send_at: message.send_at,
                    attachmentCount: ((_l = message.attachments) === null || _l === void 0 ? void 0 : _l.length) || 0,
                };
                await this.messageRepo.remove(message);
                return {
                    msg: 'Đã xóa tin nhắn thành công',
                    messageInfo,
                };
            }
            default:
                throw new microservices_1.RpcException({
                    msg: 'Method không hợp lệ',
                    status: 400,
                });
        }
    }
};
exports.ChatService = ChatService;
exports.ChatService = ChatService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(entities_1.Message)),
    __param(1, (0, typeorm_1.InjectRepository)(entities_2.Channel)),
    __param(2, (0, typeorm_1.InjectRepository)(entities_1.User)),
    __param(3, (0, typeorm_1.InjectRepository)(entities_1.Attachment)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], ChatService);
//# sourceMappingURL=chat.service.js.map