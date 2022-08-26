import githubQuery from "./common/github-graphql-query"
import jsonRequest from "./common/json-request"

// Note: Many of the calls to `api.github.com` in this script are rate-limited. To avoid that, we send the API Key along, although it's not required.

const TEAM_MEMBER_CONTRIBUTION_BONUS = 1000

main().catch((error) => console.error(error))

type Contributor = {
  login: string
  avatarUrl: string
  profileUrl: string
  contributions: number
}

async function main(): Promise<void> {
  const githubToken = process.env.GITHUB_TOKEN_FOR_CONTRIBUTORS
  if (githubToken == null) {
    throw new Error("GITHUB_TOKEN_FOR_CONTRIBUTORS environment variable not set")
  }

  const teamMembers = await fetchTeamMembers(githubToken)
  console.log("Found " + teamMembers.size + " team members")

  if (teamMembers.size < 100) {
    throw new Error("Too few team members. Something is wrong.")
  }

  // Add a few others.
  teamMembers.add("vicky-primathon")

  const allContributors: Contributor[] = (await fetchAllContributors(githubToken))
    .filter((contributor) => !contributor.login.endsWith("-bot"))
    .map((contributor) => {
      if (teamMembers.delete(contributor.login)) {
        contributor.contributions += TEAM_MEMBER_CONTRIBUTION_BONUS
      }
      return contributor
    })

  // Now `teamMembers` contains the team members who are not already in `allContributors`.
  for (const member of teamMembers) {
    allContributors.push(await fetchUserContributor(githubToken, member))
  }

  allContributors.sort((user1, user2) => {
    if (user1.contributions < user2.contributions) {
      return 1
    } else if (user1.contributions > user2.contributions) {
      return -1
    } else {
      return 0
    }
  })

  const lines: string[] = []
  for (const contributor of allContributors) {
    lines.push(`[![${ contributor.login }](https://images.weserv.nl/?url=${ contributor.avatarUrl }&w=50&h=50&mask=circle)](${ contributor.profileUrl })`)
  }

  const readmeResponse = await jsonRequest<{ content: string, sha: string }>(
    "https://api.github.com/repos/appsmithorg/appsmith/contents/README.md",
    {
      headers: {
        "User-Agent": "",
        "Authorization": "Token " + githubToken,
      },
    },
  )

  if (readmeResponse.content == null) {
    console.log("Readme response", readmeResponse)
    throw new Error("Could not find README.md")
  }

  const oldReadmeContent = Buffer.from(readmeResponse.content, "base64").toString("utf8")
  const newReadme = await generateNewReadme(oldReadmeContent, lines)
  console.log(newReadme)

  if (newReadme === oldReadmeContent) {
    console.log("No change to README.md")
    return
  }

  const updateResponse = await jsonRequest<{ content?: unknown }>("https://api.github.com/repos/appsmithorg/appsmith/contents/README.md", {
    method: "PUT",
    headers: {
      "User-Agent": "",
      "Authorization": "Token " + githubToken,
      "Accept": "application/vnd.github+json",
    },
    body: {
      message: "Update top contributors",
      content: Buffer.from(newReadme).toString("base64"),
      sha: readmeResponse.sha,
    },
  })

  if (updateResponse.content == null) {
    console.log(updateResponse)
    process.exit(1)
  }
}

async function fetchTeamMembers(githubToken: string): Promise<Set<string>> {
  const members: Set<string> = new Set()
  let afterId: null | string = null

  type Response = {
    data: {
      organization: {
        membersWithRole: {
          nodes: {
            login: string
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
      organization(login: "appsmithorg") {
        membersWithRole(first: 100${ afterId == null ? "" : `, after: "${ afterId }"` }) {
          nodes {
            login
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }`))

    for (const member of r.data.organization.membersWithRole.nodes) {
      members.add(member.login)
    }

    if (r.data.organization.membersWithRole.pageInfo.hasNextPage) {
      afterId = r.data.organization.membersWithRole.pageInfo.endCursor
    } else {
      break
    }
  }

  return members
}

async function fetchAllContributors(githubToken: string): Promise<Contributor[]> {
  const allContributors: Contributor[] = []

  for (let page = 1; page < 100; ++page) {
    const response: any[] = await jsonRequest("https://api.github.com/repos/appsmithorg/appsmith/contributors?per_page=100&page=" + page, {
      headers: {
        "User-Agent": "",
        "Authorization": "Token " + githubToken,
      },
    })

    if (!Array.isArray(response)) {
      console.log("Unexpected contributors response", response)
      throw new Error("Unexpected contributors response")
    }

    for (const contributor of response) {
      if (contributor.type === "User") {
        allContributors.push({
          login: contributor.login,
          avatarUrl: contributor.avatar_url,
          profileUrl: contributor.html_url,
          contributions: contributor.contributions,
        })
      }
    }

    if (response.length < 100) {
      break
    }
  }

  return allContributors
}

async function fetchUserContributor(githubToken: string, login: string): Promise<Contributor> {
  const response = await jsonRequest<any>("https://api.github.com/users/" + login, {
    headers: {
      "User-Agent": "",
      "Authorization": "Token " + githubToken,
    },
  })

  return {
    login,
    avatarUrl: response.avatar_url,
    profileUrl: response.html_url,
    contributions: TEAM_MEMBER_CONTRIBUTION_BONUS,
  }
}

async function generateNewReadme(oldReadme: string, contributorLines: string[]): Promise<string> {
  const match = (/^#+\s*Top Contributors\b.+(?=^#)/ms).exec(oldReadme)
  if (match == null) {
    throw new Error("Could not find top contributors section in README.md")
  }

  const matchContent = match[0]
  return [
    oldReadme.substring(0, match.index) + matchContent.split("\n", 2)[0],
    contributorLines.join("\n"),
    oldReadme.substring(match.index + matchContent.length),
  ].join("\n\n")
}
