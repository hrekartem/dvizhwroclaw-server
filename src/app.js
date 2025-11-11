// app.js
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/authRoutes");
const profileRoutes = require("./routes/profileRoutes");
const eventsRoutes = require("./routes/eventsRoutes");
const paymentRoutes = require("./routes/paymentRoutes");

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "http://192.168.1.6:3000",
  "https://dvizhwroclaw.eu:3000",
  "https://dvizhwroclaw.eu",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // 👈 разрешаем cookie
  })
);

app.use((req, res, next) => {
  if (req.originalUrl === "/api/payment/webhook") {
    return next();
  }
  express.json()(req, res, next);
});
app.use(cookieParser());

// 🔹 Роуты
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/events", eventsRoutes);
app.use("/api/payment", paymentRoutes);

module.exports = app;
