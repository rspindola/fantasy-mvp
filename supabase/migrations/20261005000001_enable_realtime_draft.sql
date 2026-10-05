-- Migration: Enable Realtime publication & full replica identity for draft tables

ALTER PUBLICATION supabase_realtime ADD TABLE leagues;
ALTER PUBLICATION supabase_realtime ADD TABLE fantasy_teams;
ALTER PUBLICATION supabase_realtime ADD TABLE draft_picks;
ALTER PUBLICATION supabase_realtime ADD TABLE draft_queues;

ALTER TABLE leagues REPLICA IDENTITY FULL;
ALTER TABLE fantasy_teams REPLICA IDENTITY FULL;
ALTER TABLE draft_picks REPLICA IDENTITY FULL;
ALTER TABLE draft_queues REPLICA IDENTITY FULL;
