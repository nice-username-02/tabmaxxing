const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-export-test-'));
  const context = await chromium.launchPersistentContext(profile, {headless:true, executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', ignoreDefaultArgs:['--disable-extensions'], args:['--enable-unsafe-extension-debugging'], viewport:{width:1100,height:900}});
  context.setDefaultTimeout(20000);
  try {
    const cdp = await context.browser().newBrowserCDPSession();
    const {id} = await cdp.send('Extensions.loadUnpacked', {path:path.resolve(__dirname,'..')});
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Poll extension APIs from the main world rather than Playwright's utility world.
    const waitFor = async (check, arg) => {
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        if (await page.evaluate(check, arg)) return;
        await new Promise(resolve => setTimeout(resolve,100));
      }
      throw new Error('Timed out: ' + check.toString());
    };
    await page.goto('chrome-extension://' + id + '/newtab.html');
    await page.locator('.cm-content').waitFor();
    await page.locator('#workspacesettingsbtn').click();
    assert.equal(await page.locator('#autoexport').isChecked(),false);
    assert.equal(await page.locator('#export-update').isDisabled(),true);
    assert.equal(await page.locator('#export-location').innerText(),'No folder selected');
    assert.equal(await page.locator('#export-default').count(),0);
    assert.equal(await page.locator('#export-status').innerText(),'Last updated: Never');
    await page.evaluate(() => chrome.storage.local.set({noteExport:{enabled:true,destination:'downloads'}}));
    await page.reload(); await page.locator('.cm-content').waitFor();
    await page.locator('.cm-content').fill('# Backup test\n\nUnicode ☕');
    await waitFor(async () => (await chrome.storage.local.get('note:original'))['note:original'] === '# Backup test\n\nUnicode ☕');
    await page.locator('#workspacesettingsbtn').click();
    assert.equal(await page.locator('#autoexport').isChecked(),false);
    // A real cloneable directory handle exercises picker wiring, IndexedDB and service worker writes.
    await page.evaluate(() => { window.showDirectoryPicker = async options => {
      if ('startIn' in options) throw new Error('Picker must not suggest Downloads');
      return (await navigator.storage.getDirectory()).getDirectoryHandle('Custom exports',{create:true});
    }; });
    await page.locator('#export-choose').click();
    await waitFor(() => !document.getElementById('export-update').disabled);
    assert.equal(await page.locator('#autoexport').isChecked(),false);
    await page.locator('#export-update').click();
    await waitFor(async () => !!(await chrome.storage.local.get('noteExportLastUpdated')).noteExportLastUpdated);
    const backupText = () => page.evaluate(async () => {
      const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('Custom exports');
      return (await (await directory.getFileHandle('Notes--original.md')).getFile()).text();
    });
    assert.equal(await backupText(),'# Backup test\n\nUnicode ☕');
    await waitFor(() => document.getElementById('export-status').textContent !== 'Last updated: Never' && !document.getElementById('export-update').disabled);
    assert.match(await page.locator('#export-status').innerText(),/^Last updated: .*\d/);
    const first = await page.evaluate(async () => (await chrome.storage.local.get('noteExportLastUpdated')).noteExportLastUpdated);
    await page.locator('#export-update').click();
    await waitFor(async first => (await chrome.storage.local.get('noteExportLastUpdated')).noteExportLastUpdated > first,first);
    await page.locator('#autoexport').check();
    await page.locator('#closeworkspacesettings').click();
    await page.locator('.cm-content').fill('Automatic backup');
    await waitFor(async () => {
      const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('Custom exports');
      return (await (await directory.getFileHandle('Notes--original.md')).getFile()).text().then(text => text === 'Automatic backup');
    });
    await page.reload(); await page.locator('.cm-content').waitFor();
    await page.locator('#workspacesettingsbtn').click();
    assert.equal(await page.locator('#autoexport').isChecked(),true);
    assert.equal(await page.locator('#export-location').innerText(),'Selected folder: Custom exports');
    assert.notEqual(await page.locator('#export-status').innerText(),'Last updated: Never');
    await page.evaluate(() => chrome.storage.local.remove('noteExportLastUpdated'));
    await page.evaluate(() => chrome.runtime.sendMessage({type:'exportNotes'}));
    await waitFor(() => document.getElementById('export-status').textContent !== 'Last updated: Never');
    await page.locator('#autoexport').uncheck();
    await page.locator('#closeworkspacesettings').click();
    await page.locator('.cm-content').fill('Local save only');
    await waitFor(async () => (await chrome.storage.local.get('note:original'))['note:original'] === 'Local save only');
    await page.waitForTimeout(2200);
    assert.equal(await backupText(),'Automatic backup');
    await page.locator('#workspacesettingsbtn').click();
    await page.locator('#export-update').click();
    await waitFor(async () => {
      const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('Custom exports');
      return (await (await directory.getFileHandle('Notes--original.md')).getFile()).text().then(text => text === 'Local save only');
    });
    assert.equal(await page.locator('#autoexport').isChecked(),false);
    assert.deepEqual(errors,[]);
    fs.mkdirSync(path.resolve(__dirname,'../test-results'),{recursive:true});
    await page.screenshot({path:path.resolve(__dirname,'../test-results/note-export-settings.png')});
    console.log('PASS: opt-in backups, required folder, legacy settings, manual update, timestamp, automatic writes, persisted directory and local autosave.');
  } finally { await context.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
