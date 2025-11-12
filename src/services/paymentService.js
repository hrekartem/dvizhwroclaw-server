const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const { getEventSeats, getEventById } = require('./eventsService');
const { reserveTicket } = require('./ticketService');
const { createReservation } = require("./reservationService");
const supabase = require("../config/supabase");

const FEE = 1.02;

async function createPayment({ eventId, seats: selectedSeats, userId }) {
    // Фильтруем нулевые количества
    const seatsToCharge = selectedSeats.filter(s => (Number(s.quantity) || 0) > 0);

    // Защита от повторной инициализации: есть ли активная бронь у пользователя
    const nowISO = new Date().toISOString();
    const { data: existingRes, error: resErr } = await supabase
      .from("reservations")
      .select("id")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .gt("expires_at", nowISO);
    if (resErr) throw new Error(resErr.message);
    if (Array.isArray(existingRes) && existingRes.length > 0) {
      throw new Error("У вас уже есть активная бронь. Завершите текущую оплату.");
    }

    // Проверяем доступность — используем getEventSeats (учитывает reserved)
    const { seats: allSeats } = await getEventSeats(eventId);
    const { event } = await getEventById(eventId);

    for (const seat of seatsToCharge) {
      const seatData = allSeats.find(s => s.id === seat.seatId);
      if (!seatData) throw new Error(`Место ${seat.seatId} не найдено`);
      if (!event) throw new Error("Event не найден.");
      if (Number(seat.quantity) > Number(seatData.available ?? 0)) {
        throw new Error(`Недостаточно мест для ${seat.seatId}`);
      }
    }

    // Создаём бронь сразу (на 10 минут)
    await createReservation({ eventId, userId, seats: seatsToCharge, ttlMinutes: 10 });

    // Формируем line_items
    const line_items = [];
    for (const seat of seatsToCharge) {
      const seatData = allSeats.find(s => s.id === seat.seatId);
      line_items.push({
        price_data: {
          currency: "pln",
          product_data: {
            name: `Ивент: ${event.name}`,
            images: [event.main_image_url],
            description: `Место: ${seatData.name}, UserID: ${userId}`,
          },
          unit_amount: Math.round(Number(seatData.price_pln) * 100 * FEE),
        },
        quantity: seat.quantity,
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items,
      mode: "payment",
      success_url: `${process.env.FRONTEND_URL}/profile/success`,
      cancel_url: `${process.env.FRONTEND_URL}/profile/canceled`,
      metadata: { eventId, userId, seats: JSON.stringify(seatsToCharge) },
    });

    return session.url;
}

module.exports = { createPayment };
