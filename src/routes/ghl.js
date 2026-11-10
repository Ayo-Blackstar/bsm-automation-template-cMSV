const express = require('express');
const router = express.Router();
const { sendDiscordMessage, createEmbed, COLORS } = require('../utils/discord');
const { sendSlackMessage } = require('../utils/slack');
const { google } = require('googleapis');

const recentNotifications = new Map();
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

function isDuplicate(key) {
  const now = Date.now();
  if (recentNotifications.has(key)) {
    const timestamp = recentNotifications.get(key);
    if (now - timestamp < DEDUP_WINDOW_MS) {
      console.log(`Duplicate blocked: ${key}`);
      return true;
    }
  }
  recentNotifications.set(key, now);
  for (const [k, t] of recentNotifications.entries()) {
    if (now - t > DEDUP_WINDOW_MS) recentNotifications.delete(k);
  }
  return false;
}

async function getSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

function getContactGHLLink(contactId) {
  const locationId = process.env.GHL_LOCATION_ID;
  return `https://app.gohighlevel.com/v2/location/${locationId}/contacts/detail/${contactId}`;
}

function buildCallFields(body, stage) {
  const contactId = body.contact_id || body.contactId || '';
  const fullName = body.full_name ||
    `${body.first_name || ''} ${body.last_name || ''}`.trim() ||
    body.contact_name || 'Unknown';
  const ghlLink = getContactGHLLink(contactId);

  const fields = [
    { name: 'Stage', value: stage, inline: true },
    { name: 'Name', value: `[${fullName}](${ghlLink})`, inline: true },
    { name: 'Email', value: body.email || '', inline: true },
    { name: 'Phone', value: body.phone || '', inline: true },
    { name: 'Tags', value: body.tags || '', inline: true },
    { name: 'Country', value: body.country || '', inline: true },
    { name: 'Timezone', value: body.timezone || '', inline: true },
    { name: 'Date_created', value: body.date_created || '', inline: true },
    { name: 'Contact_source', value: body.contact_source || '', inline: true },
    { name: 'Opportunity_value', value: body.opportunity_value || '', inline: true },
    { name: 'Pipeline_name', value: body.pipeline_name || '', inline: true },
    { name: 'Owner', value: body.assigned_user || '', inline: true },
  ];

  if (body.booked_by) fields.push({ name: '📋 Booked By (Setter)', value: body.booked_by, inline: true });
  if (body.assigned_to) fields.push({ name: '📞 Assigned To (Closer)', value: body.assigned_to, inline: true });
  if (body.rescheduled_by) fields.push({ name: '🔁 Rescheduled By', value: body.rescheduled_by, inline: true });
  if (body.closed_by) fields.push({ name: '🏆 Closed By', value: body.closed_by, inline: true });

  return fields;
}

function buildStageFields(body, stage) {
  const contactId = body.contact_id || body.contactId || '';
  const fullName = body.full_name ||
    `${body.first_name || ''} ${body.last_name || ''}`.trim() ||
    body.contact_name || 'Unknown';
  const ghlLink = getContactGHLLink(contactId);

  const fields = [
    { name: 'Stage', value: stage, inline: true },
    { name: 'Name', value: `[${fullName}](${ghlLink})`, inline: true },
    { name: 'Email', value: body.email || '', inline: true },
    { name: 'Phone', value: body.phone || '', inline: true },
    { name: 'Tags', value: body.tags || '', inline: true },
    { name: 'Country', value: body.country || '', inline: true },
    { name: 'Timezone', value: body.timezone || '', inline: true },
    { name: 'Date_created', value: body.date_created || '', inline: true },
    { name: 'Contact_source', value: body.contact_source || '', inline: true },
    { name: 'Opportunity_value', value: body.opportunity_value || '', inline: true },
    { name: 'Pipeline_name', value: body.pipeline_name || '', inline: true },
    { name: 'Owner', value: body.assigned_user || '', inline: true },
  ];

  if (body.booked_by) fields.push({ name: '📋 Booked By (Setter)', value: body.booked_by, inline: true });
  if (body.assigned_to) fields.push({ name: '📞 Assigned To (Closer)', value: body.assigned_to, inline: true });
  if (body.rescheduled_by) fields.push({ name: '🔁 Rescheduled By', value: body.rescheduled_by, inline: true });
  if (body.closed_by) fields.push({ name: '🏆 Closed By', value: body.closed_by, inline: true });

  return fields;
}

