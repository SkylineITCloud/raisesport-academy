# RaiseSport local app

Double-click **Start RaiseSport.cmd**. Keep the command window open while using the app. Close it or press Ctrl+C to stop. Python 3.10+ is required and is already installed. No extra packages or database setup are needed.

All accounts sign in at **http://127.0.0.1:3000/login/**.

| Role | Email | Password | Dashboard |
|---|---|---|---|
| Athlete | athlete@gmail.com | password | /athlete/ |
| Coach | coach@gmail.com | password | /coach/ |
| Manager | manager@gmail.com | password | /manager/ |

These are application login details, not Gmail mailbox passwords. Initial credentials are saved in data/PRIVATE-LOGINS.txt. The old example-domain logins and password-only manager sign-in have been replaced.

There is now one launcher: **Start RaiseSport.cmd**. It checks accounts, orders, enquiries, memberships, data upgrades, permissions, session expiry and website scripts, then starts one server for the whole app and opens the website and shared login page. The account role determines which dashboard opens after sign-in. An existing current server is reused. After an upgrade, close the previous server window and start again. Check results are saved in data/startup-checks.log. A failed check stops startup and displays the log location.

## Access

- Athletes see only their own membership, profile, schedule, messages and orders.
- Coaches see only assigned athletes. They can update memberships, keep private notes, create training/fixtures and exchange messages.
- Managers see academy enquiries, orders, customers, memberships and all athletes. **Athlete management** opens /team/, where managers assign coaches and create coach accounts.
- Public registration creates athlete accounts only. New membership requests start pending.
- The server checks roles for both dashboard HTML pages and private API requests. Changing a link or a saved browser role does not grant access.
- One HttpOnly session cookie identifies the account across the app. Sign-out invalidates the session and clears private screens in other tabs. Switching accounts replaces the previous identity. Private dashboard pages are not cached.
- Every login gets a fresh random session key, stored hashed on the server. Sessions expire after 15 minutes without user activity and after 8 hours regardless of activity. Background polling does not keep a session alive. The cookie is a browser-session cookie rather than a remembered login. Restarting the server signs everyone out.
- Private coach notes are not returned to athletes. Removing an assignment immediately removes the coach's access to that athlete.

The supplied athlete is assigned to the supplied coach. Existing memberships and related records are preserved. An active demonstration membership is not a payment receipt.

## Shopping and payments

Review products and quantities in the cart. **Confirm cart & continue** opens checkout for contact details and collection or delivery information. An order is saved only after **Place order**. Guest sign-in keeps the cart and returns to checkout.

**PayFast — Coming soon. Bank transfer — Coming soon.** No payment is collected. New orders and membership requests remain pending until reviewed. Membership approval is a manual academy decision.

Contact messages and newsletter subscriptions save locally. Registration works immediately in local mode; email delivery and email ownership verification are not connected.

## Organisation

- Root: Windows launchers and run.py.
- backend/server.py: server, customer API and database upgrades.
- backend/security.py: shared session identity and role policy.
- backend/accounts.py: registration, sign-in and sign-out.
- backend/members.py: athlete profiles, coach assignments, schedules and messages.
- backend/manager.py: academy manager API.
- backend/create_accounts.py: requested local account setup.
- frontend/login/: single sign-in and athlete registration page.
- frontend/athlete/, frontend/coach/, frontend/manager/: separate protected workspaces.
- frontend/auth.js: shared browser session handling.
- frontend/checkout/: checkout page. frontend/images/: website images.
- data/: private SQLite database, initial credentials and upgrade backups.
- tests/: backend, access and browser checks. docs/legacy/: unused original MySQL examples.

Existing IDs, memberships, orders, profiles and assignments are preserved during account renaming. Unrelated registered accounts retain their information. Old sessions are invalidated when shared session handling is installed.

Back up the data folder with the server stopped. Data and backend source are not served by the website. Keep project folders together when moving the app. RAISESPORT_PORT chooses another port; RAISESPORT_DATA chooses another absolute storage folder.

## Reset the requested accounts

With the server stopped, run from the project folder:

```
python backend/create_accounts.py --reset-requested
```

This restores the three listed passwords to password, preserves IDs and related records, and invalidates their sessions. Password changes inside dashboards do not update the initial credentials file automatically.

## Verification

Backend checks use temporary storage:

```
python tests/test_backend.py
python tests/test_memberships.py
python tests/test_migration.py
python tests/test_access.py
python tests/test_sessions.py
```

The browser check requires Playwright and installed Microsoft Edge:

```
node tests/test_role_flows.cjs
```

It covers all three logins, unauthorized page links, registration, shopping, coach assignment, membership approval, schedules, private notes, messages, mobile layout, cross-tab logout and account switching, and browser Back after logout.
