import githubQuery from "./github-graphql-query"

// Ref: <https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects>.

main().catch((error) => console.error(error))

async function main(): Promise<void> {
  const podName = process.argv[2]
  if (podName == null) {
    throw new Error("Please specify a pod label")
  }
  console.log(`Syncing issues for pod '${ podName }'.`)
  console.log(`Assuming project name is the same.`)
  const projectName = podName

  const githubToken = process.env.GITHUB_TOKEN_FOR_SYNC_PROJECTS
  if (githubToken == null) {
    throw new Error("sync-github-project-issues environment variable not set")
  }

  const parts = await Promise.all([
    fetchOpenIssuesWithLabel(githubToken, "appsmith", podName),
    fetchOpenIssuesWithLabel(githubToken, "appsmith-ee", podName),
  ])
  const itemsExpectedToBeInProject: Set<string> = new Set([...parts[0], ...parts[1]])
  console.log("itemsExpectedToBeInProject", itemsExpectedToBeInProject)

  const projectInfo = await fetchIssuesInProject(githubToken, projectName)
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

async function fetchIssuesInProject(githubToken: string, projectName: string): Promise<{ projectId: string, issueIds: Set<string> }> {
  const projectNumber = await fetchProjectNumber(githubToken, projectName)
  if (projectNumber == null) {
    throw new Error(`Project ${ projectName } not found.`)
  }

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

async function fetchProjectNumber(githubToken: string, projectName: string): Promise<null | number> {
  return (await githubQuery(githubToken, `
    {
      organization(login: "appsmithorg") {
        projectsV2(query: "${ projectName }", first: 1) {
          nodes {
            number
          }
        }
      }
    }
  `)).data.organization.projectsV2.nodes[0].number ?? null
}
