const supabase = require("../config/supabase");

function expandSeatIds(selectedSeats) {
  // selectedSeats: [{ seatId, quantity }]
  const arr = [];
  for (const s of selectedSeats) {
    const qty = Number(s.quantity) || 0;
    for (let i = 0; i < qty; i++) {
      arr.push(s.seatId);
    }
  }
  return arr;
}

async function createReservation({ eventId, userId, seats, ttlMinutes = 10 }) {
  if (!eventId || !userId || !Array.isArray(seats) || seats.length === 0) {
    throw new Error("Invalid reservation payload");
  }

  const seatIds = expandSeatIds(seats);
  if (seatIds.length === 0) {
    throw new Error("No seats to reserve");
  }

  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  const { error } = await supabase
    .from("reservations")
    .insert({
      event_id: eventId,
      user_id: userId,
      seat_ids: seatIds,
      expires_at: expiresAt,
    });

  if (error) throw new Error(error.message);

  return true;
}

async function consumeReservations({ eventId, userId }) {
  // удаляем бронь после успешной оплаты
  const { error } = await supabase
    .from("reservations")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return true;
}

async function releaseReservations({ eventId, userId }) {
  // снимаем бронь при неуспешной оплате/истечении
  const { error } = await supabase
    .from("reservations")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return true;
}

module.exports = {
  createReservation,
  consumeReservations,
  releaseReservations,
};