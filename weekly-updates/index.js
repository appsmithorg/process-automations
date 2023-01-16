const fetch = require("node-fetch");
const path = require("path");
const fs = require("fs");
const template = require("es6-template-strings");
const moment = require("moment");
const compile = require("es6-template-strings/compile"),
resolveToString = require("es6-template-strings/resolve-to-string");

let currentDate;

let workspaceMap = {
  "BE Coders Pod": "6167d73fab4b07001219a3d0",
  "App Viewers Pod": "616922264a5ea000108d319d",
  "FE Coders Pod": "6167d1b64ee5f20014242ab7",
  "Performance Board": "6231ad37179efb001826a53f"
}

let sprintStates = ['previousSprint', 'activeSprint', 'upcomingSprint']

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
  Chore: "🧹",
};

let issueTypeKeys = Object.keys(issueTypeMap);
let otherClosedPipeline = ['Dev closed', 'Design / PRD closed'];

const ADHOC = "Ad-hoc tasks";

getZenhubSprintInfo = async (index) => {
  let fileName = path.resolve(__dirname, "graphql/"+sprintStates[index]+".graphql");
  const fileData = fs.readFileSync(fileName, "utf8");
  const query = template(fileData, { podName: process.env.POD , workspaceId: workspaceMap[process.env.POD]});
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

getClosedIssuesInfo = async () => {
  let fileName = path.resolve(__dirname, "graphql/closedIssues.graphql");
  const fileData = fs.readFileSync(fileName, "utf8");
  const query = template(fileData, {workspaceId: workspaceMap[process.env.POD]});
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
  categorizedIssues.set(ADHOC, []);

  for (const issue of issues) {
    let existingIssues = [];
    if (!!issue.closedAt || otherClosedPipeline.includes(issue.pipelineIssue.pipeline.name)) {
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

getSpilledTasks = async (sprint) => {
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
  categorizedIssues.set(ADHOC, []);

  for (const issue of issues) {
    let existingIssues = [];
    if (!!issue.closedAt || otherClosedPipeline.includes(issue.pipelineIssue.pipeline.name)) {
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

// Function to find repeted objects and merge them
getUniqObj = (issues) => {
  let set = new Set();
  let unionArray = issues.filter(item => {
    if (!set.has(item.number)) {
      set.add(item.number);
      return true;
    }
    return false;
  }, set);
  return unionArray;
}

getClosedTasks = async (issues, enclosedIn) => {
  issues = issues.filter((issue) => {
    let isTempClosed = otherClosedPipeline.includes(issue.pipelineIssue.pipeline.name)
    let isClosed = !!issue.closedAt || isTempClosed;
    let closedAtMs = moment(issue.closedAt).valueOf();
    let isClosedThisWeek =
      closedAtMs > enclosedIn.isoWeekday(1).valueOf() &&
      closedAtMs < enclosedIn.isoWeekday(7).valueOf();

    return isClosed && (isClosedThisWeek || isTempClosed);
  });

  let categories = new Map();

  let uncategorized = {
    title: ADHOC,
  };

  categories.set(ADHOC, uncategorized);

  let closedIssues = new Map();
  closedIssues.set(ADHOC, []);
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

function isEmpty(obj) {
  return Object.keys(obj).length === 0 && obj.constructor === Object;
}

getFormattedTasks = (categorizedIssues, isClosed) => {
  if (isEmpty(categorizedIssues)) {
    return "";
  }

  let issueRow =
    "- ${issueType} [ ${priority} ] [${issueNo}](https://github.com/appsmithorg/appsmith/issues/${issueNo}): ${title} ${status} (${estimate} SP) | **${assignees}**";
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
      const pipelineName = issue.pipelineIssue.pipeline.name;
      let status = isClosed ? 
        (otherClosedPipeline.includes(pipelineName) ?  
          "`" + pipelineName.toUpperCase() + "`" : "") : 
        "`" + pipelineName.toUpperCase() + "`";
      let resolvedRow = resolveToString(compiledRow, {
        issueType: issueTypeMap[issueType] || "⬛",
        priority: priorityMap[priority] || "⚪ N/A-",
        issueNo: issue.number,
        title: issue.title,
        estimate: issue.estimate ? issue.estimate.value : "No estimate",
        status: status,
        assignees: assignees.join(", "),
      });

      section += `${resolvedRow}
`;
    }
    sections.push(section);
  }
  return sections.join("\n");
};

/**
 * We don't need to check by pipelines since the assumption is that
 * whenever the report is generated, the relevant sprints have been planned
 * We also cannot get all data in one go, zenhub has introduce rate limiting by complexity
 * So we need to make multiple calls to get all the data for previous, active and upcoming sprints
 */
getReport = async () => {
  const prevSprintData = await getZenhubSprintInfo(0);
  const activeSprintData = await getZenhubSprintInfo(1);
  const futureSprintData = await getZenhubSprintInfo(2);
  const closedIssuesData = await getClosedIssuesInfo();
  const activeSprintworkspaceData = activeSprintData.data.workspace.activeSprint;
  const previousSprintworkspaceData = prevSprintData.data.workspace.previousSprint;
  const futureSprintworkspaceData = futureSprintData.data.workspace.upcomingSprint;

  // Figure out where in the sprint we currently are
  let currentSprintEndDate = activeSprintworkspaceData.endAt;
  let dateDiff = moment(currentSprintEndDate).diff(currentDate, "days");

  let plannedTasks;
  let closedTasks;
  let spilledTasks;

  let enclosedIn = currentDate;
  if (enclosedIn.isoWeekday() === 1) {
    // Only on Mondays, we actually want to see the report for last week
    enclosedIn.subtract(3, "days");
  }

  // merge the issues from the active sprint and the closed issues
  // to get the total list of issues that have closed (other that the closed pipleine)
  let allClosedIssues = [
    ...activeSprintworkspaceData.issues.nodes,
    ...previousSprintworkspaceData.issues.nodes,
    ...futureSprintworkspaceData.issues.nodes,
    ...closedIssuesData.data.searchClosedIssues.nodes
  ]
  let uniqClosedIssues = getUniqObj(allClosedIssues)

  if (dateDiff <= 3) {
    // This sprint is about to end, planned tasks will be taken from the next sprint
    plannedTasks = await getPlannedTasks(futureSprintworkspaceData);
    spilledTasks = await getSpilledTasks(activeSprintworkspaceData);
    closedTasks = await getClosedTasks(uniqClosedIssues, enclosedIn);
  } else if (dateDiff > 3) {
    // We have started a new sprint recently, use closed issue data from previous sprint
    plannedTasks = await getPlannedTasks(activeSprintworkspaceData);
    spilledTasks = {};
    closedTasks = await getClosedTasks(
      uniqClosedIssues,
      enclosedIn
    );
  } else {
    // We're in the middle of the sprint, planned tasks will be taken from the current sprint
    plannedTasks = await getPlannedTasks(activeSprintworkspaceData);
    spilledTasks = {};
    closedTasks = await getClosedTasks(uniqClosedIssues, enclosedIn);
  }

  // Create markdown output for each section to be reported
  let plannedTasksMd = getFormattedTasks(plannedTasks);
  let spilledTasksMd = getFormattedTasks(spilledTasks);
  let closedTasksMd = getFormattedTasks(closedTasks, true);

  let spilledSection = isEmpty(spilledTasks) ? "" : "\n## Spillover\n---\n" + spilledTasksMd;

  return (
    "\n## What did we close?\n---\n" + 
    closedTasksMd +
    spilledSection +
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
