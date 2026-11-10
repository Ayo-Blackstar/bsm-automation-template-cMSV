const express = require('express');
const router = express.Router();
const { sendDiscordMessage, createEmbed, COLORS } = require('../utils/discord');
const { sendSlackMessage } = require('../utils/slack');

function getEmbedConfig(formTitle) {
  const title = formTitle.toLowerCase();
  if (title.includes('closer')) {
    return { emoji: '📊', label: 'Closer EOD', color: COLORS.BLUE, channel: 'daily_reports' };
  } else if (title.includes('setter') && title.includes('manager')) {
    return { emoji: '💼', label: 'Sales / Setter Manager EOD', color: COLORS.GOLD, channel: 'daily_reports' };
  } else if (title.includes('setter')) {
    return { emoji: '📋', label: 'Setter EOD', color: COLORS.GREEN, channel: 'daily_reports' };
  } else if (title.includes('company')) {
    return { emoji: '🏢', label: 'Company-wide EOD', color: COLORS.PURPLE, channel: 'daily_reports' };
  } else if (title.includes('advertis') || title.includes('ad report') || title.includes('ads')) {
    return { emoji: '📈', label: 'Ad Reports', color: COLORS.ORANGE, channel: 'ad_reports' };
  } else if (title.includes('post call') || title.includes('call note')) {
    return { emoji: '📞', label: 'Post Call Report', color: COLORS.PURPLE, channel: 'call_notes' };
  } else {
    return { emoji: '📋', label: formTitle, color: COLORS.BLUE, channel: 'daily_reports' };
  }
}

function getWebhookUrl(channel) {
  switch (channel) {
    case 'ad_reports':
      return process.env.DISCORD_WEBHOOK_AD_REPORTS;
    case 'call_notes':
      return process.env.DISCORD_WEBHOOK_CALL_NOTES;
    case 'setter_notes':
      return process.env.DISCORD_WEBHOOK_SETTER_NOTES;
    case 'daily_reports':
    default:
      return process.env.DISCORD_WEBHOOK_DAILY_REPORTS;
  }
}

router.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;
    const formTitle = payload.form_title || 'EOD Report';
    const submittedAt = payload.submitted_at || new Date().toLocaleString();
    const answers = payload.answers || {};

    const config = getEmbedConfig(formTitle);

    const discordFields = Object.entries(answers).map(([question, answer]) => ({
      name: question.substring(0, 256),
      value: String(answer || 'N/A').substring(0, 1024),
      inline: true
    }));

    const embed = {
      title: `${config.emoji} ${config.label}`,
      description: `Submitted at ${submittedAt}`,
      color: config.color,
      fields: discordFields,
      timestamp: new Date().toISOString(),
      footer: { text: 'BSM Form Bot' }
    };

    const webhookUrl = getWebhookUrl(config.channel);
    await sendDiscordMessage(webhookUrl, embed);

    // Send daily reports to Slack too
    if (config.channel === 'daily_reports') {
      await sendSlackMessage(process.env.SLACK_WEBHOOK_DAILY_REPORTS, embed);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('EOD webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
