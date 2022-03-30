import * as core from "@actions/core";
import * as github from "@actions/github";
import {
  FetchLabelsResponse,
  fetchLabelsOfPrAndReferencedIssues,
} from "./queries";
import { getMissingLabels } from "./utils";

async function run(): Promise<void> {
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
      closingIssueReferences = await githubClient.graphql<FetchLabelsResponse>(
        fetchLabelsOfPrAndReferencedIssues,
        {
          prUrl: PrUrl,
        },
      );
    } catch (e) {
      if (e instanceof Error) {
        githubClient.log.error("Error when fetching labels", {
          message: e.message,
        });
      }
    }

    if (!closingIssueReferences) {
      return;
    }

    const labels = getMissingLabels(
      closingIssueReferences.resource.labels,
      closingIssueReferences.resource.closingIssuesReferences,
    );

    if (labels.length) {
      try {
        await githubClient.rest.issues.addLabels({
          issue_number: prNumber,
          repo: repoName,
          owner: repoOwner,
          labels,
        });
      } catch (e) {
        if (e instanceof Error) {
          githubClient.log.error("Error in adding labels", {
            message: e.message,
          });
        }
      }
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

run();
