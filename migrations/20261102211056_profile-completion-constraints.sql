-- Datos mínimos de contacto: nombre usable y teléfono de Ecuador sin código de país.
alter table public.profiles
  add constraint profiles_display_name_len
    check (display_name is null or char_length(btrim(display_name)) between 2 and 80),
  add constraint profiles_phone_ec
    check (phone is null or phone ~ '^(09[0-9]{8}|0[2-7][0-9]{7})$');

alter table public.orders
  add constraint orders_client_name_len
    check (char_length(btrim(client_name)) between 2 and 80),
  add constraint orders_client_phone_ec
    check (client_phone ~ '^(09[0-9]{8}|0[2-7][0-9]{7})$');
