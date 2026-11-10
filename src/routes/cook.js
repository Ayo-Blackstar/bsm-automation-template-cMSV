const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { sendDiscordMessage, createEmbed, COLORS } = require('../utils/discord');

const seen = new Map();
const WINDOW = 24 * 60 * 60 * 1000;
function isDuplicate(id) {
  if (!id) return false;
  const now = Date.now();
  if (seen.has(id) && now - seen.get(id) < WINDOW) return true;
  seen.set(id, now);
  for (const [k, t] of seen) if (now - t > WINDOW) seen.delete(k);
  return false;
}

function verify(req) {
  const key = process.env.COOK_WEBHOOK_PUBLIC_KEY;
  if (!key) return true;
  const id = req.get('webhook-id'), ts = req.get('webhook-timestamp'), sig = req.get('webhook-signature') || '';
  if (!id || !ts || !req.rawBody) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 600) return false;
  const raw = Buffer.from(key.replace(/^whpk_/, ''), 'base64');
  const pub = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]), format: 'der', type: 'spki' });
  const msg = Buffer.from(`${id}.${ts}.${req.rawBody}`);
  return sig.split(' ').some(s => {
    const [v, b64] = s.split(',');
    return v === 'v1a' && b64 && crypto.verify(null, msg, pub, Buffer.from(b64, 'base64'));
  });
}

const LABELS = {
  first_name: 'First Name', last_name: 'Last Name', email: 'Email', phone: 'Phone',
  company: 'Company', what_do_you_sell: 'What They Sell', ideal_buyer: 'Ideal Buyer',
  website_or_funnel_url: 'Website / Funnel', monthly_ad_spend: 'Monthly Ad Spend',
  monthly_revenue: 'Monthly Revenue', typical_price_of_your_main_offer: 'Offer Price',
  biggest_problem_right_now: 'Biggest Problem',
};

function answersFrom(data) {
  const a = data.answers || data.values || data.fields || data.data || data;
  if (Array.isArray(a)) return Object.fromEntries(a.map(x => [x.key || x.name || x.id || x.label, x.value ?? x.answer]));
  return a;
}

router.post('/new-lead', async (req, res) => {
  try {
    if (!verify(req)) return res.status(401).json({ error: 'bad signature' });
    const { type, data = {} } = req.body || {};
    if (type && type !== 'form.submitted') return res.json({ skipped: type });
    const formId = process.env.COOK_FORM_ID;
    if (formId && data.formId && data.formId !== formId) return res.json({ skipped: 'other form' });
    if (isDuplicate(req.get('webhook-id') || data.submissionId)) return res.json({ skipped: 'duplicate' });

    const a = answersFrom(data);
    const revenue = String(a.monthly_revenue || '');
    const qualified = revenue !== '' && !/under\s*\$?10k/i.test(revenue);
    const name = `${a.first_name || ''} ${a.last_name || ''}`.trim() || a.email || 'New lead';
    const fields = [{ name: 'Time', value: new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' }), inline: true },
                    { name: 'Name', value: name, inline: true }];
    for (const [k, label] of Object.entries(LABELS)) {
      if (k === 'first_name' || k === 'last_name') continue;
      if (a[k]) fields.push({ name: label, value: String(a[k]), inline: k !== 'biggest_problem_right_now' });
    }
    const utm = a.utm_data || data.utm || data.tracking;
    if (utm) fields.push({ name: 'ATTRIBUTION', value: typeof utm === 'object' ? Object.entries(utm).map(([k, v]) => k + ': ' + v).join('\n') : String(utm), inline: false });

    const embed = createEmbed(qualified ? '🟢 Mystery Shop Application - QUALIFIED' : '🔵 Mystery Shop Application - UNQUALIFIED',
      fields, qualified ? COLORS.GREEN : COLORS.BLUE);
    await sendDiscordMessage(process.env.DISCORD_WEBHOOK_NEW_LEADS, embed);
    res.json({ success: true, qualified });
  } catch (err) {
    console.error('Cook webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
