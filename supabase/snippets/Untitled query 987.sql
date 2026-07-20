select pg_get_functiondef('public.promote_suggestion(uuid, jsonb, jsonb[])'::regprocedure) ~ 'promoted_author_id' as has_new_line;
