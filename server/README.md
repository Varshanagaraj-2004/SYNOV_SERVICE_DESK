# Synov Service Desk server

## Reset a user's password

From the `server` directory, pass the user's email to the one-off reset script:

```sh
npm run reset-password -- user@example.com
```

The script connects using `MONGO_URI` from the server `.env`, generates and stores a temporary password, requires a password change on first login when supported by the User model, and emails the credentials with a login link based on `FRONTEND_URL`. It does not print the password or database connection string.
