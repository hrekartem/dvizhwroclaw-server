const supabase = require("../config/supabase");

/**
 * Удаляет все просроченные брони из таблицы reservation
 */
async function cleanupExpiredReservations() {
    try {
        const { error } = await supabase.rpc("cleanup_expired_reservations");

        if (error) {
            console.error("❌ Ошибка при удалении просроченных броней:", error.message);
        } else {
            console.log("🧹 Просроченные брони успешно удалены");
        }
    } catch (e) {
        console.error("❌ Ошибка cleanupExpiredReservations:", e.message);
    }
}

module.exports = { cleanupExpiredReservations };
