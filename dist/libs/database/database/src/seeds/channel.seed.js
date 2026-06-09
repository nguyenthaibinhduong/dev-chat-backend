"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChannelSeeder = void 0;
const entities_1 = require("../../../entities/src");
class ChannelSeeder {
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async run() {
        const channelRepo = this.dataSource.getRepository(entities_1.Channel);
        const userRepo = this.dataSource.getRepository(entities_1.User);
        const users = await userRepo.find();
        if (users.length < 2) {
            console.log('⚠️ Not enough users to seed channels.');
            return;
        }
        const channels = [];
        for (let i = 1; i <= 5; i++) {
            const memberCount = Math.floor(Math.random() * 4) + 3;
            const shuffled = users.sort(() => 0.5 - Math.random());
            const members = shuffled.slice(0, memberCount);
            const channel = channelRepo.create({
                name: `Group Chat ${i}`,
                type: 'group',
                users: members,
                member_count: members.length,
                owner: members[0],
            });
            channels.push(channel);
        }
        for (let i = 1; i <= 5; i++) {
            const shuffled = users.sort(() => 0.5 - Math.random());
            const members = shuffled.slice(0, 2);
            const channel = channelRepo.create({
                name: `Personal Chat ${i}`,
                type: 'personal',
                users: members,
                member_count: members.length,
            });
            channels.push(channel);
        }
        await channelRepo.save(channels);
        console.log(`✅ Channel seeding done! (${channels.length} channels)`);
    }
}
exports.ChannelSeeder = ChannelSeeder;
//# sourceMappingURL=channel.seed.js.map