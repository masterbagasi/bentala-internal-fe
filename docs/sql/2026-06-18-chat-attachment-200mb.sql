-- Raise the chat attachment size cap from 10 MB to 200 MB.
-- The storage bucket enforces its own file_size_limit, so the app-side limits
-- in app/api/chat/[room]/upload/route.ts and components/Chat/ChatRoom.tsx must
-- be matched here or Supabase will still reject anything over the bucket cap.
update storage.buckets
   set file_size_limit = 209715200            -- 200 MB
 where id = 'chat-attachments';
