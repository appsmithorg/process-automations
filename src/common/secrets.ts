import {GetSecretValueCommand, SecretsManagerClient} from "@aws-sdk/client-secrets-manager";

type Secrets = {
    slackToken: undefined | string
}

export async function loadSecrets(): Promise<Secrets> {
    if (process.env.LAMBDA_TASK_ROOT == null) {
        return {
            slackToken: process.env.SLACK_TOKEN,
        };

    } else {
        console.log("Loading secrets");

        const client = new SecretsManagerClient({
            region: process.env.AWS_REGION,
        });

        const output = await client.send(new GetSecretValueCommand({
            SecretId: process.env.AWS_SECRET_NAME,
        }));

        if (output.SecretString == null) {
            console.log("Missing SecretString in Output:", output);
            throw new Error("Missing SecretString in Output");
        }

        const data: Record<string, string> = JSON.parse(output.SecretString);
        return {
            slackToken: data.SLACK_TOKEN,
        };

    }
}
