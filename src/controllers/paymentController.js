const { createPayment } = require("../services/paymentService");
const { createTicket, returnTicketToPool } = require("../services/ticketService");
const { getEventById, getEventSeats } = require("../services/eventsService")
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function fetchCreatePayment(req, res) {
  try {
    const { userId, eventId, seats } = req.body;

    if (!eventId || !seats || !Array.isArray(seats) || seats.length === 0) {
      return res.status(400).json({ error: "Неверные данные для оплаты" });
    }

    console.log(eventId, seats);
    const url = await createPayment({ eventId, seats, userId });
    res.json({ url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка при создании платежа" });
  }
}

async function handleWebhook(req, res) {
  console.log("Raw body type:", typeof req.body); // должно быть object? ❌
  console.log("Is Buffer?", Buffer.isBuffer(req.body)); // должно быть true
  console.log("Stripe signature header:", req.headers['stripe-signature']);
  console.log("Endpoint secret:", endpointSecret);
  
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers["stripe-signature"];
  let event;


  try {
    // Stripe требует "raw body", поэтому убедись, что bodyParser отключён для этого роута
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error("❌ Stripe webhook verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log("⚡ Stripe event received:", event.type);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const { eventId, seats, userId } = session.metadata || {};

      try {
        const parsedSeats = seats ? JSON.parse(seats) : [];
        if (!eventId || parsedSeats.length === 0) {
          console.warn("⚠️ Нет eventId или seats в metadata");
          break;
        }

        const { event } = await getEventById(eventId);
        if (!event) throw new Error("Ивент не найден");

        // Создаём билеты по каждому месту
        for (const seat of parsedSeats) {
          const seatId = seat.seatId;
          const { seats: allSeats } = await getEventSeats(eventId);
          const seatData = allSeats.find((s) => s.id === seatId);
          if (!seatData) {
            console.warn(`⚠️ Место ${seatId} не найдено`);
            continue;
          }

          await createTicket({
            event,
            user: { id: userId }, // userId передавался в metadata при создании оплаты
            seat: seatData,
          });
        }

        console.log("✅ Билеты успешно созданы после оплаты");
      } catch (e) {
        console.error("Ошибка при создании билетов после оплаты:", e.message);
        return res.status(500).json({ error: "Ошибка создания билетов" });
      }

      break;
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed":
    case "payment_intent.payment_failed": {
      const session = event.data.object;
      const { eventId, seats } = session.metadata || {};

      try {
        const parsedSeats = seats ? JSON.parse(seats) : [];
        for (const seat of parsedSeats) {
          await returnTicketToPool({ seatId: seat.seatId });
        }
        console.log("♻️ Места возвращены в пул после неудачной оплаты");
      } catch (e) {
        console.error("Ошибка при возврате мест:", e.message);
      }
      break;
    }

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  // Stripe требует 2xx-ответ, чтобы не повторять webhook
  res.json({ received: true });
}

module.exports = { fetchCreatePayment, handleWebhook };
