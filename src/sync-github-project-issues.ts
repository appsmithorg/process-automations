import githubQuery from "./common/github-graphql-query"

// Ref: <https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects>.

main().catch((error) => console.error(error))

type Project = {
  title: string
  number: number
  readme: null | string
}

type ProjectSyncConfig = {
  label: string
}

async function main(): Promise<void> {
  const githubToken = process.env.GITHUB_TOKEN_FOR_SYNC_PROJECTS
  if (githubToken == null) {
    throw new Error("GITHUB_TOKEN_FOR_SYNC_PROJECTS environment variable not set")
  }

  const projects: Project[] = await loadAllProjects(githubToken)
  for (const project of projects) {
    if (project.readme == null) {
      continue
    }

    const match = project.readme.match(/^```autosync\n.+```$/ms)
    if (match == null) {
      continue
    }

    const jsonConfig = match[0].substring("^```autosync\n".length-1, match[0].length - 3).trim()
    console.log(`JSON Config for project ${project.title}: `, jsonConfig)
    const config: ProjectSyncConfig = JSON.parse(jsonConfig)
    console.log(`Syncing project ${project.title} with issues labelled ${config.label}`)
    await doSyncProject(githubToken, project.number, config.label)
  }
}

async function doSyncProject(githubToken: string, projectNumber: number, label: string) {
  const parts = await Promise.all([
    fetchOpenIssuesWithLabel(githubToken, "appsmith", label),
    fetchOpenIssuesWithLabel(githubToken, "appsmith-ee", label),
  ])
  const itemsExpectedToBeInProject: Set<string> = new Set([...parts[0], ...parts[1]])
  console.log("itemsExpectedToBeInProject", itemsExpectedToBeInProject)

  const projectInfo = await fetchIssuesInProject(githubToken, projectNumber)
  const projectId: string = projectInfo.projectId
  const itemsAlreadyInProject: Set<string> = projectInfo.issueIds
  console.log(`Project ${ projectId } has`, itemsAlreadyInProject)

  const itemsToAdd: Set<string> = new Set(Array.from(itemsExpectedToBeInProject).filter((x) => !itemsAlreadyInProject.has(x)))
  console.log(`Items to add: ${ itemsToAdd.size }`)
  for (const item of itemsToAdd) {
    await githubQuery(githubToken, `mutation {
      addProjectV2ItemById(input: {projectId: "${ projectId }" contentId: "${ item }"}) {
        item {
          id
        }
      }
    }`)
  }

  const itemsToRemove: Set<string> = new Set(Array.from(itemsAlreadyInProject).filter((x) => !itemsExpectedToBeInProject.has(x)))
  console.log(`Items to remove: ${ itemsToRemove.size }`)
  for (const item of itemsToRemove) {
    await githubQuery(githubToken, `mutation {
      deleteProjectV2Item(input: {projectId: "${ projectId }" itemId: "${ item }"}) {
        deletedItemId
      }
    }`)
  }

}

async function loadAllProjects(githubToken: string): Promise<Project[]> {
  const projects: Project[] = []
  let afterId: null | string = null

  type Response = {
    data: {
      organization: {
        projectsV2: {
          nodes: Project[]
          pageInfo: {
            hasNextPage: boolean
            endCursor: string
          }
        }
      }
    }
  }

  for (let i = 0; i < 100; ++i) {
    const r: Response = (await githubQuery(githubToken, `
      {
        organization(login: "appsmithorg") {
          projectsV2(first: 100${ afterId == null ? "" : `, after: "${ afterId }"` }) {
            nodes {
              title
              number
              readme
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `))

    console.log(r)
    projects.push(...r.data.organization.projectsV2.nodes)

    if (r.data.organization.projectsV2.pageInfo.hasNextPage) {
      afterId = r.data.organization.projectsV2.pageInfo.endCursor
    } else {
      break
    }
  }

  return projects
}

async function fetchOpenIssuesWithLabel(githubToken: string, repo: string, label: string): Promise<Set<string>> {
  const ids: Set<string> = new Set
  let afterId: null | string = null

  type Response = {
    data: {
      repository: {
        issues: {
          nodes: {
            id: string
          }[]
          pageInfo: {
            hasNextPage: boolean
            endCursor: string
          }
        }
      }
    }
  }

  for (let i = 0; i < 100; ++i) {
    const r: Response = (await githubQuery(githubToken, `{
      repository(name: "${ repo }", owner: "appsmithorg") {
        issues(labels: "${ label }", states: OPEN, first: 100${ afterId == null ? "" : `, after: "${ afterId }"` }) {
          nodes {
            id
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }`))

    const issueNodes = r.data.repository.issues.nodes

    console.log(r)

    for (const issue of issueNodes) {
      ids.add(issue.id)
    }

    if (r.data.repository.issues.pageInfo.hasNextPage) {
      afterId = r.data.repository.issues.pageInfo.endCursor
    } else {
      break
    }
  }

  return ids
}

async function fetchIssuesInProject(githubToken: string, projectNumber: number): Promise<{ projectId: string, issueIds: Set<string> }> {
  const issueIds: Set<string> = new Set
  let projectId: null | string = null
  let afterId: null | string = null

  type Response = {
    data: {
      organization: {
        projectV2: {
          id: string
          items: {
            nodes: {
              content: {
                id: string
              }
            }[]
          }
        }
      }
    }
  }

  for (let i = 0; i < 100; ++i) {
    const r: Response = (await githubQuery(githubToken, `
      {
        organization(login: "appsmithorg") {
          projectV2(number: ${ projectNumber }) {
            id
            items(first: 100${ afterId == null ? "" : `, after: "${ afterId }"` }) {
              nodes {
                ... on ProjectV2Item {
                  content {
                    ... on DraftIssue {
                      id
                    }
                    ... on Issue {
                      id
                    }
                    ... on PullRequest {
                      id
                    }
                  }
                }
              }
            }
          }
        }
      }
    `))

    const project = r.data.organization.projectV2

    projectId = project.id

    if (project.items.nodes == null) {
      break
    }

    for (const item of project.items.nodes) {
      issueIds.add(item.content.id)
    }

    if (project.items.nodes.length > 0) {
      afterId = project.items.nodes[project.items.nodes.length - 1].content.id
    } else {
      break
    }
  }

  if (projectId == null) {
    throw new Error("No project found")
  }

  return {
    projectId,
    issueIds,
  }
}
