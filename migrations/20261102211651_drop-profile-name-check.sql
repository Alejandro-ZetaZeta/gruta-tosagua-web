-- El nombre viene de Google y no lo controla la app; validarlo aquí podría impedir el alta.
alter table public.profiles drop constraint profiles_display_name_len;
