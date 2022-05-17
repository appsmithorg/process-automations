import * as core from "@actions/core";
import * as github from "@actions/github";

async function run(): Promise<void> {
  const { context } = github;
  if (!context.payload.pull_request) {
    throw new Error("Not run on a pull request context");
  }
  // Getting all the inputs to the action
  const githubToken = core.getInput("accessToken");
  const jobName = core.getInput("jobName");
  const checkTitle = core.getInput("checkTitle");
  const conclusion = core.getInput("conclusion");
  const repository = core.getInput("repository");
  const run_id = core.getInput("run_id");

  const githubClient = github.getOctokit(githubToken);
  const prNumber = context.payload.pull_request.number;
  const repoOwner = context.repo.owner;
  const repoName = context.repo.repo;

  // Get the current pull request
  const { data: pull } = await githubClient.rest.pulls.get({
    ...context.repo,
    pull_number: prNumber,
  });
  const ref = pull.head.sha;

  // use the pull request ref to get all the checks for the PR
  const { data: checks } = await githubClient.rest.checks.listForRef({
    ...context.repo,
    ref,
  });
  console.log({ checks: JSON.stringify(checks, null, 2) });

  // Find the check we are interested in updating
  const check = checks.check_runs.filter((c) => c.name === jobName);

  if (check.length == 0) {
    // If we can not find this check in the pull request we will create this check on the PR
    const head_sha = pull.head.sha;
    const { data: completed_at } = await githubClient.rest.checks.create({
      owner: repoOwner,
      repo: repoName,
      head_sha: head_sha,
      name: jobName,
      status: "completed",
      conclusion: conclusion,
      output: {
        title: checkTitle,
        summary: `https://github.com/${repository}/actions/runs/${run_id}`,
      },
    });
    console.log({ completed_at: JSON.stringify(completed_at, null, 2) });
  } else {
    const { data: result } = await githubClient.rest.checks.update({
      ...context.repo,
      check_run_id: check[0].id,
      status: "completed",
      conclusion: conclusion,
      output: {
        title: checkTitle,
        summary: `https://github.com/${repository}/actions/runs/${run_id}`,
      },
    });
    console.log({ result: JSON.stringify(result, null, 2) });
  }
}

try {
  run();
} catch (error) {
  if (error instanceof Error) core.setFailed(error.message);
}
