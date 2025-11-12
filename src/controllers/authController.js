const supabase = require("../config/supabase");
const logToFile = require("../services/logToFileService");


exports.signOutUser = async (req, res) => {
  const { token } = req.body;

  if (!token) return res.status(400).json({ error: "Token обязателен" });

  const { error } = await supabase.auth.signOut(token);

  if (error) return res.status(400).json({ error: error.message });

  res.json({ message: "Вы вышли из системы" });
};

exports.registerUser = async (req, res) => {
  const { email, password, firstName, lastName, dateOfBirth } = req.body;

  // Проверка всех полей
  if (!email || !password || !firstName || !lastName || !dateOfBirth) {
    return res.status(400).json({ error: "Все поля обязательны" });
  }

  logToFile({ email, password, firstName, lastName, dateOfBirth });

  try {
    const { data: existingUser, error: checkError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      return res.status(500).json({ error: checkError.message });
    }

    if (existingUser) {
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: firstName,
        },
      },
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    const userId = authData.user.id;
    console.log('User registered in Auth:', userId);

    // 3️⃣ Вставляем или обновляем профиль пользователя
    const { error: dbError } = await supabase
      .from('profiles')
      .upsert([
        {
          id: userId,
          email,
          first_name: firstName.toString(),
          last_name: lastName.toString(),
          date_of_birth: dateOfBirth,
        },
      ]);

    if (dbError) {
      return res.status(400).json({ error: dbError.message });
    }

    console.log('Profile saved/updated successfully');

    // 4️⃣ Назначаем роль пользователю (если ещё не существует)
    const { data: existingRole } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!existingRole) {
      const { error: userRoleError } = await supabase
        .from('user_roles')
        .insert([{ id: userId, role: 'user' }]);

      if (userRoleError) {
        return res.status(400).json({ error: userRoleError.message });
      }
      console.log('User role assigned successfully');
    } else {
      console.log('User role already exists');
    }

    res.status(201).json({ message: 'Регистрация успешна! Проверь почту.' });

  } catch (err) {
    console.error('Ошибка регистрации:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};

exports.loginUser = async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return res.status(401).json({ error: error.message });

  const { session } = data;
  const user = session.user;

  // Получаем роль
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  const role = roleData?.role || "user";

  // Устанавливаем cookie
  const isProd = process.env.NODE_ENV === "production";
  res.cookie("role", role, {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd, // secure=true в production (https)
    domain: isProd ? ".dvizhwroclaw.eu" : undefined, // выставить ваш фронтенд-домен в prod
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 дней
  });

  res.json({
    message: "Успешный вход",
    session,
    user,
    role,
  });
};
// Проверка сессии
exports.getSession = async (req, res) => {
  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token) return res.status(401).json({ error: "Token не найден" });

  const { data, error } = await supabase.auth.getUser(token);
  if (error) return res.status(401).json({ error: error.message });

  const userId = data.user.id;

  const { data: roleData, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (roleError) return res.status(401).json({ error: roleError.message });

  return res.json({
    user: data.user,
    role: roleData.role
  });
};
