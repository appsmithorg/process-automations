import * as https from "https"
import * as http from "http"

type RequestOptions = {
  method?: "GET" | "POST" | "PUT"
  headers?: Record<string, string>
  body?: unknown
}

export default function jsonRequest<T>(url: string, options: RequestOptions = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = (url.startsWith("http://") ? http : https).request(url, {
      method: options.method ?? "GET",
      headers: options.headers,
    }, (res: http.IncomingMessage) => {
      const parts: string[] = []
      res.on("data", parts.push.bind(parts))
      res.on("end", () => {
        try {
          resolve(JSON.parse(parts.join("")))
        } catch (error) {
          console.log("Error response plain", parts.join(""))
          reject(error)
        }
      })
    })
    if (options.body != null) {
      request.write(JSON.stringify(options.body))
    }
    request.end()
  })
}
