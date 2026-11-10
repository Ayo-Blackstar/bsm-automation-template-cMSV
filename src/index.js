require('dotenv').config();
const express = require('express');
const app = express();

// Important: stripe webhook needs raw body, so we handle it before json parser
const stripeRoutes = require('./routes/stripe');
app.use('/stripe', stripeRoutes);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const ghlRoutes = require('./routes/ghl');
const typeformRoutes = require('./routes/typeform');
const whopRoutes = require('./routes/whop');
const airtableRoutes = require('./routes/airtable');
const eodRoutes = require('./routes/eod');

app.use('/ghl', ghlRoutes);
app.use('/typeform', typeformRoutes);
app.use('/whop', whopRoutes);
app.use('/airtable', airtableRoutes);
app.use('/eod', eodRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'BSM Automation Template is running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

// Catch unhandled errors to prevent crashes
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
