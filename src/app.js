// app.js
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const app = express();

const FRONTEND_URL = process.env.FRONTEND_URL;

// ⛔ ВАЖНО: подключаем paymentRoutes ДО express.json()
const paymentRoutes = require("./routes/paymentRoutes");
app.use("/api/payment", paymentRoutes);

// Middleware

app.use(cookieParser());
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

// Остальные роуты
const profileRoutes = require("./routes/profileRoutes");
const eventsRoutes = require("./routes/eventsRoutes");

app.use("/api/profile", profileRoutes);
app.use("/api/events", eventsRoutes);

module.exports = app;
