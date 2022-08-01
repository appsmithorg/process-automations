const fetch = require("node-fetch");
const path = require("path");
const fs = require("fs");
const template = require("es6-template-strings");
const moment = require("moment");
const compile = require("es6-template-strings/compile"),
  resolveToString = require("es6-template-strings/resolve-to-string");

let currentDate;

let priorityMap = {
  Critical: `🔴 Crit-`,
  High: `🟠 High`,
  medium: `🔵 Med`,
  Low: `🟢 Low`,
};

let priorityKeys = Object.keys(priorityMap);

let issueTypeMap = {
  Bug: "🐞",
  Enhancement: "💡",
  Task: "🔨",
  Chore: "🔨",
};

let issueTypeKeys = Object.keys(issueTypeMap);

const ADHOC = "Ad-hoc tasks";

getZenhubInfo = async () => {
  let fileName = path.resolve(__dirname, "zenhubInfo.graphql");
  const fileData = fs.readFileSync(fileName, "utf8");
  const query = template(fileData, { podName: process.env.POD });
  let body = {
    query: query,
    operationName: null,
  };
  const response = await fetch("https://api.zenhub.com/public/graphql", {
    headers: {
      authorization: "Bearer " + process.env.ZENHUB_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    method: "POST",
  });
  const data = await response.json();
  return data;
};

getZenhubInfoStatic = async () => {
  let fileName = path.resolve(__dirname, "testResponse.json");
  const fileData = JSON.parse(fs.readFileSync(fileName, "utf8"));
  return fileData;
};

getPlannedTasks = async (sprint) => {
  if (sprint.issues.nodes.length === 0) {
    return {};
  }

  let issues = sprint.issues.nodes;
  let categories = new Map();

  let uncategorized = {
    title: ADHOC,
  };

  categories.set(ADHOC, uncategorized);

  let categorizedIssues = new Map();
  for (const issue of issues) {
    let existingIssues = [];
    if (!!issue.closedAt) {
      continue;
    }
    if (issue.parentEpics.nodes.length === 0) {
      if (categorizedIssues.has(ADHOC)) {
        existingIssues = categorizedIssues.get(ADHOC);
      }

      existingIssues.push(issue);
      categorizedIssues.set(ADHOC, existingIssues);
    } else {
      let epic = issue.parentEpics.nodes[0].issue;
      if (categorizedIssues.has(epic.title)) {
        existingIssues = categorizedIssues.get(epic.title);
      } else {
        categories.set(epic.title, epic);
      }

      existingIssues.push(issue);
      categorizedIssues.set(epic.title, existingIssues);
    }
  }

  return categorizedIssues;
};

getClosedTasks = async (sprint, enclosedIn) => {
  if (sprint.issues.nodes.length === 0) {
    return {};
  }

  let issues = sprint.issues.nodes;

  issues = issues.filter((issue) => {
    let isClosed = !!issue.closedAt;
    let closedAtMs = moment(issue.closedAt).valueOf();
    let isClosedThisWeek =
      closedAtMs > enclosedIn.isoWeekday(1).valueOf() &&
      closedAtMs < enclosedIn.isoWeekday(7).valueOf();

    console.log(
      closedAtMs +
        " " +
        enclosedIn.isoWeekday(1) +
        " " +
        enclosedIn.isoWeekday(7) +
        " " +
        isClosedThisWeek
    );
    return isClosed && isClosedThisWeek;
  });

  console.log(issues);

  let categories = new Map();

  let uncategorized = {
    title: ADHOC,
  };

  categories.set(ADHOC, uncategorized);

  let closedIssues = new Map();
  for (const issue of issues) {
    let existingIssues = [];

    if (issue.parentEpics.nodes.length === 0) {
      if (closedIssues.has(ADHOC)) {
        existingIssues = closedIssues.get(ADHOC);
      }

      existingIssues.push(issue);
      closedIssues.set(ADHOC, existingIssues);
    } else {
      let epic = issue.parentEpics.nodes[0].issue;
      if (closedIssues.has(epic.title)) {
        existingIssues = closedIssues.get(epic.title);
      } else {
        categories.set(epic.title, epic);
      }

      existingIssues.push(issue);
      closedIssues.set(epic.title, existingIssues);
    }
  }

  return closedIssues;
};

getFormattedTasks = (categorizedIssues, isClosed) => {
  let issueRow =
    "- ${issueType} [ ${priority} ] [${issueNo}](https://github.com/appsmithorg/appsmith/issues/${issueNo}): ${title} ${status} | **${assignees}**";
  let compiledRow = compile(issueRow);

  let sections = [];
  for (const category of categorizedIssues.keys()) {
    let section = `
#### ${category}
`;

    let categoryIssues = categorizedIssues.get(category);
    categoryIssues.forEach((issue) => {
      let priority = priorityKeys.filter((label) =>
        issue.labels.nodes.some((labelNode) => labelNode.name == label)
      );
      issue["priority"] = priority[0];
    });
    categoryIssues = categoryIssues.sort((firstIssue, secondIssue) => {
      return (
        priorityKeys.indexOf(firstIssue.priority) -
        priorityKeys.indexOf(secondIssue.priority)
      );
    });
    for (const issue of categoryIssues) {
      let priority = priorityKeys.filter((label) =>
        issue.labels.nodes.some((labelNode) => labelNode.name == label)
      );

      let issueType = issueTypeKeys.filter((issueType) =>
        issue.labels.nodes.some((labelNode) => labelNode.name === issueType)
      );

      let assignees = issue.assignees.nodes.map(
        (assignee) =>
          `[${assignee.login}]("https://github.com/${assignee.login}")`
      );
      let resolvedRow = resolveToString(compiledRow, {
        issueType: issueTypeMap[issueType] || "⬛",
        priority: priorityMap[priority] || "⚪ N/A-",
        issueNo: issue.number,
        title: issue.title,
        status: isClosed
          ? ""
          : "`" + issue.pipelineIssue.pipeline.name.toUpperCase() + "`",
        assignees: assignees.join(", "),
      });

      section += `${resolvedRow}
`;
    }
    sections.push(section);
  }
  return sections.join("\n");
};

getReport = async () => {
  // We don't need to check by pipelines since the assumption is that
  // whenever the report is generated, the relevant sprints have been planned
  // const ongoingPipelines = process.env.ONGOING_PIPELINES.split(", ");

  // Get all the data from Zenuhb in one go
  // Uncomment the following like to use static data instead
  // const zenhubData = await getZenhubInfoStatic();
  const zenhubData = await getZenhubInfo();
  const workspaceData = zenhubData.data.viewer.searchWorkspaces.nodes[0];

  // Figure out where in the sprint we currently are
  let currentSprintEndDate = workspaceData.activeSprint.endAt;
  let dateDiff = moment(currentSprintEndDate).diff(currentDate, "days");

  let plannedTasks;
  let closedTasks;

  let enclosedIn = currentDate;
  if (enclosedIn.isoWeekday() === 1) {
    // Only on Mondays, we actually want to see the report for last week
    enclosedIn.subtract(3, "days");
  }
  if (dateDiff < 3) {
    // This sprint is about to end, planned tasks will be taken from the next sprint
    plannedTasks = await getPlannedTasks(workspaceData.upcomingSprint);
    closedTasks = await getClosedTasks(workspaceData.activeSprint, enclosedIn);
  } else if (dateDiff > 12) {
    // We have started a new sprint recently, use closed issue data from previous sprint
    plannedTasks = await getPlannedTasks(workspaceData.activeSprint);
    closedTasks = await getClosedTasks(
      workspaceData.previousSprint,
      enclosedIn
    );
  } else {
    // We're in the middle of the sprint, planned tasks will be taken from the current sprint
    plannedTasks = await getPlannedTasks(workspaceData.activeSprint);
    closedTasks = await getClosedTasks(workspaceData.activeSprint, enclosedIn);
  }

  // Create markdown output for each section to be reported
  let plannedTasksMd = getFormattedTasks(plannedTasks);
  let closedTasksMd = getFormattedTasks(closedTasks, true);

  return (
    "\n## What did we close?\n---\n" +
    closedTasksMd +
    "\n## What are we working on?\n---\n" +
    plannedTasksMd
  );
};

exports.handler = async function (event) {
  currentDate = moment();
  let statusCode;
  let body;

  try {
    statusCode = 200;
    body = await getReport();
  } catch (err) {
    statusCode = 400;
    console.log(err);
  }

  // Return object required by API Gateway
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    },
    body: body,
  };
};
