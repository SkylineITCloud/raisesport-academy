# RaiseSport Academy

Full website, athlete membership dashboard, coach workspace and academy management.

- GitHub website link: https://skylineitcloud.github.io/raisesport-academy/
- Full hosted app: https://raisesport-academy-skyline.earthygrass258.chatgpt.site
- Windows version: download the repository and double-click local-app/Start RaiseSport.cmd.

GitHub Pages redirects to the full app because GitHub Pages cannot run a backend or a database. The hosted app runs on Cloudflare Workers with a separate D1 database. The local Windows app continues to use Python and SQLite.

## Demo logins

Sign in through /login/. The requested demo accounts are athlete@gmail.com, coach@gmail.com and manager@gmail.com; the password is password. These are application demo logins, not Gmail mailbox credentials. This deployment is a public demonstration with shared staff credentials; do not store private customer or athlete information until the demo passwords have been changed and public demo provisioning has been disabled.

Athletes can access their own records, coaches can access assigned athletes, and managers can access academy records. Registration creates pending athlete memberships. Session expiry is 15 minutes idle and 8 hours total. Payments show PayFast and bank transfer as coming soon; no money is collected.

No local customer database, login file, private records, backups, runtime keys or environment files are included in this repository. The online and local databases are separate.

## Cloud source

app/raisesport-server.ts implements the hosted API. app/website-pages.ts contains the server-served public and protected HTML pages; public/ contains styles, scripts and media only. db/schema.ts and drizzle/ contain the database schema and generated migrations. .openai/hosting.json declares the Site identity and D1 binding. Runtime environment variables are managed by Sites, not source control. RAISESPORT_DEMO_MODE=true provisions the requested demo accounts once without resetting their passwords.

npm ci installs the cloud dependencies. npm run db:generate creates migration files after schema changes. npm run dev starts local cloud preview. npm run build builds the hosted app. The Sites publishing workflow packages and deploys the built version.

The local-app/ directory contains the Windows application, its single launcher and integration checks. See local-app/README.md for local usage and test commands.
