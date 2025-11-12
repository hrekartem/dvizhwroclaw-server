// app.js
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const app = express();

const FRONTEND_URL = process.env.FRONTEND_URL;

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true, // важно: разрешаем передачу cookie
  })
);

const authRoutes = require("./routes/authRoutes");
const profileRoutes = require("./routes/profileRoutes");
const eventsRoutes = require("./routes/eventsRoutes");
const paymentRoutes = require("./routes/paymentRoutes");

// 🔹 Роуты
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/events", eventsRoutes);
app.use("/api/payment", paymentRoutes);

module.exports = app;
