const supabase = require("../config/supabase");
const { nanoid } = require("nanoid");

/**
 * Резервирует место: увеличивает reserved на 1
 */
async function reserveTicket({ seatId }) {
  // Получаем текущее состояние места
  const { data: seatData, error: seatError } = await supabase
    .from("event_seats")
    .select("id, name, capacity, reserved")
    .eq("id", seatId)
    .single();

  if (seatError || !seatData) throw new Error(`Место не найдено (${seatId})`);

  const available = seatData.capacity - (seatData.reserved || 0);
  if (available <= 0) throw new Error(`Место ${seatData.name} недоступно`);

  // Увеличиваем reserved
  const { error: updateError } = await supabase
    .from("event_seats")
    .update({ reserved: (seatData.reserved || 0) + 1 })
    .eq("id", seatId);

  if (updateError) throw new Error("Ошибка при резервировании места");

  console.log(`✅ Место ${seatId} зарезервировано`);
  return true;
}

async function createTicket({ event, user, seat = null }) {
    try {
        if (!event?.id || !user?.id || !seat?.id) {
            throw new Error("Некорректные данные для билета (event/user/seat)");
        }

        const uuid =
            (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function")
                ? globalThis.crypto.randomUUID()
                : nanoid();

        const qr = `event:${event.id}|user:${user.id}|uuid=${uuid}`;

        const pricePln = seat.price_pln != null ? Number(seat.price_pln) : 0;
        const priceEur = seat.price_eur != null ? Number(seat.price_eur) : 0;

        const { data, error } = await supabase
          .from("tickets")
          .insert({
            event_id: event.id,
            user_id: user.id,
            seat_id: seat.id,
            price_paid_pln: pricePln,
            price_paid_eur: priceEur || 0,
            qr_code: qr,
            status: "active",
            purchased_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (error) throw error;

        console.log(`🎫 Билет создан для пользователя ${user.id}`, { ticketId: data?.id, qr });
        return data;
    } catch (err) {
        console.error("Ошибка при создании билета:", err.message);
        throw new Error("Не удалось создать билет");
    }
}
/**
 * Возврат места в пул (если оплата не прошла)
 */
async function returnTicketToPool({ seatId }) {
  try {
    const { data: seatData, error: seatError } = await supabase
      .from("event_seats")
      .select("id, reserved")
      .eq("id", seatId)
      .single();

    if (seatError || !seatData) throw new Error(`Место ${seatId} не найдено`);

    const newReserved = Math.max((seatData.reserved || 1) - 1, 0);

    const { error: updateError } = await supabase
      .from("event_seats")
      .update({ reserved: newReserved })
      .eq("id", seatId);

    if (updateError) throw new Error("Ошибка при возврате места в пул");

    console.log(`♻️ Место ${seatId} возвращено из резерва`);
    return true;
  } catch (err) {
    console.error("Ошибка returnTicketToPool:", err.message);
    return false;
  }
}

module.exports = { reserveTicket, createTicket, returnTicketToPool };
