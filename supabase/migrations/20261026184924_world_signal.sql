-- A public revision counter contains no player, wallet or session information.
CREATE TABLE IF NOT EXISTS public.world_events (
  id integer PRIMARY KEY CHECK(id=1),
  revision bigint NOT NULL DEFAULT 0
);
ALTER TABLE public.world_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.world_events FROM anon, authenticated;
GRANT SELECT ON public.world_events TO anon, authenticated;
CREATE POLICY "Public world revision" ON public.world_events FOR SELECT TO anon, authenticated USING(true);
INSERT INTO public.world_events(id) VALUES(1) ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='world_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.world_events;
  END IF;
END $$;
