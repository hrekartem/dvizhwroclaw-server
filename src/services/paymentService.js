const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const { getEventSeats, getEventById } = require('./eventsService');
const { reserveTicket } = require('./ticketService');

const FEE = 1.02;

async function createPayment({ eventId, seats: selectedSeats }) {
    const { seats: allSeats } = await getEventSeats(eventId);
    const { event: event } = await getEventById(eventId);

    const line_items = [];

    for (const seat of selectedSeats) {
        const seatData = allSeats.find(s => s.id === seat.seatId);
        if (!seatData) throw new Error(`Место ${seat.seatId} не найдено`);
        if (!event) throw new Error('Event не найден.');
        if (seat.quantity > seatData.available) throw new Error(`Недостаточно мест для ${seat.seatId}`);

        await reserveTicket({
            eventId,
            seatId: seat.seatId,
            userId,
        });

        line_items.push({
            price_data: {
                currency: "pln",
                product_data: {
                    name: `Ивент: ${event.name}`,
                    images: [event.main_image_url],
                    description: `Место: ${seatData.name}`,
                },
                unit_amount: Math.round(Number(seatData.price_pln) * 100 * FEE),
            },
            quantity: seat.quantity,
        });
    }

    // После цикла создаём сессию один раз
    const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items,
        mode: "payment",
        success_url: `${process.env.FRONTEND_URL}/profile/success`,
        cancel_url: `${process.env.FRONTEND_URL}/profile/canceled`,
        metadata: {
            eventId,
            seats: JSON.stringify(selectedSeats),
        },
    });

    return session.url;
}

module.exports = { createPayment };