async function addToSheet(body) {
  try {
    const sheets = await getSheets();
    const spreadsheetId = process.env.REVENUE_SHEET_ID;
    const sheetName = process.env.REVENUE_SHEET_NAME || 'Sales CRM';
    const now = new Date().toLocaleDateString('en-GB');
    const contactId = body.contact_id || body.contactId || '';
    const profileLink = getContactGHLLink(contactId);
    const contactName = body.contact_name || body.full_name ||
      `${body.first_name || ''} ${body.last_name || ''}`.trim() || '';

    const row = [
      contactName,
      body.email || '',
      now,
      body.calendar_name || body.contact_source || '',
      profileLink,
      now,
      body.appointment_date || '',
      '', '', '', '', '', '',
      body.appointment_id || '',
      '',
      body.assigned_user || '',
      body.timezone || '',
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:Q`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [row] },
    });
    console.log('Sheet updated successfully');
  } catch (err) {
    console.error('Google Sheets error:', err.message);
  }
}

router.post('/booked-call', async (req, res) => {
  try {
    console.log('BOOKED-CALL PAYLOAD:', JSON.stringify(req.body));
    const contactId = req.body.contact_id || req.body.contactId || '';
    const dedupKey = `booked-${contactId}-${req.body.email || ''}`;
    if (isDuplicate(dedupKey)) return res.json({ success: true, skipped: 'duplicate' });

    // Setter booked — purple colour
    const embed = createEmbed('🟣 New Call Booked - SETTER BOOKED', buildCallFields(req.body, 'Call Booked'), COLORS.PURPLE);
    await sendDiscordMessage(process.env.DISCORD_WEBHOOK_BOOKED_CALLS, embed);
    await sendSlackMessage(process.env.SLACK_WEBHOOK_BOOKED_CALLS, embed);
    await addToSheet(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/confirmed-call', async (req, res) => {
  try {
    const contactId = req.body.contact_id || req.body.contactId || '';
    const dedupKey = `confirmed-${contactId}`;
    if (isDuplicate(dedupKey)) return res.json({ success: true, skipped: 'duplicate' });
    const embed = createEmbed('✅ Pipeline: Confirmed Call', buildStageFields(req.body, 'Confirmed'), COLORS.GREEN);
    await sendDiscordMessage(process.env.DISCORD_WEBHOOK_CONFIRMED_CALLS, embed);
    await sendSlackMessage(process.env.SLACK_WEBHOOK_CONFIRMED_CALLS, embed);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/no-show', async (req, res) => {
  try {
    const contactId = req.body.contact_id || req.body.contactId || '';
    const dedupKey = `noshow-${contactId}`;
    if (isDuplicate(dedupKey)) return res.json({ success: true, skipped: 'duplicate' });
    const embed = createEmbed('❌ Pipeline: No Show', buildStageFields(req.body, 'No Show'), COLORS.RED);
    await sendDiscordMessage(process.env.DISCORD_WEBHOOK_NO_SHOW, embed);
    await sendSlackMessage(process.env.SLACK_WEBHOOK_NO_SHOW, embed);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/follow-up', async (req, res) => {
  try {
    const contactId = req.body.contact_id || req.body.contactId || '';
    const dedupKey = `followup-${contactId}`;
    if (isDuplicate(dedupKey)) return res.json({ success: true, skipped: 'duplicate' });
    const embed = createEmbed('🔄 Pipeline: Follow Up', buildStageFields(req.body, 'Follow Up'), COLORS.YELLOW);
    await sendDiscordMessage(process.env.DISCORD_WEBHOOK_FOLLOW_UP, embed);
    await sendSlackMessage(process.env.SLACK_WEBHOOK_FOLLOW_UP, embed);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/cancelled', async (req, res) => {
  try {
    const contactId = req.body.contact_id || req.body.contactId || '';
    const dedupKey = `cancelled-${contactId}`;
    if (isDuplicate(dedupKey)) return res.json({ success: true, skipped: 'duplicate' });
    const embed = createEmbed('🚫 Pipeline: Booking Cancelled', buildStageFields(req.body, 'Booking Cancelled'), COLORS.ORANGE);
    await sendDiscordMessage(process.env.DISCORD_WEBHOOK_CANCELLED, embed);
    await sendSlackMessage(process.env.SLACK_WEBHOOK_CANCELLED, embed);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rescheduled', async (req, res) => {
  try {
    const contactId = req.body.contact_id || req.body.contactId || '';
    const dedupKey = `rescheduled-${contactId}`;
    if (isDuplicate(dedupKey)) return res.json({ success: true, skipped: 'duplicate' });
    const embed = createEmbed('🔁 Pipeline: Rescheduled', buildStageFields(req.body, 'Rescheduled'), COLORS.BLUE);
    await sendDiscordMessage(process.env.DISCORD_WEBHOOK_RESCHEDULED, embed);
    await sendSlackMessage(process.env.SLACK_WEBHOOK_RESCHEDULED, embed);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/second-call', async (req, res) => {
  try {
    const contactId = req.body.contact_id || req.body.contactId || '';
    const dedupKey = `secondcall-${contactId}`;
    if (isDuplicate(dedupKey)) return res.json({ success: true, skipped: 'duplicate' });
    const embed = createEmbed('📲 Pipeline: 2nd Call', buildStageFields(req.body, '2nd Call'), COLORS.BLUE);
    await sendDiscordMessage(process.env.DISCORD_WEBHOOK_SECOND_CALL, embed);
    await sendSlackMessage(process.env.SLACK_WEBHOOK_SECOND_CALL, embed);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/closed-deal', async (req, res) => {
  try {
    const contactId = req.body.contact_id || req.body.contactId || '';
    const dedupKey = `closed-${contactId}`;
    if (isDuplicate(dedupKey)) return res.json({ success: true, skipped: 'duplicate' });
    const fullName = req.body.full_name ||
      `${req.body.first_name || ''} ${req.body.last_name || ''}`.trim() ||
      req.body.contact_name || 'Unknown';
    const ghlLink = getContactGHLLink(contactId);

    const fields = [
      { name: 'Stage', value: 'Closed Won', inline: true },
      { name: 'Name', value: `[${fullName}](${ghlLink})`, inline: true },
      { name: 'Email', value: req.body.email || '', inline: true },
      { name: 'Phone', value: req.body.phone || '', inline: true },
      { name: 'Tags', value: req.body.tags || '', inline: true },
      { name: 'Country', value: req.body.country || '', inline: true },
      { name: 'Timezone', value: req.body.timezone || '', inline: true },
      { name: 'Opportunity_value', value: req.body.opportunity_value || '', inline: true },
      { name: 'Pipeline_name', value: req.body.pipeline_name || '', inline: true },
      { name: 'Owner', value: req.body.assigned_user || '', inline: true },
      { name: 'Notes', value: req.body.opportunity_notes || '', inline: false },
    ];

    if (req.body.closed_by) fields.push({ name: '🏆 Closed By', value: req.body.closed_by, inline: true });
    if (req.body.assigned_to) fields.push({ name: '📞 Assigned To', value: req.body.assigned_to, inline: true });

    const embed = createEmbed('🏆 Pipeline: Closed Won', fields, COLORS.GOLD);
    await sendDiscordMessage(process.env.DISCORD_WEBHOOK_CLOSED_DEAL, embed);
    await sendSlackMessage(process.env.SLACK_WEBHOOK_CLOSED_DEAL, embed);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
