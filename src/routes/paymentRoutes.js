const express = require("express");
const router = express.Router();
const { fetchCreatePayment, handleWebhook } = require("../controllers/paymentController");
const authMiddleware = require("../middleware/authMiddleware");
const bodyParser = require("body-parser");


// Для Stripe webhook нужно raw тело
router.post("/create",authMiddleware, express.json(), fetchCreatePayment);
router.post("/webhook", bodyParser.raw({ type: "application/json" }), handleWebhook);

module.exports = router;
