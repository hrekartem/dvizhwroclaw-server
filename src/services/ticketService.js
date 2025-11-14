const supabase = require("../config/supabase");
const { nanoid } = require("nanoid");

async function createTicket({ event, user, seat = null }) {
    try {
        if (!event?.id || !user?.id || !seat?.id) {
            throw new Error("Некорректные данные для билета (event/user/seat)");
        }

        const uuid =
            (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function")
                ? globalThis.crypto.randomUUID()
                : nanoid();

        const shortUuid = uuid.slice(0, 8);
        const shortUserId = user.id.slice(0, 8);
        const shortEventId = event.id.slice(0, 8);
        const qr = `e:${shortEventId}|u:${shortUserId}|t=${shortUuid}`;

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

module.exports = { createTicket };
