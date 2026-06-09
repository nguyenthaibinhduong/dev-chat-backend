"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_module_1 = require("../database.module");
const channel_seed_1 = require("./channel.seed");
const message_seed_1 = require("./message.seed");
const user_seeder_1 = require("./user.seeder");
async function bootstrap() {
    try {
        await database_module_1.dataSource.initialize();
        console.log('📦 Database connected');
        const seederUser = new user_seeder_1.UserSeeder(database_module_1.dataSource);
        await seederUser.run();
        const seederChannel = new channel_seed_1.ChannelSeeder(database_module_1.dataSource);
        await seederChannel.run();
        const seederMessage = new message_seed_1.MessageSeeder(database_module_1.dataSource);
        await seederMessage.run();
        await database_module_1.dataSource.destroy();
        process.exit(0);
    }
    catch (err) {
        console.error('❌ Seed failed', err);
        process.exit(1);
    }
}
bootstrap();
//# sourceMappingURL=seed.js.map