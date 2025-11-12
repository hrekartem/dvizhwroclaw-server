const express = require("express");
const app = require('./app');
const cron = require("node-cron");
const { cleanupExpiredReservations } = require("./services/cleanupReservationsService");
require('dotenv').config();

const port = process.env.PORT || 5001;

cron.schedule("*/5 * * * *", async () => {
  await cleanupExpiredReservations();
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
