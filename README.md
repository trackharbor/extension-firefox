# TrackHarbor Spotify Headers · Firefox

The extension opens Spotify, detects a request to
`https://api-partner.spotify.com/pathfinder/v2/query`, copies **only**
`authorization` and `client-token`, displays a success dialog, and closes
the tab it created. If an error occurs, it displays the reason and closes the tab.
Other tabs are not affected. The extension runs only when you click its icon.

Requires **Firefox Desktop 142+**. No TrackHarbor server changes are needed.

## Quick temporary installation (no build required)

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…**.
3. Select `manifest.json` from this directory.
4. Find **TrackHarbor Spotify Headers** in the extensions menu (the puzzle icon).
   Optionally pin it to the toolbar.

The extension remains installed **until Firefox restarts**. After changing the source,
click **Reload** for the extension in `about:debugging`.

## Usage

1. Sign in to your account at [open.spotify.com](https://open.spotify.com/)
   using the same Firefox profile. Regular and private windows have separate sessions;
   use a regular window.
2. Click the extension icon. A new active Spotify tab opens.
3. Wait for the result dialog. The clipboard will contain:

   ```text
   authorization: Bearer <your token>
   client-token: <your client-token>
   ```

4. Open **Spotify** authentication in TrackHarbor, paste the entire text into the
   headers field, and save. No JSON, quotation marks, or cookies are needed.

The success dialog means the headers were captured and copied. The extension does
not validate them against the server; capture them again when the tokens expire.

### Troubleshooting

- The operation times out after **60 seconds**, then closes the tab.
- If no request appears, check that you are signed in. While the tab is open,
  you can navigate to your library or another Spotify section to trigger a request.
- Requests without a complete, valid pair of headers are skipped until the timeout.
- Manually closing the created tab interrupts the operation.
- A clipboard error means copying was not successful.
- If the result dialog cannot be opened, the tab still closes;
  hover over the extension icon (marked `!`) to see the reason.
- If Firefox prevents the tab from closing, the extension reports it; close the tab manually.
- Clicking again while an operation is running does not start another one.

## Build and checks

Requires **Node.js 22+** and npm. Run from the repository root:

```sh
npm ci
npm test
npm run lint
npm run build
```

`build` automatically reruns tests and lint before packaging. Output:
`web-ext-artifacts/trackharbor_spotify_headers-1.0.0.zip`.
The archive contains ready-to-use extension files; Node.js is not required to run it.
The source is not minified and does not require a separate compilation step.

You can select the ZIP for temporary installation through `about:debugging`.
No Mozilla signature is required for this.

Documentation: [webRequest](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest),
[clipboard](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Interact_with_the_clipboard),
[temporary installation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).
