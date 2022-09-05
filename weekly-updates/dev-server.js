const path = require("path");
const express = require("express");
const lambdaLocal = require("lambda-local");

const app = express();

// Process body as plain text as this is
// how it would come from API Gateway
app.use(express.text());

app.use("/lambda", async (req, res) => {
  const result = await lambdaLocal.execute({
    lambdaPath: path.join(__dirname, "index"),
    lambdaHandler: "handler",
    envfile: path.join(__dirname, ".env"),
    event: {
      headers: req.headers, // Pass on request headers
      body: req.body, // Pass on request body
    },
    timeoutMs: 10000
  });

  // Respond to HTTP request
  res.status(result.statusCode).set(result.headers).end(result.body);
});

app.listen(3000, () => console.log("listening on port: 3000"));
