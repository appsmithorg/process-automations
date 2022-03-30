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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const queries_1 = require("./queries");
const utils_1 = require("./utils");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (!github.context.payload.pull_request) {
                return;
            }
            const PrUrl = github.context.payload.pull_request.html_url;
            if (!PrUrl) {
                return;
            }
            const prNumber = github.context.payload.pull_request.number;
            const repoOwner = github.context.repo.owner;
            const repoName = github.context.repo.repo;
            const githubToken = core.getInput("accessToken");
            const githubClient = github.getOctokit(githubToken);
            let closingIssueReferences;
            try {
                closingIssueReferences = yield githubClient.graphql(queries_1.fetchLabelsOfPrAndReferencedIssues, {
                    prUrl: PrUrl,
                });
            }
            catch (e) {
                if (e instanceof Error) {
                    githubClient.log.error("Error when fetching labels", {
                        message: e.message,
                    });
                }
            }
            if (!closingIssueReferences) {
                return;
            }
            const labels = (0, utils_1.getMissingLabels)(closingIssueReferences.resource.labels, closingIssueReferences.resource.closingIssuesReferences);
            if (labels.length) {
                try {
                    yield githubClient.rest.issues.addLabels({
                        issue_number: prNumber,
                        repo: repoName,
                        owner: repoOwner,
                        labels,
                    });
                }
                catch (e) {
                    if (e instanceof Error) {
                        githubClient.log.error("Error in adding labels", {
                            message: e.message,
                        });
                    }
                }
            }
        }
        catch (error) {
            if (error instanceof Error)
                core.setFailed(error.message);
        }
    });
}
run();
