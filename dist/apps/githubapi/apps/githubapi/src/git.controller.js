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
exports.GitController = void 0;
const common_1 = require("@nestjs/common");
const microservices_1 = require("@nestjs/microservices");
const git_service_1 = require("./git.service");
let GitController = class GitController {
    constructor(GitService) {
        this.GitService = GitService;
    }
    async handleGitMessage(payload) {
        var _a;
        switch (payload.cmd) {
            case 'github_oauth_callback':
                return await this.GitService.githubOAuthCallback(payload.data.req, payload.data.code, payload.data.state, payload.data.frontendUrl);
            case 'google_oauth_callback':
                return await this.GitService.googleOAuthCallback(payload.data.code, payload.data.state);
            case 'github_app_setup':
                return await this.GitService.githubAppSetup(payload.data.userId, payload.data.installationId, payload.data.userToken);
            case 'get_install_app_url':
                return this.GitService.getInstallAppUrl(payload.data.state);
            case 'get_repo_installation':
                return this.GitService.listInstallationRepos(payload.data.userId, payload.data);
            case 'get_repo_data_by_url':
                return this.GitService.loadFromRepoLink(payload.data.userId, payload.data.url || '', payload.data);
            case 'get_repo_by_ids':
                return this.GitService.getMultipleReposInfo(payload.data.items);
            case 'unlink_github_app':
                return this.GitService.unlinkGitHubApp(payload.data.userId);
            case 'getCommitDetails':
                return await this.GitService.getCommitDetails(payload.data.userId, payload.data.owner, payload.data.repo, payload.data.sha);
            case 'compareCommits':
                return await this.GitService.compareCommits(payload.data.userId, payload.data.owner, payload.data.repo, payload.data.base, payload.data.head);
            case 'getCommitDiff':
                return await this.GitService.getCommitDiff(payload.data.userId, payload.data.owner, payload.data.repo, payload.data.sha);
            case 'getCommitAnalysis':
                return await this.GitService.getCommitAnalysisFromGemini(payload.data.userId, payload.data.owner, payload.data.repo, payload.data.sha, (_a = payload.data.prompt) !== null && _a !== void 0 ? _a : '');
            default:
                return { error: 'Unknown command' };
        }
    }
};
exports.GitController = GitController;
__decorate([
    (0, microservices_1.MessagePattern)('svc.git.exec'),
    __param(0, (0, microservices_1.Payload)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GitController.prototype, "handleGitMessage", null);
exports.GitController = GitController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [git_service_1.GitService])
], GitController);
//# sourceMappingURL=git.controller.js.map