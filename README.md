# Bun Bun Manager

A point of sale and shop dashboard for Bun Bun. It runs entirely in the browser: nothing to install, no server.

**Open it locally:** double click `index.html`.

## What is in this folder
- `index.html`: the whole app
- `config.js`: settings (the remote activity log address goes here)
- `assets/`: logo, mascot and icons
- `activity-log-setup/Code.gs`: the Google Sheet receiver for the activity log (optional)

## Update the live site on GitHub Pages
1. Open your repository on github.com (for example `dashboard`).
2. Click **Add file > Upload files**.
3. Unzip this download, open the `bun-bun-manager` folder and drag **everything inside it** (`index.html`, `sync.js`, `sync-config.js`, `supabase-setup.sql`, `README.md`, the `assets` folder and the `activity-log-setup` folder) into the upload box. Do not upload the zip itself.
4. Scroll down, click **Commit changes**. Files with the same name are replaced automatically.
5. Wait about a minute, then open the site and press **Ctrl + F5** (Cmd + Shift + R on Mac) to skip the old cached copy.

If you already use this site, **do not upload `config.js`**: your existing one keeps your Google Sheet link. (This download leaves it out on purpose.)

## Record what testers do (activity log)
GitHub Pages cannot store data, so this uses a free Google Sheet as the receiver. About 5 minutes, once:
1. Create a new Google Sheet. Open **Extensions > Apps Script**.
2. Delete the sample code and paste the contents of `activity-log-setup/Code.gs`. Click **Save**.
3. Click **Deploy > New deployment**. Type: **Web app**. Execute as: **Me**. Who has access: **Anyone**. Click **Deploy** and allow access.
4. Copy the **Web app URL** (it ends in `/exec`).
5. On GitHub open `config.js`, click the pencil icon, paste the URL between the quotes after `logUrl:`, and commit.

From then on every device that opens the site sends events to your sheet, in a tab called **Activity**: logins, page views, orders (with items), price and menu changes, day closings, cancellations and any errors, along with a device ID and browser. The login screen shows a small "activity is recorded" notice while this is on.

Notes: anyone who knows the URL can send rows to your sheet, so only use it for demos. Events from before you set this up were only ever stored in the browser of the person who tested, so they cannot be recovered from here. If that friend still has the site open, they can use **Staff & settings > Backup** and send you the file.

## Languages
Staff & settings has a **Language** card (English, Sinhala, Tamil), and there is also a drop-down in the top bar. Menus, buttons, headings and labels are translated. Long help sentences and the guided tour stay in English. Please have a native speaker check the wording before showing it to customers.

## Search
Press **Ctrl + K** (or **/**) or click the search bar at the top to jump to any page, setting, action, customer, menu item or order.

## Reports
**Report center** has presets (today, yesterday, day before yesterday, this week, last week, last 7 or 30 days, this month, last month, this year, all time), a custom date range, and a "Missed a day?" list of the last 14 days. Closing the day also offers a report. The Excel files need an internet connection to build the styled version; offline you get a basic copy.

## Shared data and audit log on every device (Supabase)
Orders, menu, stock, customers, settings and the audit log are stored in a free Supabase project so every browser shows the same thing.
1. In Supabase open **SQL Editor > New snippet**, paste `supabase-setup.sql` and click **Run** (safe to run again).
2. `sync-config.js` holds the project URL and the **publishable** key. Never put a `secret` or `service_role` key in any file on GitHub.
3. Open the site on the device whose data you want to keep FIRST. It uploads its data to the cloud. Every other device then loads that copy.
4. A small badge at the bottom-right shows the status (Synced, Saving, Offline). Click it to sync now. **Staff & settings > Cloud sync** has buttons to push this browser's data to the cloud or replace this browser with the cloud copy.
5. Devices check for changes every few seconds. If two devices edit at once, changes to different items are merged; if both edit the same item, the one saving last wins. Order numbers are renumbered if two devices create the same one.
6. Every action (and logins, orders, page views, errors) is also stored in the `audit_log` table, which you can open in Supabase > Table Editor.

Demo-level security: anyone who has the site's key can read and write the data, and PINs are checked in the page, not on a server. Add real logins before selling this.
