"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEnv = getEnv;
exports.getEnvNumber = getEnvNumber;
exports.getKafkaBrokers = getKafkaBrokers;
function getEnv(name, fallback) {
    var _a, _b;
    return (_b = (_a = process.env[name]) !== null && _a !== void 0 ? _a : fallback) !== null && _b !== void 0 ? _b : '';
}
function getEnvNumber(name, fallback) {
    const raw = process.env[name];
    const value = raw ? Number(raw) : fallback;
    return Number.isFinite(value) ? value : fallback;
}
function getKafkaBrokers() {
    const raw = process.env.KAFKA_BROKERS || process.env.KAFKA_BROKER || 'localhost:29092';
    return raw
        .split(',')
        .map((broker) => broker.trim())
        .filter(Boolean);
}
//# sourceMappingURL=runtime-config.js.map