"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageSeeder = void 0;
const entities_1 = require("../../../entities/src");
class MessageSeeder {
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async run() {
        const messageRepo = this.dataSource.getRepository(entities_1.Message);
        const channelRepo = this.dataSource.getRepository(entities_1.Channel);
        const userRepo = this.dataSource.getRepository(entities_1.User);
        const channels = await channelRepo.find({ relations: ['users'] });
        if (!channels.length) {
            console.log('⚠️ No channels found to seed messages.');
            return;
        }
        for (const channel of channels) {
            if (!channel.users || channel.users.length === 0)
                continue;
            const messages = [];
            const totalMessages = 10000;
            const now = Date.now();
            let baseTime = now - totalMessages * 1000;
            for (let i = 1; i <= totalMessages; i++) {
                const sender = channel.users[Math.floor(Math.random() * channel.users.length)];
                let sendAt = baseTime + i * 1000;
                if (sendAt > now)
                    sendAt = now;
                const message = messageRepo.create({
                    text: `Tin nhắn ${i} trong kênh ${channel.name}`,
                    channel,
                    sender,
                    send_at: new Date(sendAt),
                });
                messages.push(message);
            }
            await messageRepo.save(messages);
            console.log(`✅ Seeded ${totalMessages} messages for channel: ${channel.name}`);
        }
        console.log('✅ Message seeding done!');
    }
}
exports.MessageSeeder = MessageSeeder;
//# sourceMappingURL=message.seed.js.map