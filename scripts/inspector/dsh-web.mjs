// Launch an isolated native DSH Web profile. With --smoke the test owns a fresh project and
// writes real Work events while its browser is open. With --deployment it opens the supplied project.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { loadDeploymentProfile } from '../../dist/src/advanced.js';
import { openInDefaultBrowser } from '../../host/dsh/lib/browser.js';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const opts = process.argv.slice(2);
const smoke = opts.includes('--smoke');
const arg = name => opts.find(v => v.startsWith('--' + name + '='))?.split('=').slice(1).join('=');
const readback = arg('readback');
if (readback && (!arg('deployment') || !arg('result') || smoke)) throw new Error('Readback requires a deployment, acceptance file and result path.');
if (smoke === Boolean(arg('deployment'))) throw new Error('Choose --smoke or --deployment=<project profile JSON>.');
const defaultRoot = () => process.platform === 'win32' ? join(process.env.APPDATA, 'npm/node_modules') : execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
const bin = resolve(arg('dsh-bin') ?? process.env.DSH_BIN ?? join(defaultRoot(), '@deepseek-ai/dsh/lib/bin.js'));
if (!existsSync(bin)) throw new Error('Supply the installed DSH lib/bin.js with --dsh-bin.');
const home = mkdtempSync(join(tmpdir(), 'dsh-palimpsest-inspector-'));
const nm = join(home, 'profiles/node_modules');
const directory = join(home, 'profiles/inspector');
mkdirSync(directory, { recursive: true });
mkdirSync(nm, { recursive: true });
cpSync(join(repo, 'host/dsh'), join(nm, 'palimpsest-dsh-host'), { recursive: true });
for (const dep of ['@deepseek-ai', 'commander']) {
  const modules = join(dirname(dirname(bin)), 'node_modules');
  symlinkSync(join(modules, dep), join(nm, dep), process.platform === 'win32' ? 'junction' : 'dir');
}
const writeJson = (path, obj) => writeFileSync(path, JSON.stringify(obj, null, 2));
const deployment = smoke ? join(home, 'deployment.json') : resolve(arg('deployment'));
if (smoke) {
  const state = join(home, 'project');
  mkdirSync(state);
  const repository = join(home, 'worktree');
  mkdirSync(repository);
  execFileSync('git', ['init', '--quiet'], { cwd: repository });
  execFileSync('git', ['-c', 'user.name=Palimpsest fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '--quiet', '--allow-empty', '--no-gpg-sign', '-m', 'Initialize inspection fixture'], { cwd: repository });
  const databases = Object.fromEntries(['orchestration','ordarium','coordination','transportCursors','runtimeScope','projectJournal','projectAssociations']
    .map(k => [k, join(state, k + '.sqlite')]));
  writeJson(deployment, { schemaVersion: 1, profileId: 'inspect-test', projectId: 'inspect-test', localPeer: 'project-peer', repository, execution: 'in-place',
    databases, transport: { namespace: 'inspector-test', databasePath: join(state, 'transport.sqlite') }, reasoning: {} });
}
const profile = loadDeploymentProfile(deployment);
writeJson(join(directory, 'package.json'), { name: 'dsh-profile-inspector', private: true,
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'palimpsest-dsh-host'], patchReload: 'startup' } } });
const pathValue = p => JSON.stringify(p.replaceAll('\\', '/'));
writeFileSync(join(directory, 'cordis.patch.yml'), [
  '- id: palimpsest-startup', '  disabled: true', '- id: palimpsest-runner', '  disabled: true',
  '- id: ui-settings-models', '  config:', '    credentialOnboarding: false',
  '- id: palimpsest-tools', '  config:', '    palimpsestEntry: ' + pathValue(join(repo, 'dist/src/advanced.js')),
  '    deploymentProfile: ' + pathValue(deployment), '    serve: ' + Boolean(readback), '    openDashboard: false', '',
].join('\n'));

