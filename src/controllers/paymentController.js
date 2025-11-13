const { createPayment } = require("../services/paymentService");
const { createTicket } = require("../services/ticketService");
const { getEventById, getEventSeats } = require("../services/eventsService")
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = require("../config/supabase");
const { releaseReservations } = require("../services/reservationService");

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
    res.status(500).json({ error: err.message });
  }
}

async function handleWebhook(req, res) {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Stripe webhook verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log("⚡ Stripe event received:", event.type);

  const handleReservationRelease = async (metadata) => {
    const { eventId, userId } = metadata || {};
    if (eventId && userId) {
      try {
        await releaseReservations({ eventId, userId });
        console.log("♻️ Бронь снята после неудачной оплаты или истечения сессии");
      } catch (e) {
        console.error("Ошибка при снятии брони:", e.message);
      }
    }
  };

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      const { eventId, seats, userId } = session.metadata || {};

      if (!eventId || !userId) {
        console.warn("⚠️ Нет eventId или userId в metadata");
        break;
      }

      let parsedSeats = [];
      try {
        parsedSeats = seats ? JSON.parse(seats) : [];
        if (parsedSeats.length === 0) {
          console.warn("⚠️ Нет выбранных мест в metadata");
        }
      } catch (e) {
        console.error("Ошибка парсинга seats:", e.message);
        break;
      }

      try {
        const { event } = await getEventById(eventId);
        if (!event) throw new Error("Ивент не найден");

        const { seats: allSeats } = await getEventSeats(eventId);

        const ticketsToCreate = [];

        for (const seat of parsedSeats) {
          const seatData = allSeats.find((s) => s.id === seat.seatId);
          const quantity = Number(seat.quantity) || 0;

          if (!seatData || quantity <= 0) {
            console.warn(`⚠️ Место ${seat.seatId} не найдено или quantity <= 0`);
            continue;
          }

          for (let i = 0; i < quantity; i++) {
            ticketsToCreate.push({
              event,
              user: { id: userId },
              seat: seatData,
            });
          }
        }

        // Создание всех билетов параллельно
        await Promise.all(ticketsToCreate.map(createTicket));
        await handleReservationRelease(session.metadata);

        console.log("✅ Билеты успешно созданы после оплаты");
      } catch (e) {
        console.error("Ошибка при создании билетов после оплаты:", e.message);
      }

      break;
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const session = event.data.object;
      await handleReservationRelease(session.metadata);
      break;
    }
    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object;
      const failureCode = paymentIntent.last_payment_error?.code;

      console.log(`💳 Платёж не прошёл, failure_code=${failureCode}`);

      // Если это временная ошибка карты, не снимаем бронь
      const temporaryCardErrors = [
        "card_declined",
        "expired_card",
        "incorrect_cvc",
        "incorrect_number",
      ];

      if (!temporaryCardErrors.includes(failureCode)) {
        // Для других типов ошибок можно снять бронь
        await handleReservationRelease(paymentIntent.metadata);
      }

      break;
    }
    default:
      console.log(`ℹ️ Необработанный тип события: ${event.type}`);
  }

  // Stripe требует 2xx-ответ, чтобы не повторять webhook
  res.json({ received: true });
}

module.exports = { fetchCreatePayment, handleWebhook };
