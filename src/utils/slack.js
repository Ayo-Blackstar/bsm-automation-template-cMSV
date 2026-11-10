const axios = require('axios');

function cleanForSlack(text) {
  if (!text) return '';
  // Convert Discord markdown links [text](url) to Slack format <url|text>
  return String(text)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>')
    .substring(0, 1024);
}

async function sendSlackMessage(webhookUrl, embed) {
  try {
    if (!webhookUrl) return;

    const fields = embed.fields || [];
    const fieldBlocks = [];

    for (let i = 0; i < fields.length; i += 2) {
      const left = fields[i];
      const right = fields[i + 1];

      if (right) {
        fieldBlocks.push({
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*${left.name}*\n${cleanForSlack(left.value)}` },
            { type: 'mrkdwn', text: `*${right.name}*\n${cleanForSlack(right.value)}` }
          ]
        });
      } else {
        fieldBlocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: `*${left.name}*\n${cleanForSlack(left.value)}` }
        });
      }
    }

    const payload = {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: embed.title || 'Notification', emoji: true }
        },
        { type: 'divider' },
        ...fieldBlocks
      ]
    };

    const response = await axios.post(webhookUrl, payload);
    console.log('Slack message sent successfully', response.status);
  } catch (error) {
    console.error('Slack webhook error:', error.response?.data || error.message);
  }
}

module.exports = { sendSlackMessage };
