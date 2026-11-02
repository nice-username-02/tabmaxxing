const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(fs.readFileSync(file));
});
(async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'note-import-'));
  fs.mkdirSync(path.join(folder, 'nested'));
  fs.writeFileSync(path.join(folder, 'Plan.md'), '# Imported ☕\n\n- [ ] Task\n');
  fs.writeFileSync(path.join(folder, 'nested', 'Plan.txt'), 'Second note');
  fs.writeFileSync(path.join(folder, 'skip.png'), 'not a note');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    const context = await browser.newContext({viewport: {width: 1440, height: 960}});
    const errors = [];
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    const url = `http://127.0.0.1:${server.address().port}/preview.html`;
    await page.goto(url);
    await page.locator('.cm-content').fill('Existing notes');
    await page.locator('#workspacesettingsbtn').click();
    assert.equal(await page.locator('#note-export-settings + #note-import-settings').count(), 1);
    const chooserPromise = page.waitForEvent('filechooser');
    await page.locator('#import-choose').click();
    await (await chooserPromise).setFiles(folder);
    await page.waitForFunction(() => document.getElementById('import-status').textContent === 'Imported 2 notes into new tabs.');
    await page.locator('#closeworkspacesettings').click();
    assert.equal(await page.getByRole('tab').count(), 3);
    assert.equal(await page.locator('.cm-content').innerText(), 'Existing notes');
    await page.getByRole('tab').nth(1).click();
    const selected = await page.getByRole('tab', {selected: true}).getAttribute('data-id');
    await page.waitForFunction(id => JSON.parse(localStorage.getItem('np:workspaceActiveTab')) === id, selected);
    const fresh = await context.newPage();
    await fresh.goto(url);
    await fresh.locator('.cm-content').waitFor();
    assert.equal(await fresh.getByRole('tab', {selected: true}).getAttribute('data-id'), selected);
    assert.match(await fresh.locator('.cm-content').innerText(), /Second note/);
    // A stale ID after deletion or migration falls back to an available note.
    await fresh.evaluate(() => localStorage.setItem('np:workspaceActiveTab', JSON.stringify('deleted')));
    await fresh.reload();
    await fresh.locator('.cm-content').waitFor();
    assert.equal(await fresh.getByRole('tab', {selected: true}).getAttribute('data-id'), 'original');
    assert.equal(await fresh.locator('.cm-content').innerText(), 'Existing notes');
    const data = await fresh.evaluate(() => JSON.parse(localStorage.getItem('np:workspaceTabs')).map(t => localStorage.getItem('np:note:' + t.id)));
    assert.ok(data.includes(JSON.stringify('# Imported ☕\n\n- [ ] Task\n')));
    assert.deepEqual(errors, []);
    console.log('PASS: folder picker import, nested files, preserved notes, fresh-window tab restoration and stale-tab fallback.');
  } finally {
    await browser?.close();
    server.close();
    fs.rmSync(folder, {recursive: true, force: true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
