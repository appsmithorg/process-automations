import jsonRequest from "./json-request"

export default function githubQuery(githubToken: string, query: string): Promise<any> {
    return jsonRequest("https://api.github.com/graphql", {
        method: "POST",
        headers: {
            "User-Agent": "",
            "Content-Type": "application/json",
            "Authorization": "Bearer " + githubToken,
        },
        body: {
            query,
        },
    })
}
