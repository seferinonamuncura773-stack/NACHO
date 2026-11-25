-- APP NAFTA 3.0 · configuración de Supabase
-- Pegá TODO este archivo en Supabase → SQL Editor → Run. Se puede ejecutar más de una vez.
--
-- Modelo: cada persona tiene su cuenta (Supabase Auth). Una familia tiene un administrador
-- que invita con un código. Los datos viven en `records` (una fila por registro) y solo
-- los integrantes de la familia pueden leerlos o escribirlos (Row Level Security).

-- ---------- Tablas ----------
create table if not exists public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.members (
  family_id    uuid not null references public.families(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('admin', 'member')),
  display_name text not null,
  joined_at    timestamptz not null default now(),
  primary key (family_id, user_id)
);
create unique index if not exists members_one_family_per_user on public.members (user_id);

create sequence if not exists public.records_seq;

create table if not exists public.records (
  family_id  uuid not null references public.families(id) on delete cascade,
  kind       text not null check (kind in ('vehicle','driver','fill','maint','expense','deleted')),
  id         text not null,
  data       jsonb not null,
  deleted    boolean not null default false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  seq        bigint not null default nextval('public.records_seq'),
  primary key (family_id, kind, id)
);
create index if not exists records_family_seq on public.records (family_id, seq);

-- seq y updated_at los pone siempre el servidor (la app descarga "lo nuevo desde seq N")
create or replace function public.records_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.seq := nextval('public.records_seq');
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.records_touch();

-- ---------- Seguridad (RLS) ----------
create or replace function public.is_member(fid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.members where family_id = fid and user_id = auth.uid());
$$;

alter table public.families enable row level security;
alter table public.members  enable row level security;
alter table public.records  enable row level security;

drop policy if exists families_select on public.families;
create policy families_select on public.families for select to authenticated using (public.is_member(id));
drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated using (public.is_member(family_id));
drop policy if exists records_select on public.records;
create policy records_select on public.records for select to authenticated using (public.is_member(family_id));
drop policy if exists records_insert on public.records;
create policy records_insert on public.records for insert to authenticated with check (public.is_member(family_id));
drop policy if exists records_update on public.records;
create policy records_update on public.records for update to authenticated
  using (public.is_member(family_id)) with check (public.is_member(family_id));

revoke all on public.families, public.members, public.records from anon, authenticated;
-- el código de invitación NO se puede leer con select directo (solo el administrador, vía get_my_family)
grant select (id, name, created_at) on public.families to authenticated;
grant select (family_id, user_id, role, display_name, joined_at) on public.members to authenticated;
grant select, insert, update on public.records to authenticated;

-- ---------- Funciones (las usa la app) ----------
create or replace function public.new_invite_code() returns text
language sql as $$ select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)); $$;

create or replace function public.create_family(p_name text, p_display text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare fid uuid; code text;
begin
  if auth.uid() is null then raise exception 'Tenés que iniciar sesión'; end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_display), '') = '' then raise exception 'Completá el nombre de la familia y el tuyo'; end if;
  if exists (select 1 from members where user_id = auth.uid()) then raise exception 'Ya pertenecés a una familia'; end if;
  code := public.new_invite_code();
  insert into families (name, invite_code, created_by) values (trim(p_name), code, auth.uid()) returning id into fid;
  insert into members (family_id, user_id, role, display_name) values (fid, auth.uid(), 'admin', trim(p_display));
  return jsonb_build_object('family_id', fid, 'invite_code', code);
end $$;

create or replace function public.join_family(p_code text, p_display text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f families;
begin
  if auth.uid() is null then raise exception 'Tenés que iniciar sesión'; end if;
  if coalesce(trim(p_display), '') = '' then raise exception 'Completá tu nombre'; end if;
  if exists (select 1 from members where user_id = auth.uid()) then raise exception 'Ya pertenecés a una familia'; end if;
  select * into f from families where invite_code = upper(trim(p_code));
  if not found then raise exception 'Código de invitación inválido'; end if;
  insert into members (family_id, user_id, role, display_name) values (f.id, auth.uid(), 'member', trim(p_display));
  return jsonb_build_object('family_id', f.id);
end $$;

create or replace function public.get_my_family() returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'id', f.id, 'name', f.name, 'role', m.role,
    'invite_code', case when m.role = 'admin' then f.invite_code end,
    'members', (select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'display_name', x.display_name, 'role', x.role) order by x.joined_at)
                from members x where x.family_id = f.id))
  from members m join families f on f.id = m.family_id
  where m.user_id = auth.uid() limit 1;
$$;

create or replace function public.regenerate_invite() returns text
language plpgsql security definer set search_path = public as $$
declare fid uuid; code text;
begin
  select family_id into fid from members where user_id = auth.uid() and role = 'admin';
  if fid is null then raise exception 'Solo el administrador puede hacer esto'; end if;
  code := public.new_invite_code();
  update families set invite_code = code where id = fid;
  return code;
end $$;

create or replace function public.remove_member(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  select family_id into fid from members where user_id = auth.uid() and role = 'admin';
  if fid is null then raise exception 'Solo el administrador puede hacer esto'; end if;
  if p_user = auth.uid() then raise exception 'Para irte usá "Salir de la familia"'; end if;
  delete from members where family_id = fid and user_id = p_user;
end $$;

create or replace function public.promote_admin(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  select family_id into fid from members where user_id = auth.uid() and role = 'admin';
  if fid is null then raise exception 'Solo el administrador puede hacer esto'; end if;
  update members set role = 'admin' where family_id = fid and user_id = p_user;
end $$;

create or replace function public.leave_family() returns void
language plpgsql security definer set search_path = public as $$
declare m members;
begin
  select * into m from members where user_id = auth.uid();
  if not found then return; end if;
  if m.role = 'admin' and not exists (select 1 from members where family_id = m.family_id and role = 'admin' and user_id <> auth.uid()) then
    if exists (select 1 from members where family_id = m.family_id and user_id <> auth.uid()) then
      raise exception 'Sos el único administrador: promové a otra persona antes de salir';
    end if;
    delete from families where id = m.family_id;  -- era el último integrante
    return;
  end if;
  delete from members where user_id = auth.uid();
end $$;

-- Sube registros: solo pisa un registro si el nuevo es más reciente (última edición gana)
create or replace function public.push_records(p_family uuid, p_rows jsonb) returns integer
language plpgsql security invoker set search_path = public as $$
declare r jsonb; n integer := 0;
begin
  if not public.is_member(p_family) then raise exception 'No sos integrante de esta familia'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.records (family_id, kind, id, data, deleted)
    values (p_family, r->>'kind', r->>'id', r->'data', coalesce((r->>'deleted')::boolean, false))
    on conflict (family_id, kind, id) do update
      set data = excluded.data, deleted = excluded.deleted
      where coalesce((public.records.data->>'updatedAt')::bigint, 0) < coalesce((excluded.data->>'updatedAt')::bigint, 0);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.create_family(text, text), public.join_family(text, text), public.get_my_family(),
  public.regenerate_invite(), public.remove_member(uuid), public.promote_admin(uuid), public.leave_family(),
  public.push_records(uuid, jsonb), public.is_member(uuid), public.new_invite_code() from public, anon;
grant execute on function public.create_family(text, text), public.join_family(text, text), public.get_my_family(),
  public.regenerate_invite(), public.remove_member(uuid), public.promote_admin(uuid), public.leave_family(),
  public.push_records(uuid, jsonb), public.is_member(uuid) to authenticated;
