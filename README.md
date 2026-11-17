# Bun Bun Manager

A point of sale and shop dashboard for Bun Bun. It runs entirely in the browser, so there is nothing to install and no server to run.

## Open it locally

Double click `index.html`. It works straight from the folder.

## Host it free on GitHub Pages

1. Create a new repository on GitHub (for example `bun-bun-manager`).
2. Upload everything in this folder: `index.html`, the `assets` folder and this README. Keep the `assets` folder next to `index.html`.
3. Open the repository, go to **Settings > Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**, pick the `main` branch and the `/ (root)` folder, then press **Save**.
5. After a minute your dashboard is live at `https://YOUR-USERNAME.github.io/bun-bun-manager/`.

## First login

| Account | PIN |
| --- | --- |
| Owner | 1111 |
| Reception (Cashier) | 2222 |

Change both PINs in **Staff & settings** as soon as you log in.

## Guided tour

The first time someone logs in on a device, a tour walks through every section and option. It shows once per role on each device. After that:

- Press the **?** button at the bottom of the sidebar for help on the page you are on.
- Press **Replay full tour** inside that help card to see the whole tour again.

## Good to know

- All data is saved in the browser of the device you use (localStorage). Each device has its own data.
- Go to **Staff & settings** and press **Backup** every week. **Restore** loads a backup on any device.
- PINs protect the screen, but this is a static site, so do not rely on them for strict security.
- Fonts load from Google Fonts and Excel export loads from cdnjs, so an internet connection is needed for those two.

## Files

```
index.html          the whole app
assets/logo.png     Bun Bun wordmark
assets/bun-bite.gif animated mascot
assets/burger.png   mascot still
assets/favicon.ico, icon-*.png   browser and phone icons
```
