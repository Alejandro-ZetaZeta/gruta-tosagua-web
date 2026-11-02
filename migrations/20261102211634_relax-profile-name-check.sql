-- Un nombre de Google puede tener un solo carácter; no bloquear el alta por eso.
alter table public.profiles drop constraint profiles_display_name_len;
alter table public.profiles
  add constraint profiles_display_name_len
    check (display_name is null or char_length(btrim(display_name)) between 1 and 80);
