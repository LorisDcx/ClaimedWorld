import { sessionUser } from '@/lib/auth';
import { snapshot } from '@/lib/db';
import { usesPostgres } from '@/lib/storage';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Persistent Node hosting: each browser gets a real SSE channel, with a polling fallback in the UI.
export async function GET(request: Request) {
  if (usesPostgres()) return Response.json({ transport: 'supabase-realtime' }, { status: 410 });
  const uid = await sessionUser();
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let dispose: () => void = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let previous = '',
        ticks = 0,
        ended = false;
      dispose = () => {
        if (ended) return;
        ended = true;
        if (timer) clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* already disconnected */
        }
      };
      let sending = false;
      async function send() {
        if (ended) return;
        if (sending) return;
        sending = true;
        try {
          const world = await snapshot(uid);
          const comparison = JSON.stringify({ ...world, serverTime: 0 });
          if (comparison !== previous) {
            controller.enqueue(encoder.encode(`event: world\ndata: ${JSON.stringify(world)}\n\n`));
            previous = comparison;
          } else if (ticks % 10 === 0) controller.enqueue(encoder.encode(': keep-alive\n\n'));
          // Reconnect periodically so expired sessions are revalidated from their cookie.
          if (++ticks >= 150) dispose();
        } catch {
          dispose();
        } finally {
          sending = false;
        }
      }
      void send();
      if (!ended) timer = setInterval(() => void send(), 2000);
      request.signal.addEventListener('abort', dispose, { once: true });
      if (request.signal.aborted) dispose();
    },
    cancel() {
      dispose();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
