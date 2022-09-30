import {
    GenerateCredentialReportCommand,
    GetCredentialReportCommand,
    GetCredentialReportCommandOutput,
    IAMClient
} from "@aws-sdk/client-iam";
import * as http from "http";
import * as https from "https";
import {loadSecrets} from "./common/secrets";

const FULL_REPORT_RECIPIENTS = [
  "shrikant@appsmith.com",
];

type Entry = {
    username: string
    isPasswordEnabled: boolean
    passwordLastUsed: null | Date
    passwordLastChanged: null | Date
    passwordNextReset: null | Date
    isMFASet: boolean
    isAccessKey1Enabled: boolean
    accessKey1LastRotated: null | Date
    isAccessKey2Enabled: boolean
    accessKey2LastRotated: null | Date
};

if (process.env.LAMBDA_TASK_ROOT == null) {
    main().catch(console.error);
}

export async function main() {
    console.log("Starting");
    await sendCredentialAlerts();
    console.log("Finished");

    return {
        statusCode: 200,
        body: "Done",
    };
}

async function sendCredentialAlerts() {
    const {slackToken} = await loadSecrets();

    if (slackToken == null || !slackToken.startsWith("xoxb-")) {
        throw new Error("slackToken is not set or invalid.");
    }

    const client = new IAMClient({
        region: "us-east-1",
    });

    const data: GetCredentialReportCommandOutput = await fetchReport(client);

    if (data.Content == null) {
        throw new Error("No content in report.");
    }

    const reportCsv = Buffer.from(data.Content).toString();
    console.info(reportCsv);

    const messagesByUser: Record<string, string[]> = {};

    for (const line of reportCsv.split("\n").slice(1)) {
        const parts = line.split(",");
        messagesByUser[parts[0]] = await checkAndAlert(slackToken, {
            username: parts[0],
            isPasswordEnabled: parts[3] === "true",
            passwordLastUsed: parseDate(parts[4]),
            passwordLastChanged: parseDate(parts[5]),
            passwordNextReset: parseDate(parts[6]),
            isMFASet: parts[7] === "true",
            isAccessKey1Enabled: parts[8] === "true",
            accessKey1LastRotated: parseDate(parts[9]),
            isAccessKey2Enabled: parts[13] === "true",
            accessKey2LastRotated: parseDate(parts[14]),
        });
    }

    for (const email of FULL_REPORT_RECIPIENTS) {
        const lines: string[] = []
        for (const [username, messages] of Object.entries(messagesByUser)) {
            if (messages.length > 0) {
                lines.push(`*${username}*`);
                for (const message of messages) {
                    lines.push(`  - ${message}`);
                }
            }
        }
        await slackPostMessage(
          slackToken,
          await fetchSlackUserIdFromEmail(slackToken, email),
          "Credential report:\n\n" + lines.join("\n"),
        )
    }
}

async function fetchReport(client: IAMClient): Promise<GetCredentialReportCommandOutput> {
    try {
        return await client.send(new GetCredentialReportCommand({}));

    } catch (err: any) {
        if (err.Code === "ReportNotPresent") {
            console.log("Report not present. Generating...");
            await client.send(new GenerateCredentialReportCommand({}));
            await new Promise(resolve => setTimeout(resolve, 3000));
            return await fetchReport(client);

        } else if (err.Code === "ReportInProgress") {
            console.log("Report in progress. Retrying...");
            await new Promise(resolve => setTimeout(resolve, 3000));
            return await fetchReport(client);

        } else {
            throw err;

        }

    }
}

function parseDate(dateStr: string): null | Date {
    return dateStr === "not_supported" || dateStr === "N/A" ? null : new Date(dateStr);
}

