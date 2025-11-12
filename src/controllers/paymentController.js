const { createPayment } = require("../services/paymentService");
const { createTicket } = require("../services/ticketService");
const { getEventById, getEventSeats } = require("../services/eventsService")
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = require("../config/supabase");
const { consumeReservations, releaseReservations } = require("../services/reservationService");

async function fetchCreatePayment(req, res) {
  try {
    const { userId, eventId, seats } = req.body;

    if (!eventId || !seats || !Array.isArray(seats) || seats.length === 0) {
      return res.status(400).json({ error: "Неверные данные для оплаты" });
    }

    console.log("EventID: ", eventId);
    console.log("seats: ", seats);
    console.log("userId: ", userId);

    const url = await createPayment({ eventId, seats, userId });
    res.json({ url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка при создании платежа" });
  }
}

async function handleWebhook(req, res) {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
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
        if (!eventId || parsedSeats.length === 0 || !userId) {
          console.warn("⚠️ Нет eventId или seats в metadata либо userID");
          break;
        }

        const { event } = await getEventById(eventId);
        if (!event) throw new Error("Ивент не найден");

        // Получаем все seats один раз
        const { seats: allSeats } = await getEventSeats(eventId);

        for (const seat of parsedSeats) {
          const seatId = seat.seatId;
          const quantity = Number(seat.quantity) || 0;
          if (quantity <= 0) continue;

          const seatData = allSeats.find((s) => s.id === seatId);
          if (!seatData) {
            console.warn(`⚠️ Место ${seatId} не найдено`);
            continue;
          }

          // Идемпотентность: считаем уже созданные активные билеты
          const { data: existingTickets, error: existingErr } = await supabase
            .from("tickets")
            .select("id")
            .eq("event_id", eventId)
            .eq("user_id", userId)
            .eq("seat_id", seatId)
            .eq("status", "active");

          if (existingErr) {
            console.error("Ошибка проверки существующих билетов:", existingErr.message);
            continue;
          }

          const existingCount = Array.isArray(existingTickets) ? existingTickets.length : 0;
          const remaining = Math.max(0, quantity - existingCount);
          console.log(`seat=${seatId} quantity=${quantity} existing=${existingCount} remaining=${remaining}`);

          for (let i = 0; i < remaining; i++) {
            await createTicket({
              event,
              user: { id: userId },
              seat: seatData,
            });
          }
        }

        // Снимаем бронь после успешной оплаты
        await consumeReservations({ eventId, userId });

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
      const { eventId, userId } = session.metadata || {};

      try {
        if (eventId && userId) {
          await releaseReservations({ eventId, userId });
        }
        console.log("♻️ Бронь снята после неудачной оплаты или истечения сессии");
      } catch (e) {
        console.error("Ошибка при снятии брони:", e.message);
      }
      break;
    }
    default:
      console.log(event.type);
  }

  // Stripe требует 2xx-ответ, чтобы не повторять webhook
  res.json({ received: true });
}

module.exports = { fetchCreatePayment, handleWebhook };
