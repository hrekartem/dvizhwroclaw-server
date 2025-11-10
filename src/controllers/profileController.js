exports.getProfile = async (req, res) => {
  // Берем userId из токена (req.user), либо из query как fallback
  const userId = req.user?.id || req.query.userId;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;

    res.json(profile);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getUserRole = async (req, res) => {
  const userId = req.user?.id || req.query.userId;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  try {
    const { data: profile, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    res.json({ role: profile.role });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getTickets = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(400).json({ error: 'User ID is required' });

  try {
    const { data: tickets, error } = await supabase
      .from('tickets')
      .select(`
    id,
    qr_code,
    price_paid_pln,
    price_paid_eur,
    event_id,
    events (name, date, location, main_image_url),
    event_seats (name)
      `)
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ tickets });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const PDFDocument = require("pdfkit");
const supabase = require("../config/supabase");

exports.downloadTicketPdf = async (req, res) => {
  const userId = req.user?.id;
  const { ticketId } = req.params;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!ticketId) return res.status(400).json({ error: "Ticket ID is required" });

  try {
    // 1️⃣ Получаем данные билета из Supabase
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select(`
        *,
        events (name, date, location),
        event_seats (name)
      `)
      .eq("id", ticketId)
      .eq("user_id", userId)
      .single();

    if (ticketError || !ticket) return res.status(404).json({ error: "Ticket not found" });

    // 2️⃣ Генерация PDF на лету
    const doc = new PDFDocument({ size: "A4", margin: 50 });

    // Заголовки для скачивания
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="ticket-${ticketId}.pdf"`);

    // Пайпим PDF сразу в ответ
    doc.pipe(res);

    // 3️⃣ Содержимое PDF
    doc.fontSize(20).text("Билет на событие", { align: "center" });
    doc.moveDown();

    doc.fontSize(16).text(`Событие: ${ticket.events.name}`);
    doc.text(`Дата: ${new Date(ticket.events.date).toLocaleDateString()}`);
    doc.text(`Место проведения: ${ticket.events.location}`);
    if (ticket.event_seats) doc.text(`Место: ${ticket.event_seats.name}`);
    doc.text(`Цена: ${ticket.price_paid_pln || ""} PLN ${ticket.price_paid_eur || ""} EUR`);
    doc.moveDown();

    doc.text(`Пользователь: ${req.user.email}`);
    doc.text(`Ticket ID: ${ticket.id}`);

    doc.end(); // Финализируем PDF

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};