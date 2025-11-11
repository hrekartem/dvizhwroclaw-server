const supabase = require("../config/supabase");

async function reserveTicket({ eventId, seatId, userId }) {
  // 1. Проверим, что место существует и доступно
  const { data: seatData, error: seatError } = await supabase
    .from("event_seats")
    .select("*")
    .eq("id", seatId)
    .single();

  if (seatError || !seatData) throw new Error(`Место не найдено (${seatId})`);

  if (seatData.available <= 0) throw new Error(`Место ${seatData.name} недоступно`);

  // 2. Уменьшаем количество доступных мест
  const { error: updateError } = await supabase
    .from("event_seats")
    .update({ available: seatData.available - 1 })
    .eq("id", seatId);

  if (updateError) throw new Error("Ошибка обновления количества мест");

  return true;
}

async function createTicket({ event, user, seat = null }) {
  try {
    const qr = `event:${event.id}|user:${user.id}|ts:${Date.now()}`;

    const { data, error } = await supabase
      .from("tickets")
      .insert({
        event_id: event.id,
        user_id: user.id,
        seat_id: seat ? seat.id : null,
        price_paid_pln: event.price_pln,
        price_paid_eur: event.price_eur,
        qr_code: qr,
        status: "active",
        purchased_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) throw error;

    return data;
  } catch (err) {
    console.error("Ошибка при создании билета:", err.message);
    throw new Error("Не удалось создать билет");
  }
}

/**
 * Возврат места в пул (если оплата не прошла или отменена)
 */
async function returnTicketToPool({ seatId }) {
  try {
    // 1. Получаем текущее состояние места
    const { data: seatData, error: seatError } = await supabase
      .from("event_seats")
      .select("available")
      .eq("id", seatId)
      .single();

    if (seatError || !seatData) throw new Error(`Место ${seatId} не найдено`);

    // 2. Увеличиваем количество доступных мест
    const { error: updateError } = await supabase
      .from("event_seats")
      .update({ available: seatData.available + 1 })
      .eq("id", seatId);

    if (updateError) throw new Error("Ошибка при возврате места в пул");

    console.log(`✅ Место ${seatId} возвращено в пул`);
    return true;
  } catch (err) {
    console.error("Ошибка returnTicketToPool:", err.message);
    return false;
  }
}

module.exports = { reserveTicket, createTicket, returnTicketToPool };
