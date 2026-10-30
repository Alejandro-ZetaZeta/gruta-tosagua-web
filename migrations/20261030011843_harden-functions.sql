-- Las funciones SECURITY DEFINER no deben ser ejecutables por PUBLIC.
-- Sin esto, la clave anon podría llamar /rpc/record_emission y descontar saldo.
revoke execute on function public.record_emission(uuid, text) from public, anon, authenticated;
revoke execute on function public.mark_slot_downloaded(uuid) from public, anon, authenticated;
revoke execute on function public.mark_slot_failed(uuid) from public, anon, authenticated;
revoke execute on function public.generate_order_code() from public, anon, authenticated;
