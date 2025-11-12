const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const { getEventSeats, getEventById } = require('./eventsService');
const { reserveTicket } = require('./ticketService');
const { createReservation } = require("./reservationService");

const FEE = 1.02;

async function createPayment({ eventId, seats: selectedSeats, userId }) {
    const { seats: allSeats } = await getEventSeats(eventId);
    const { event: event } = await getEventById(eventId);

    const line_items = [];

    // Фильтруем нулевые количества
    const seatsToCharge = selectedSeats.filter(s => (Number(s.quantity) || 0) > 0);

    for (const seat of seatsToCharge) {
        try {
            const seatData = allSeats.find(s => s.id === seat.seatId);
            if (!seatData) throw new Error(`Место ${seat.seatId} не найдено`);
            if (!event) throw new Error('Event не найден.');
            if (seat.quantity > seatData.available) throw new Error(`Недостаточно мест для ${seat.seatId}`);
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
        } catch (err) {
            console.error("Ошибка при формировании платежа:", seat.seatId, err.message);
        }
    }

    // Создаём бронь на время оплаты (например, 10 минут)
    await createReservation({ eventId, userId, seats: seatsToCharge, ttlMinutes: 10 });

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items,
        mode: "payment",
        success_url: `${process.env.FRONTEND_URL}/profile/success`,
        cancel_url: `${process.env.FRONTEND_URL}/profile/canceled`,
        metadata: {
            eventId: eventId,
            userId: userId,
            seats: JSON.stringify(seatsToCharge),
        },
    });

    return session.url;
}

module.exports = { createPayment };
