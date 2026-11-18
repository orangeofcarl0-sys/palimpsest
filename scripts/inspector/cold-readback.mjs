import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Expectations belong to Playwright. Neither product receives them as page data.
export async function inspectAccepted(browser, address, workspaceAddress, accepted, captures) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const { acceptedHead: head, note, recorded } = accepted;
  if (captures) mkdirSync(captures, { recursive: true });
  await page.goto(address);
  const intro = page.getByRole('button', { name: /^(继续|Continue)$/ });
  await page.addLocatorHandler(intro, () => intro.click(), { times: 1 });
  const live = page.waitForResponse(r => new URL(r.url()).pathname === '/api/palimpsest/inspector' && r.ok());
  await page.getByRole('button', { name: 'Palimpsest', exact: true }).click();
  const projection = (await (await live).json()).value;
  assert(projection.epoch);
  const frame = projection.frame.state;
  const n = frame.nodes.find(n => n.kind === '项目版本' && n.ref === head);
  const record = frame.nodes.find(n => n.kind === '版本依据' && n.ref === note.id);
  assert(n && record && frame.edges.some(e => e.from === n.id && e.to === record.id));
  const panel = page.getByRole('region', { name: 'Palimpsest 工作检查器' });
  await panel.getByRole('button', { name: '项目版本 ' + head.slice(0,12), exact: false }).click();
  const detail = panel.getByRole('complementary', { name: '对象检查' });
  await detail.getByText(head, { exact: true }).first().waitFor();
  await panel.getByRole('button', { name: '版本依据 ' + note.title, exact: false }).click();
  await detail.getByText(note.id, { exact: true }).waitFor();
  const sidebarText = await detail.innerText();
  for (const line of note.body.split('\n')) assert(sidebarText.includes(line));
  const sidebarDecisions = frame.nodes.filter(n => n.kind === '贡献决定').map(n => n.ref).sort();
  assert.deepEqual(sidebarDecisions, recorded.map(d => d.decisionId).sort());
  if (captures) await page.screenshot({ path: join(captures,'sidebar.png') });

  const work = await context.newPage();
  const url = workspaceAddress();
  assert(url && ['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname));
  await work.goto(url);
  await work.getByTestId('project-home').waitFor();
  await work.getByText('technical details（digest · head commit · project id）', { exact: true }).click();
  await work.getByText(head, { exact: true }).first().waitFor();
  await work.getByRole('button', { name:'Assets', exact:true }).click();
  const row = work.getByTestId('journal-entry-row').filter({hasText: note.id});
  await row.locator('summary').click();
  const body = await row.innerText();
  assert(body.includes(head) && body.includes(note.body));
  if (captures) await work.screenshot({ path:join(captures,'workspace.png') });
  for (const decision of recorded) {
    const source = work.getByTestId('journal-entry-row').filter({hasText: decision.decisionId}).filter({hasNotText:note.title}).first();
    await source.locator('summary').click();
    assert((await source.innerText()).includes(decision.note));
  }
  assert.deepEqual(errors, []);
  await context.close();
  return { bothSurfaces:true, head:n.ref, noteId:record.ref, epoch:projection.epoch, decisionIds:sidebarDecisions,
    sidebarVersionId:n.id, sidebarNoteId:record.id, workspaceJournal:true, observedAt:new Date().toISOString() };
}
