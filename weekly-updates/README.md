This locally created lambda is meant to create the planned and closed tasks part of a weekly report like the one found [here](https://www.notion.so/appsmith/BE-Coder-s-Pod-f0dfc9d0025f4226a39b030643ea5aa6).

To set this up on your local, please follow these steps:
1. Install dependencies
```
npm i
```
2. Set up environment variables. Please find a copy of expected variables in the `dev.env` file. Copy this file into one called `.env` and fill in your Zenhub key to get started.
```
cp dev.env .env
```
3. If this is your first time running this utility for your pod, please make sure that your pod is registered in the `workspaceMap` in `index.js`. You can find you workspaceId in the Zenhub url for your pod.
4. Run server
```
npm start
```
5. Hit the server with a GET request at http://localhost:3000/lambda