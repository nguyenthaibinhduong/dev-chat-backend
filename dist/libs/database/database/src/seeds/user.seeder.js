"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserSeeder = void 0;
const entities_1 = require("../../../entities/src");
const bcrypt = __importStar(require("bcrypt"));
class UserSeeder {
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async run() {
        const { fakerVI: faker } = await import('@faker-js/faker');
        const repo = this.dataSource.getRepository(entities_1.User);
        const exist = await repo.findOne({ where: { email: 'admin@example.com' } });
        if (exist)
            return;
        const defaultPassword = await bcrypt.hash('123', 10);
        const admin = repo.create({
            username: 'admin',
            email: 'admin@example.com',
            password: defaultPassword,
            role: 'admin',
            email_verified: true,
        });
        const users = Array.from({ length: 10 }).map((_, i) => repo.create({
            username: faker.person.fullName(),
            email: `user${i + 1}@example.com`,
            password: defaultPassword,
            role: 'user',
            email_verified: true,
        }));
        await repo.save([admin, ...users]);
        console.log('✅ User seeding done! (1 admin + 5 users)');
    }
}
exports.UserSeeder = UserSeeder;
//# sourceMappingURL=user.seeder.js.map