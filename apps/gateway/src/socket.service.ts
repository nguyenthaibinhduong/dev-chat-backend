// socket.service.ts
import { Injectable, Inject } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import Redis from 'ioredis';
import { GatewayService } from './gateway.service';
import { Message } from '@myorg/entities';
import { json } from 'stream/consumers';
import { channel } from 'diagnostics_channel';

export type AuthSocket = Socket & { user?: { id: string } };

interface UserStatus {
  online: boolean;
  socketId?: string;
  lastSeen?: number;
}

interface UserStatusCheckResult {
  userId: string;
  plainUserId: string;
  status: UserStatus | null;
  isOnline: boolean;
  socketId: string | null;
}

@Injectable()
export class ChatSocketService {
  private server: Server;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly gw: GatewayService,
  ) {}

  setServer(server: Server) {
    this.server = server;
  }

  /* ===================== USER STATUS HELPERS ===================== */
  
  /**
   * Helper chung để check user status từ Redis và log chi tiết
   * @param userId - User ID (có thể encrypted hoặc plain)
   * @param context - Context để log (VD: "THÔNG BÁO TIN NHẮN", "CẬP NHẬT KÊNH")
   * @returns UserStatusCheckResult với thông tin chi tiết
   */
  private async checkUserStatus(userId: string, context: string = 'GENERAL'): Promise<UserStatusCheckResult> {
    // Decrypt userId nếu cần
    const plainUserId = userId?.startsWith('ENC:') ? this.gw.decryptId(userId) : userId;
    
    console.log(`🔍 [${context}] Kiểm tra trạng thái user:`, {
      userIdGoc: userId,
      userIdGiaiMa: plainUserId,
      daGiaiMa: userId?.startsWith('ENC:')
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

    const status: UserStatus = JSON.parse(statusStr);
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

  /**
   * Emit socket event đến user với logging chi tiết
   * @param userId - User ID (có thể encrypted hoặc plain)
   * @param event - Socket event name
   * @param payload - Data payload
   * @param context - Context để log
   * @returns true nếu gửi thành công, false nếu user offline
   */
  private async emitToUserWithLog(
    userId: string, 
    event: string, 
    payload: any, 
    context: string = 'SOCKET'
  ): Promise<boolean> {
    const userCheck = await this.checkUserStatus(userId, context);

    if (!userCheck.isOnline) {
      console.log(`❌ [${context}] Không thể gửi '${event}' đến user ${userCheck.plainUserId}: User offline`);
      return false;
    }

    if (!this.server) {
      console.log(`❌ [${context}] Không thể gửi '${event}' đến user ${userCheck.plainUserId}: Server không khả dụng`);
      return false;
    }

    this.server.to(userCheck.socketId!).emit(event, payload);
    console.log(`✅ [${context}] Đã gửi '${event}' đến user ${userCheck.plainUserId}:`, {
      socketId: userCheck.socketId,
      eventName: event,
      payloadKeys: Object.keys(payload || {})
    });

    return true;
  }

  /**
   * Gửi notification đến nhiều users với logging chi tiết
   * @param notifications - Danh sách notifications
   * @param context - Context để log
   */
  private async sendNotificationsToUsers(
    notifications: any[], 
    context: string = 'NOTIFICATION'
  ): Promise<void> {
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

        const sent = await this.emitToUserWithLog(
          notify.userId,
          'receiveNotification',
          {
            ...notify,
            fakeID: Date.now(),
          },
          context
        );

        if (sent) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (err: any) {
        console.error(`❌ [${context}] Lỗi khi gửi notification đến user ${notify.userId}:`, err?.message || err);
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

  /* ===================== UNREAD HELPERS ===================== */
  private unreadKey = (userId: string) => `unread:${userId}`;
  private subKey = (socketId: string) => `unread_subscribe:${socketId}`;

  /** Lấy toàn bộ unread cho user (unify) */
  async getUnreadMap(userId: string): Promise<Record<string, number>> {
    const data = await this.redis.hgetall(this.unreadKey(userId));
    const result: Record<string, number> = {};
    for (const [channelId, count] of Object.entries(data)) {
      result[channelId] = parseInt(count, 10) || 0;
    }
    return result;
  }

  /** Đăng ký danh sách kênh muốn nhận thông báo unread cho socketId */
  async registerUnreadChannels(socketId: string, channelIds: string[]) {
    await this.redis.set(
      this.subKey(socketId),
      JSON.stringify(channelIds || []),
    );
  }

  /** Lấy danh sách kênh đã đăng ký nhận thông báo unread cho socketId */
  async getRegisteredUnreadChannels(socketId: string): Promise<string[]> {
    const data = await this.redis.get(this.subKey(socketId));
    return data ? JSON.parse(data) : [];
  }

  /* ===================== PRESENCE ===================== */
  async markUserOnline(userId: string, socketId: string) {
    await this.redis.hset(
      'user_status',
      userId,
      JSON.stringify({ online: true, lastSeen: Date.now(), socketId }),
    );

    // Emit presence (giữ nguyên log/format bạn đang dùng)
    const all = await this.redis.hgetall('user_status');
    const onlineUsers: string[] = [];
    for (const [uid, data] of Object.entries(all)) {
      try {
        const status = JSON.parse(data);
        if (status.online) onlineUsers.push(uid);
      } catch (err) {
        console.error('❌ Parse user_status lỗi', uid, err);
      }
    }
    this.server.emit('presenceUpdate', { online: onlineUsers, offline: [] });
  }

  async markUserOffline(userId: string) {
    const lastSeen = Date.now();
    await this.redis.hset(
      'user_status',
      userId,
      JSON.stringify({ online: false, lastSeen }),
    );

    const all = await this.redis.hgetall('user_status');
    const onlineUsers: string[] = [];
    for (const [uid, data] of Object.entries(all)) {
      try {
        const status = JSON.parse(data);
        if (status.online) onlineUsers.push(uid);
      } catch (err) {
        console.error('❌ Parse user_status lỗi', uid, err);
      }
    }
    this.server.emit('presenceUpdate', {
      online: onlineUsers,
      offline: [{ userId, lastSeen }],
    });
  }

  async getUserStatus(userId: string) {
    const data = await this.redis.hget('user_status', userId);
    return data ? JSON.parse(data) : { online: false, lastSeen: null };
  }

  /* ===================== ROOM OPS ===================== */
  async joinChannel(client: AuthSocket, channelId: string) {
    client.join(channelId);
    await this.resetUnread(client, channelId);
    client.emit('joinedRoom', { channelId });
    console.log(`✅ User ${client.user?.id} joined channel ${channelId}`);
  }

  leaveChannel(client: AuthSocket, channelId: string) {
    client.leave(channelId);
    console.log(`🚪 User ${client.user?.id} left channel ${channelId}`);
  }

  async switchChannel(
    client: AuthSocket,
    oldChannelId: string,
    newChannelId: string,
  ) {
    this.leaveChannel(client, oldChannelId);
    await this.joinChannel(client, newChannelId);
  }

  /* ===================== CHANNEL & MESSAGE ===================== */
  async createChannel(data: {
    userIds: string[];
    name: string;
    user: any;
    type?: string;
  }) {
    const tempId = Date.now();
    const now = new Date().toISOString();
    const channel: any = {
      id: tempId,
      fakeID: tempId,
      name: data?.name,
      type: data?.type,
      member_count: (data?.userIds?.length ?? 0) + 1,
      members: [],
      isActive: true,
      created_at: now,
      updated_at: now,
    };

    console.log(`📢 [TẠO KÊNH] Chuẩn bị gửi pending channel đến ${data.userIds.length} users`);

    if (data?.type !== 'personal') {
      let sentCount = 0;
      for (const uid of data.userIds) {
        const sent = await this.emitToUserWithLog(uid, 'receiveChannel', channel, 'TẠO KÊNH - PENDING');
        if (sent) sentCount++;
      }
      console.log(`📊 [TẠO KÊNH] Đã gửi pending channel đến ${sentCount}/${data.userIds.length} users online`);
    }

    try {
      const savedChannel: any = await this.gw.exec('chat', 'createChannel', data);
      
      if (savedChannel?.data) {
        const msg: any = { ...savedChannel.data, fakeID: channel.fakeID };
        console.log(`📢 [TẠO KÊNH] Chuẩn bị gửi saved channel đến ${data.userIds.length} users`);
        
        let sentCount = 0;
        for (const uid of data.userIds) {
          const sent = await this.emitToUserWithLog(uid, 'receiveChannel', msg, 'TẠO KÊNH - SAVED');
          if (sent) sentCount++;
        }
        console.log(`📊 [TẠO KÊNH] Đã gửi saved channel đến ${sentCount}/${data.userIds.length} users online`);
      }
    } catch (err) {
      console.error(`❌ [TẠO KÊNH] Lỗi:`, err);
    }
  }

  async updateChannel(data: {
    currenetUserIds: string[];
    addUserIds: string[];
    removeUserIds: string[];
    channelId: string;
    user: any;
    q?: any;
  }) {
    console.log(`🔄 [CẬP NHẬT KÊNH] Bắt đầu cập nhật kênh ${data.channelId}`, {
      thanhVienHienTai: data.currenetUserIds.length,
      thanhVienThem: data.addUserIds.length,
      thanhVienXoa: data.removeUserIds.length,
    });

    try {
      // 1. Lấy thông tin channel mới nhất
      const channelResponse: any = await this.gw.exec('chat', 'listChannelsMessages', {
        user: data.user,
        channel_id: data.channelId,
        ...data.q,
        noAuth: true,
      });

      if (!channelResponse?.data) {
        console.error(`❌ [CẬP NHẬT KÊNH] Không tìm thấy dữ liệu kênh ${data.channelId}`);
        return;
      }

      const channelInfo = channelResponse.data;
      const datachannel = channelInfo?.channel || {};
      const channelName = datachannel?.name || 'kênh';

      console.log(`✅ [CẬP NHẬT KÊNH] Đã lấy thông tin kênh: ${channelName}`);

      // 2. Xử lý current members (update)
      if (data.currenetUserIds.length > 0) {
        console.log(`📤 [CẬP NHẬT KÊNH] Đang cập nhật cho ${data.currenetUserIds.length} thành viên hiện tại`);
        
        let sentCount = 0;
        for (const uid of data.currenetUserIds) {
          const sent = await this.emitToUserWithLog(uid, 'receiveUpdateChannel', channelInfo, 'CẬP NHẬT KÊNH');
          if (sent) sentCount++;
        }
        
        console.log(`📊 [CẬP NHẬT KÊNH] Đã gửi cập nhật đến ${sentCount}/${data.currenetUserIds.length} thành viên online`);
        
        // Gửi system notifications
        const result = await this.gw.exec('notification', 'send_notification', {
          data: {
            memberIds: data.currenetUserIds,
            text: `Kênh "${channelName}" có cập nhật mới`,
            type: 'system',
            additionalData: { channelId: data.channelId, channelName, action: 'cập nhật' },
          },
          type: 'system',
        });

        if (result?.data?.notifications) {
          await this.sendNotificationsToUsers(result.data.notifications, 'CẬP NHẬT KÊNH');
        }
      }

      // 3. Xử lý add members
      if (data.addUserIds.length > 0) {
        console.log(`➕ [CẬP NHẬT KÊNH] Đang thêm ${data.addUserIds.length} thành viên mới`);

        const newChannelPayload: any = {
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
          if (sent) sentCount++;
        }

        console.log(`📊 [CẬP NHẬT KÊNH] Đã gửi thông tin kênh đến ${sentCount}/${data.addUserIds.length} thành viên mới`);
      }

      // 4. Xử lý remove members
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
          if (sent) sentCount++;
        }

        console.log(`📊 [CẬP NHẬT KÊNH] Đã gửi thông báo xóa đến ${sentCount}/${data.removeUserIds.length} thành viên`);
      }

      console.log(`✅ [CẬP NHẬT KÊNH] Cập nhật kênh ${data.channelId} thành công`);
    } catch (err: any) {
      console.error(`❌ [CẬP NHẬT KÊNH] Lỗi khi cập nhật kênh ${data.channelId}:`, err?.message || err);
    }
  }

  async sendMessageToChannel(message: {
    channelId: string;
    text: string;
    user: any;
    type?: string;
    channelData?: any;
    json_data?: any;
    like_data?: any;
    replyTo?: any;
    isUpdate?: boolean;
    isPin?: boolean;
    fakeID?: string | number;
    id?: string | number;
  }) {
    const tempId = message.fakeID ?? Date.now();
    const now = new Date().toISOString();
    const typeMsg = message.type ?? 'message';
    
    // Emit pending vào room
    const pendingMsg: any = {
      id: message.isUpdate ? message.id : tempId,
      channelId: message.channelId,
      fakeID: tempId,
      text: message.text,
      type: typeMsg,
      created_at: now,
      updated_at: null,
      isPin: message.isPin ?? false,
      json_data: message.json_data ? { ...message.json_data } : null,
      replyTo: message.replyTo ? { ...message.replyTo } : null,
      like_data: message.like_data ? { ...message.like_data } : null,
      sender: {
        id: message.user.id,
        username: message.user.username,
        email: message.user.email,
      },
      isMine: true,
      isUpdate: message.isUpdate ?? false,
      status: 'pending',
    };

    if (this.server) {
      this.server.to(message.channelId).emit('receiveMessage', pendingMsg);
      console.log(`📤 [GỬI TIN NHẮN] Đã emit pending message vào room ${message.channelId}`);
    } else {
      console.error(`❌ [GỬI TIN NHẮN] Server không khả dụng`);
    }

    // Nếu channel chưa active → bật active & gửi cập nhật
    if (message.channelData && message.channelData.isChannelActive === false) {
      const activeChannel = { ...message.channelData, isChannelActive: true };
      console.log(`🔔 [GỬI TIN NHẮN] Channel chưa active, chuẩn bị kích hoạt và gửi đến ${message.channelData.members?.length || 0} thành viên`);
      
      let sentCount = 0;
      for (const member of message.channelData.members || []) {
        const sent = await this.emitToUserWithLog(member.id, 'receiveChannel', activeChannel, 'KÍCH HOẠT KÊNH');
        if (sent) sentCount++;
      }
      
      console.log(`📊 [GỬI TIN NHẮN] Đã gửi active channel đến ${sentCount}/${message.channelData.members?.length || 0} thành viên`);
    }

    try {
      // Gửi message qua chat service
      const res: any = await this.gw.exec('chat', 'sendMessage', {
        ...message,
        send_at: now,
      });
      
      const { channel, ...datas } = res?.data;

      const finalMessage = {
        ...datas,
        channelId: message.channelId,
        type: datas.type || typeMsg,
        fakeID: tempId,
        isPin: pendingMsg.isPin ?? false,
        isUpdate: message.isUpdate ?? false,
        id: message.isUpdate ? message.id : datas.id,
        status: message.isUpdate ? (typeMsg === 'remove' ? 'remove' : 'updated') : 'sent',
      };
      
      // Emit final message
      this.server.to(message.channelId).emit('receiveMessage', finalMessage);
      console.log(`✅ [GỬI TIN NHẮN] Đã emit final message vào room ${message.channelId}`);
      
      // Gửi notifications
      if (res?.data) {
        const notifResult = await this.gw.exec('notification', 'send_notification', {
          data: res.data,
          type: 'message',
        });

        if (notifResult?.data?.notifications) {
          await this.sendNotificationsToUsers(notifResult.data.notifications, 'THÔNG BÁO TIN NHẮN');
        } else {
          console.log(`⚠️ [THÔNG BÁO TIN NHẮN] Không có notification nào được tạo`);
        }
      }
      
      await this.incrementUnread(String(message.channelId), String(message.user.id));
      
    } catch (err: any) {
      console.error(`❌ [GỬI TIN NHẮN] Lỗi:`, {
        channel: message.channelId,
        error: err?.message,
        type: message.type
      });
      
      if (this.server) {
        const errorMessage = {
          ...pendingMsg,
          status: 'error',
          msg: err?.message || 'Gửi tin nhắn thất bại',
        };
        this.server.to(message.channelId).emit('receiveMessage', errorMessage);
      }
    }
  }

  /* ===================== UNREAD CORE ===================== */
  private async incrementUnread(channelId: string, senderId: string) {
    const sockets: any[] = await this.server.fetchSockets();
    for (const socket of sockets) {
      const socketId = socket.id;
      const userId = socket.user?.id || socket.data?.user?.id;
      if (!userId || String(userId) === String(senderId)) continue;

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

  private async resetUnread(client: AuthSocket, channelId: string) {
    const userId = client.user?.id || client.data?.user?.id;
    if (!userId) return;
    const key = this.unreadKey(String(userId));
    await this.redis.hset(key, String(channelId), 0);
    client.emit('unreadCount', { channelId: String(channelId), count: 0 });
  }

  async broadcastWebhook(data: any) {
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

      if (result?.data?.notifications) {
        await this.sendNotificationsToUsers(result.data.notifications, 'WEBHOOK GITHUB');
      } else {
        console.log(`⚠️ [WEBHOOK GITHUB] Không có notification nào được tạo`);
      }
      
    } catch (error: any) {
      console.error(`❌ [WEBHOOK GITHUB] Lỗi:`, error?.message || error);
    }
  }
}
