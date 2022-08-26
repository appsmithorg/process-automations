import * as https from "https"

export default function githubQuery(githubToken: string, query: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const request = https.request("https://api.github.com/graphql", {
            method: "POST",
            headers: {
                "User-Agent": "",
                "Content-Type": "application/json",
                "Authorization": "Bearer " + githubToken,
            },
        }, (res) => {
            const parts: string[] = []
            res.on("data", (chunk) => {
                parts.push(chunk)
            })
            res.on("end", () => {
                console.log(parts.join(""))
                try {
                    resolve(JSON.parse(parts.join("")))
                } catch (error) {
                    console.log("Response plain", parts.join(""))
                    reject(error)
                }
            })
        })
        request.write(JSON.stringify({ query }))
        request.end()
    })
}
