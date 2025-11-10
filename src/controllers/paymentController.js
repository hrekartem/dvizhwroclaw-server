const { createPayment } = require("../services/paymentService");
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function fetchCreatePayment(req, res) {
  try {
    const { eventId, seats } = req.body;

    if (!eventId || !seats || !Array.isArray(seats) || seats.length === 0) {
      return res.status(400).json({ error: "Неверные данные для оплаты" });
    }

    console.log(eventId, seats);
    const url = await createPayment({ eventId, seats });
    res.json({ url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка при создании платежа" });
  }
}

async function handleWebhook(req, res) {
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  console.log(event);
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { eventId, seats } = session.metadata || {};
    try {
      const parsedSeats = seats ? JSON.parse(seats) : [];
      

      // ТУТ БУДЕТ РАБОТА С БД ИТД

      for (const seat of parsedSeats) {
        await createTicketForSeat(eventId, seat.seatId, seat.quantity);
      }
    } catch (e) {
      console.error("Webhook payload parse error:", e);
      return res.status(400).send("Invalid webhook payload");
    }
  }

  res.json({ received: true });
}

module.exports = { fetchCreatePayment, handleWebhook };
