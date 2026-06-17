-- Reply-to-a-message (WhatsApp-style quoted replies).
-- A message can reference another message it replies to. on-delete set null
-- keeps the reply if the original is hard-deleted (the quote then shows a
-- "message unavailable" placeholder). The column rides the existing
-- chat_messages realtime publication (select '*' picks it up automatically).

alter table public.chat_messages
  add column if not exists reply_to uuid references public.chat_messages(id) on delete set null;
create index if not exists chat_messages_reply_to_idx on public.chat_messages(reply_to);
