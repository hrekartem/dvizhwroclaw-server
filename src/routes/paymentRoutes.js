const express = require("express");
const router = express.Router();
const { fetchCreatePayment, handleWebhook } = require("../controllers/paymentController");
const bodyParser = require("body-parser");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/create", authMiddleware, express.json(), fetchCreatePayment);
router.post("/webhook", bodyParser.raw({ type: "application/json" }), handleWebhook);

module.exports = router;