const proc = spawn(process.execPath, [bin, '--profile', 'inspector', '--port', '0', '--no-open'], {
  cwd: home, env: { ...process.env, DSH_HOME: home }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '', browser, page, closed = false;
const stopped = once(proc, 'exit').then(() => { closed = true; });
function stopHost() {
  if (closed || proc.exitCode !== null || proc.signalCode !== null) return;
  // DSH may start a child carrier on Windows. Release the profile's SQLite handles as well.
  if (process.platform === 'win32' && Number.isInteger(proc.pid)) {
    try { execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); return; }
    catch { /* the child may already have exited */ }
  }
  proc.kill();
}
for (const out of [proc.stdout, proc.stderr]) out.on('data', chunk => { logs = (logs + chunk).slice(-160000); });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const deadline = Date.now() + 90_000;
try {
  let address;
  while (!address && !closed && Date.now() < deadline) {
    address = logs.match(/dsh web:\s+(https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+[^\s\x1b]*)/)?.[1];
    if (!address) await sleep(250);
  }
  if (!address) throw new Error('DSH did not publish its listening address.');
  if (readback) {
    const { chromium } = await import('@playwright/test');
    const { inspectAccepted } = await import('./cold-readback.mjs');
    browser = await chromium.launch();
    const result = await inspectAccepted(browser, address, () => {
      const line = logs.match(/PALIMPSEST_DASHBOARD (\{[^\r\n]+\})/u);
      return line && JSON.parse(line[1]).url;
    }, JSON.parse(readFileSync(resolve(readback), 'utf8')), arg('screenshots'));
    writeFileSync(resolve(arg('result')), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log('PASS · cold sidebar and Workspace', result.head, result.noteId);
  } else if (!smoke) {
    const manual = opts.includes('--no-open');
    const opened = !manual && openInDefaultBrowser(address);
    console.log('DSH Web · ' + profile.projectId + '\n' + (opened ? new URL(address).origin : address));
    console.log('在 DSH 左侧栏选择 Palimpsest。按 Ctrl+C 关闭本次宿主。');
    process.on('SIGINT', stopHost);
    process.on('SIGTERM', stopHost);
    await stopped;
  } else {
    const { chromium } = await import('@playwright/test');
    const captures = arg('screenshots');
    if (captures) mkdirSync(resolve(captures), { recursive: true });
    const snapshot = async (surface, filename) => {
      if (captures) await surface.screenshot({ path: join(resolve(captures), filename + '.png'), animations: 'disabled' });
    };
    const fixture = action => JSON.parse(execFileSync(process.execPath,
      [join(repo, 'scripts/inspector/work-fixture.mjs'), deployment, action],
      { cwd: home, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'] }));
    const unauthenticated = await fetch(new URL('/api/palimpsest/inspector?view=live', address));
    assert.ok([401, 403].includes(unauthenticated.status), 'a browser without the owner credential must be refused');
    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', locale: 'zh-CN' });
    const pageErrors = [];
    page.on('pageerror', e => { pageErrors.push(e.message); logs += '\nBrowser: ' + e.message; });
    page.on('console', m => {
      if (m.type() === 'error' && /same key|unique "key"/i.test(m.text())) pageErrors.push(m.text());
    });
    await page.goto(address);
    const panel = page.getByRole('button', { name: 'Palimpsest', exact: true });
    const intro = page.getByRole('button', { name: /^(继续|Continue)$/ });
    await page.addLocatorHandler(intro, () => intro.click(), { times: 1 });
    await panel.click({ timeout: 45_000 });
    const surface = page.getByRole('region', { name: 'Palimpsest 工作检查器' });
    await surface.getByText('尚未建档', { exact: true }).waitFor();
    fixture('start');
    await surface.getByRole('button', { name: /任务 核对现场读数/ }).waitFor();
    await surface.getByRole('button', { name: '暂停跟随' }).click();
    const state = await surface.locator('.pi-graph').textContent();
    const attemptId = fixture('claim');
    await surface.getByRole('button', { name: /返回实时 \+[1-9]/ }).waitFor();
    assert.equal(await surface.locator('.pi-graph').textContent(), state);
    await snapshot(surface, 'pinned-dark');
    await surface.getByRole('button', { name: /返回实时/ }).click();
    await surface.getByRole('button', { name: /执行尝试 .*RUNNING/ }).waitFor();
    const edgeCount = await surface.locator('.pi-link').count();
    assert.match(await surface.locator('.pi-count').innerText(), new RegExp(edgeCount + ' 条关系$'));
    await snapshot(surface, 'live-dark');
    const reading = surface.getByRole('button', { name: /任务 核对现场读数/ });
    const project = surface.getByRole('button', { name: /^项目 inspect-test/ });
    await reading.hover();
    assert.ok(await surface.locator('.pi-link.pi-hot').count() > 0);
    assert.ok(await surface.locator('.pi-link.pi-distant').count() > 0);
    await reading.click();
    const incident = await surface.locator('.pi-link.pi-hot').evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label')));
    await project.hover();
    assert.deepEqual(await surface.locator('.pi-link.pi-hot').evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label'))), incident);
    await surface.getByRole('button', { name: '相邻关系', exact: true }).click();
    assert.equal(await project.count(), 0);
    await surface.getByRole('button', { name: '相邻关系', exact: true }).click();
    assert.equal(await surface.locator('.pi-link').count(), edgeCount, 'showing all neighbors again must not leave stale SVG paths');
    await snapshot(surface, 'focus-dark');
    if (captures) await page.screenshot({ path: join(resolve(captures), 'dsh-desktop.png'), animations: 'disabled' });
    await surface.locator('.pi-link.pi-hot').first().press('Enter');
    await surface.getByRole('complementary', { name: '对象检查' }).getByText('起点', { exact: true }).waitFor();
    const search = surface.getByRole('searchbox', { name: '查找对象' });
    await surface.locator('.pi-surface').focus();
    await page.keyboard.press('/');
    assert.equal(await search.evaluate(el => el === document.activeElement), true);
    await search.fill('两座站点');
    await search.press('Enter');
    await surface.getByRole('complementary', { name: '对象检查' }).getByRole('heading', { name: /两座站点/ }).waitFor();
    await search.fill('does-not-match-any-object');
    await surface.getByText('没有匹配对象', { exact: true }).waitFor();
    await search.press('Escape');
    await surface.getByRole('button', { name: '关闭对象检查' }).click();
    await surface.getByRole('button', { name: 'Work 事件' }).click();
    await surface.getByRole('button', { name: /#1\s.*PROJECT_CREATED/ }).click();
    await surface.getByText('Work 账本重建 · #1', { exact: true }).waitFor();
    assert.equal(await surface.getByRole('button', { name: /执行尝试/ }).count(), 0);
    await surface.getByRole('button', { name: /返回实时/ }).click();
    await surface.getByRole('button', { name: /执行尝试 .*RUNNING/ }).click();
    await surface.getByRole('complementary', { name: '对象检查' }).getByText(attemptId, { exact: true }).first().waitFor();
    await snapshot(surface, 'detail-dark');
    const tail = fixture('tail');
    const canvasColor = () => surface.locator('.pi-surface').evaluate(el => getComputedStyle(el).backgroundColor);
    const dark = await canvasColor();
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForFunction(() => document.documentElement.style.colorScheme === 'light');
    assert.notEqual(await canvasColor(), dark, 'the inspector must follow the actual DSH appearance');
    await snapshot(surface, 'detail-light');
    await surface.getByRole('button', { name: '关闭对象检查' }).click();
    await surface.getByRole('button', { name: '现场观察', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    const canvas = surface.locator('.pi-surface');
    await page.waitForFunction(() => {
      const el = document.querySelector('.pi-surface');
      return el && el.clientWidth < 500 && el.scrollWidth <= el.clientWidth + 1;
    });
    const roots = await surface.locator('.pi-node').evaluateAll(nodes => nodes.map(n => n.transform.baseVal.getItem(0).matrix.e));
    assert.equal(new Set(roots).size, 2, 'the narrow canvas must fit two columns');
    assert.equal(await surface.locator('.pi-link').count(), edgeCount, 'resizing and history navigation must draw each current edge exactly once');
    await surface.getByRole('button', { name: '放大关系图' }).click();
    assert.ok(await canvas.evaluate(el => el.scrollWidth > el.clientWidth));
    await surface.getByRole('button', { name: '重置缩放' }).click();
    await snapshot(surface, 'narrow-light');
    await sleep(2000);
    assert.deepEqual(fixture('tail'), tail);
    assert.deepEqual(pageErrors, []);
    console.log('PASS · native sidebar, read-only history, focus and search, two DSH appearances and narrow layout.');
  }
} catch (error) {
  console.error('Inspector:', error.message);
  // Sufficient diagnostics for load failures, without streaming process-token URLs or unrelated DSH configuration.
  const diagnostic = logs.split(/\r?\n/).filter(line => /error|warn|failed|unavailable|Browser:|palimpsest-tools/i.test(line)).slice(-20);
  console.error(diagnostic.join('\n').replace(/(https?:\/\/[^\s?]+)\?\S+/g, '$1'));
  if (smoke && page) console.error('DSH view:', (await page.locator('body').innerText()).slice(-1500));
  throw error;
} finally {
  await browser?.close();
  if (!closed) { stopHost(); await stopped; }
  // Only this invocation's mkdtemp home is removed. The external deployment is outside it.
  if (dirname(realpathSync(home)) !== realpathSync(tmpdir())) throw new Error('Unexpected temporary profile location.');
  await rm(home, { recursive: true, force: true, maxRetries: 6, retryDelay: 300 }).catch(e => {
    console.warn('Temporary DSH profile retained:', home, e.code);
  });
}
