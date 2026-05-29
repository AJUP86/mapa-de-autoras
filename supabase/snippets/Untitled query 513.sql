update auth.users
set raw_app_meta_data = jsonb_set(coalesce(raw_app_meta_data, '{}'::jsonb), '{role}', '"admin"')
where email = 'alejandrourroz96@gmail.com'
returning email, raw_app_meta_data;











