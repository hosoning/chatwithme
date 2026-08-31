import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type TelegramMessage = {
  message_id: number;
  text?: string;
  chat: { id: number };
  from?: { id: number; first_name?: string; username?: string };
};

const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const allowedChatId = Deno.env.get("TELEGRAM_ALLOWED_CHAT_ID") ?? "";
const telegramWebhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";
const progressSecret = Deno.env.get("CLAUDE_WALLET_PROGRESS_SECRET") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

async function setWebhook() {
  if (!botToken || !telegramWebhookSecret) return;
  try {
    const functionUrl = Deno.env.get("SUPABASE_FUNCTION_URL") ??
      `https://${new URL(supabaseUrl).hostname}/functions/v1/wallet-telegram-bridge`;
    const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        url: functionUrl,
        secret_token: telegramWebhookSecret,
      }).toString(),
    });
    if (response.ok) console.log("Telegram webhook set successfully");
  } catch (error) {
    console.error("Failed to set webhook:", error);
  }
}

async function sendMessage(chatId: number | string, text: string) {
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is missing");
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
  if (!response.ok) throw new Error(`Telegram send failed: ${response.status}`);
}

async function latestStatus(): Promise<string> {
  const { data } = await db
    .from("wallet_progress")
    .select("phase,summary,status,balance,transaction_id,created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return "Claude 的錢包還沒有任何交易記錄。";

  const icon = data.status === "success" ? "✅" : data.status === "pending" ? "⏳" : "❌";
  const balance = data.balance ? `\n余額：HK$${Number(data.balance).toFixed(2)}` : "";
  const txId = data.transaction_id ? `\n交易 #${data.transaction_id}` : "";

  return `${icon} ${data.phase}\n${data.summary}${balance}${txId}`;
}

async function handleTelegram(message: TelegramMessage) {
  const chatId = String(message.chat.id);
  if (!allowedChatId || chatId !== allowedChatId) {
    await sendMessage(message.chat.id, "這是 Claude 的私人錢包機器人，這個帳號沒有存取權限。");
    return;
  }

  const text = (message.text ?? "").trim();
  if (!text) return;

  if (text === "/start") {
    await sendMessage(message.chat.id, "Claude 錢包機器人已連線。\n\n/status 查看最新進度\n/balance 查看當前余額\n直接輸入文字即可提交反饋意見。");
    return;
  }

  if (text === "/status") {
    await sendMessage(message.chat.id, await latestStatus());
    return;
  }

  if (text === "/balance") {
    const { data } = await db
      .from("wallet_progress")
      .select("balance")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const balance = data?.balance ? `余額：HK$${Number(data.balance).toFixed(2)}` : "還沒有余額記錄。";
    await sendMessage(message.chat.id, balance);
    return;
  }

  // Store feedback
  const { error } = await db.from("wallet_feedback").upsert({
    telegram_chat_id: message.chat.id,
    telegram_user_id: message.from?.id ?? null,
    telegram_message_id: message.message_id,
    message: text,
    context: {
      first_name: message.from?.first_name ?? null,
      username: message.from?.username ?? null,
    },
  }, { onConflict: "telegram_chat_id,telegram_message_id", ignoreDuplicates: true });

  if (error) throw error;
  await sendMessage(message.chat.id, "收到，已記錄你的反饋。");
}

async function handleProgress(payload: Record<string, unknown>) {
  const rawStatus = String(payload.status ?? "pending");
  const normalizedStatus = rawStatus === "success"
    ? "success"
    : rawStatus === "pending"
    ? "pending"
    : rawStatus === "cancelled"
    ? "cancelled"
    : rawStatus === "failure"
    ? "failure"
    : "pending";

  const row = {
    phase: String(payload.phase ?? "Wallet transaction"),
    summary: String(payload.summary ?? "Claude 的錢包有新的操作。"),
    status: normalizedStatus,
    balance: payload.balance ? Number(payload.balance) : null,
    transaction_id: payload.transaction_id ? Number(payload.transaction_id) : null,
    metadata: payload.metadata ?? {},
  };

  const { error } = await db.from("wallet_progress").insert(row);
  if (error) throw error;

  if (allowedChatId) {
    await sendMessage(allowedChatId, await latestStatus());
  }
}

Deno.serve(async (request) => {
  if (request.method === "GET") {
    await setWebhook();
    return json({ ok: true, service: "claude-wallet-telegram-bridge" });
  }
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const telegramSecret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
    const ciSecret = request.headers.get("x-claude-wallet-progress-secret") ?? "";
    const body = await request.json();

    if (telegramWebhookSecret && telegramSecret === telegramWebhookSecret) {
      if (body?.message) await handleTelegram(body.message as TelegramMessage);
      return json({ ok: true });
    }

    if (progressSecret && ciSecret === progressSecret) {
      await handleProgress(body as Record<string, unknown>);
      return json({ ok: true });
    }

    return json({ error: "unauthorized" }, 401);
  } catch (error) {
    console.error(error);
    return json({ error: "bridge_failed" }, 500);
  }
});