async function checkAndAlert(slackToken: string, entry: Entry): Promise<string[]> {
    const messages: string[] = [];

    if (entry.isPasswordEnabled && entry.passwordNextReset != null) {
        const daysToNextReset = Math.ceil((entry.passwordNextReset.valueOf() - Date.now()) / (1000 * 60 * 60 * 24));
        const suffix = ` Also, see <https://www.notion.so/appsmith/AWS-33be6d3432af4629832723b61481311b#72cce092ca7f40ffbf9213f66dfc516c|password policy>.`;
        if (daysToNextReset < 0) {
            messages.push(`Your password expired ${-daysToNextReset} days ago. Please change immediately.` + suffix);
        } else if (daysToNextReset < 7) {
            messages.push(`Your password will expire in ${daysToNextReset} day(s). Please change soon.` + suffix);
        }
    }

    if (entry.isPasswordEnabled && !entry.isMFASet) {
        messages.push("Your don't have MFA enabled. Please set up MFA immediately.");
    }

    if (entry.isAccessKey1Enabled && entry.accessKey1LastRotated != null) {
        const ageInDays = Math.ceil((Date.now() - entry.accessKey1LastRotated.valueOf()) / (1000 * 60 * 60 * 24));
        if (ageInDays > 80) {
            messages.push(`Your access key 1 is ${ageInDays} days old. Access keys should be rotated every 90 days. Please regenerate this key ${ageInDays > 90 ? "immediately" : "soon"}.`);
        }
    }

    if (entry.isAccessKey2Enabled && entry.accessKey2LastRotated != null) {
        const ageInDays = Math.ceil((Date.now() - entry.accessKey2LastRotated.valueOf()) / (1000 * 60 * 60 * 24));
        if (ageInDays > 80) {
            messages.push(`Your access key 2 is ${ageInDays} days old. Access keys should be rotated every 90 days. Please regenerate this key ${ageInDays > 90 ? "immediately" : "soon"}.`);
        }
    }

    if (messages.length > 0) {
        console.log("Alerts for " + entry.username, messages);
        await sendSlackAlert(slackToken, entry.username, messages);
    }

    return messages;
}

async function sendSlackAlert(slackToken: string, username: string, messages: string[]): Promise<void> {
    if (!username.endsWith("@appsmith.com")) {
        console.log("Not sending slack alert to potentially non-human user", username);
        return;
    }

    const userId: string = await fetchSlackUserIdFromEmail(slackToken, username);

    const message = [
        "Hey <@" + userId + ">! You have some old credentials on our AWS account. Please take some time to change/rotate them.",
        "",
        "\t- " + messages.join("\n\t- "),
        "",
        "Link to sign in to AWS: <https://appsmith.signin.aws.amazon.com/console/>. For any questions, please contact us at the <#C02MUD8DNUR> channel.", // The #team-devops channel.
    ].join("\n");

    await slackPostMessage(slackToken, userId, message);
}

async function slackPostMessage(slackToken: string, userId: string, message: string): Promise<void> {
    const response = await request<{ ok: boolean }>("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + slackToken,
            "Content-Type": "application/json; charset=utf-8",
        },
        body: {
            channel: userId,
            text: message,
            unfurl_links: false,
            unfurl_media: false,
        },
    });

    if (!response.ok) {
        console.log("Non-ok response sending Slack alert", response);
    }
}

async function fetchSlackUserIdFromEmail(slackToken: string, email: string): Promise<string> {
    // Don't ask.
    if (email === "nikhil@appsmith.com") {
        email = "nikhil.nandagopal@gmail.com"
    }

    const response = await request<{ user?: { id: string } }>("https://slack.com/api/users.lookupByEmail?email=" + email, {
        headers: {
            "Authorization": "Bearer " + slackToken,
        },
    });

    if (response.user == null) {
        console.error("No user found for email. Full response from Slack: ", response);
        throw new Error("No user found for email " + email);
    }

    return response.user.id;
}

type RequestOptions = {
    method?: "GET" | "POST"
    headers?: Record<string, string>
    body?: Record<string, unknown>
}

function request<T>(url: string, options?: RequestOptions): Promise<T> {
    return new Promise((resolve, reject) => {
        const chunks: string[] = [];

        function onData(chunk: string) {
            chunks.push(chunk);
        }

        function onEnd() {
            try {
                resolve(JSON.parse(chunks.join("")));
            } catch (err) {
                console.log("Error parsing JSON", err, chunks.join(""));
                reject(err);
            }
        }

        const request = https.request(
            url,
            {
                method: options?.method || "GET",
                headers: options?.headers || {},
            },
            (res: http.IncomingMessage) => {
                res.setEncoding("utf8");
                res.on("data", onData);
                res.on("end", onEnd);
            }
        );

        request.on("error", reject);

        if (options?.body) {
            request.write(JSON.stringify(options.body));
        }

        request.end();
    });
}
