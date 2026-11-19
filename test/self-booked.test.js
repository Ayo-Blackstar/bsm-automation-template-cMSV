// Run: node test/self-booked.test.js  (no network: discord/slack/sheets are stubbed)
const assert = require('assert');
const path = require('path');
const sent = [];
for (const m of ['discord', 'slack']) {
  const f = require.resolve(path.join('..', 'src', 'utils', m));
  const real = require(f);
  require.cache[f].exports = {
    ...real,
    sendDiscordMessage: async (url, embed) => { sent.push({ url, embed }); },
    sendSlackMessage: async () => {},
  };
}
delete process.env.GOOGLE_SHEET_ID;
const express = require('express');
const router = require('../src/routes/ghl');
const app = express();
app.use(express.json());
app.use('/ghl', router);
const body = { contact_id: 'test', full_name: 'Cook Test', email: 't@example.com', phone: '+15555550100', country: 'US', timezone: 'America/New_York', contact_source: 'Cleaning Growth Consultation', pipeline_name: 'Local Service Businesses' };
const srv = app.listen(0, async () => {
  const url = `http://127.0.0.1:${srv.address().port}/ghl/self-booked`;
  const post = () => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  try {
    assert.deepStrictEqual(await post(), { success: true });
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].embed.embeds ? sent[0].embed.embeds[0].title : sent[0].embed.title, '🟢 New Call Booked - SELF BOOKED');
    assert.strictEqual((await post()).skipped, 'duplicate');
    console.log('PASS title:', JSON.stringify(sent[0].embed).slice(0, 200));
  } catch (e) { console.error('FAIL', e); process.exitCode = 1; }
  srv.close();
});
