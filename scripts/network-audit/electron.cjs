// This harness is only for a disposable Linux CI desktop. Never run it in a
// user's desktop session: the real application polls the desktop clipboard.
if (process.platform !== 'linux' || process.env.CI !== 'true' || !process.env.BRANTA_AUDIT_PROFILE) {
  throw new Error('Requires Linux CI and an isolated audit profile (use run.sh).');
}
const { app, clipboard, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
// Match `electron .`: relative loadFile paths belong to the project, not the
// directory containing this test entry point.
app.setAppPath(path.resolve(__dirname, '../..'));
app.setPath('userData', process.env.BRANTA_AUDIT_PROFILE);
app.commandLine.appendSwitch('password-store', 'basic');
// Hosted CI has no OS keyring. Enable Electron's documented basic_text fallback
// only in this disposable test profile, which contains public fixture data.
app.on('ready', () => safeStorage.setUsePlainTextEncryption(true));
let finished = false;
const fail = error => {
  console.error(error);
  app.exit(1);
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
process.on('unhandledRejection', fail);
process.on('uncaughtException', fail);
app.on('browser-window-created', (_event, window) => {
  window.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame) fail(new Error(`Page load failed: ${code} ${description} ${url}`));
  });
  window.webContents.on('did-finish-load', async () => {
    // Angular may already have replaced index.html with the /clipboard route.
    // The splash page lives in resources/, outside the production bundle path.
    if (!window.webContents.getURL().includes('/dist/branta/browser/')) return;
    try {
      // Loading a splash page is not enough: require the actual Angular UI.
      let bootstrapped = false;
      for (let i = 0; i < 100; i++) {
        bootstrapped = await window.webContents.executeJavaScript('!!document.querySelector("app-root[ng-version] .app-navigation, app-root[ng-version] app-navigation")');
        if (bootstrapped) break;
        await delay(100);
      }
      if (!bootstrapped) throw new Error('Angular UI did not bootstrap');
      console.log('SCENARIO: production UI bootstrapped with empty profile');
      // Exercise the real clipboard polling and rendering path, using a public
      // constant explicitly special-cased by Branta, never an operator address.
      clipboard.writeText('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      let recognized = false;
      for (let i = 0; i < 100; i++) {
        recognized = await window.webContents.executeJavaScript('document.body.innerText.includes("Genesis Block")');
        if (recognized) break;
        await delay(100);
      }
      if (!recognized) throw new Error('Synthetic clipboard input was not rendered');
      console.log('SCENARIO: synthetic genesis-address clipboard input recognized');
      const historyPersisted = await window.webContents.executeJavaScript(`
        window.electron.retrieveData('history').then(items =>
          items.some(item => item.value === '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'))
      `);
      if (!historyPersisted) throw new Error('Synthetic clipboard history did not persist');
      console.log('SCENARIO: synthetic history persisted and read back');
      await delay(5000);
      fs.writeFileSync(path.join(process.env.BRANTA_AUDIT_OUTPUT, 'scenario.json'), JSON.stringify({
        productionUiLoaded: true, syntheticClipboardRecognized: true,
        syntheticHistoryPersisted: true, storageBackend: safeStorage.getSelectedStorageBackend(),
        observationAfterInputMs: 5000,
      }, null, 2));
      finished = true;
      app.exit(0);
    } catch (error) { fail(error); }
  });
});
app.on('will-quit', () => { if (!finished) process.exitCode = 1; });
setTimeout(() => fail(new Error('Audit scenario timed out')), 45000).unref();
// Run the real compiled main entry, preload, renderer and network subprocess.
require('../../build/app/main.js');
