# Synov Service Desk

## Running the project

From the repository root, run `npm run install:all` to install dependencies in
the root, `server/`, and `client/` directories. Then run `npm run dev` to start
the server and client development processes together. Their logs are labelled
and colour-coded as `server` and `client`.

For a production build, run `npm run build` from the repository root, then
`npm start` to serve the client and API together. In development, the Vite
server proxies `/api` requests to the server.
