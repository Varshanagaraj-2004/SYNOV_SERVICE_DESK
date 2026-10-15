# Synov Service Desk

## Running the project

From the repository root, run `npm run install:all` to install dependencies in
the root, `server/`, and `client/` directories. Then run `npm run dev` to start
the server and client development processes together. Their logs are labelled
and colour-coded as `server` and `client`.

To access the app from another device on the LAN, set `VITE_API_URL` in
`client/.env` to `http://<server-LAN-IP>:5000/api`. In `server/.env`, set
`FRONTEND_URL` and `CORS_ORIGINS` to the browser URL,
`http://<server-LAN-IP>:5173`; use the same LAN IP to open the client.
