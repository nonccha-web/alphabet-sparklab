-- OWNER EXECUTION ONLY: this was prepared but NOT executed.
-- Clears tracking history and lifetime deduplication. Does not delete configuration or credentials.
begin;
truncate public.tracking_meta_events, public.tracking_visits, public.tracking_uniques, public.tracking_test_visitors;
commit;
