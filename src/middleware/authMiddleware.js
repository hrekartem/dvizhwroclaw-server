const supabase = require("../config/supabase");

const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token) return res.status(401).json({ error: "Нет токена" });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: "Неверный токен" });

  // Проверяем роль пользователя (пример: таблица user_roles)
  const { data: roleData, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .single();

  if (roleError || !roleData) {
    return res.status(403).json({ error: "Не удалось определить роль" });
  }

  const role = roleData.role;

  // Сохраняем в req
  req.user = { ...data.user, role };

  if (role === "admin") {
    res.cookie("admin", "true", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  } else {
    res.cookie("admin", "false", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }

  console.log("✅ Authenticated user:", req.user.email, "role:", role); 
  next();
};

module.exports = authMiddleware;
