const express = require("express");
const router = express.Router();
const { fetchCreatePayment, handleWebhook } = require("../controllers/paymentController");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/create", authMiddleware, express.json(), fetchCreatePayment);
router.post("/webhook", express.raw({ type: "application/json" }), handleWebhook);

module.exports = router;
