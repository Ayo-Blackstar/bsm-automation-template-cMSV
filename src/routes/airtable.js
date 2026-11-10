const express = require('express');
const router = express.Router();
const { sendDiscordMessage, createEmbed, COLORS } = require('../utils/discord');
const { sendSlackMessage } = require('../utils/slack');

router.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;
    const fields = payload.fields || {};
    const reportType = fields['Report Type'] || 'Marketing Report';

    const discordFields = Object.entries(fields).map(([key, value]) => ({
      name: key,
      value: String(value || 'N/A').substring(0, 1024),
      inline: false
    }));

    let title = `📊 ${reportType}`;
    const typeLower = reportType.toLowerCase();
    if (typeLower.includes('email') || typeLower.includes('sms')) {
      title = `📧 ${reportType}`;
    } else if (typeLower.includes('website') || typeLower.includes('optimis')) {
      title = `🌐 ${reportType}`;
    }

    const embed = createEmbed(title, discordFields, COLORS.PURPLE);
    await sendDiscordMessage(process.env.DISCORD_WEBHOOK_AD_REPORTS, embed);
    await sendSlackMessage(process.env.SLACK_WEBHOOK_AD_REPORTS, embed);

    res.json({ success: true });
  } catch (err) {
    console.error('Airtable webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
