-- Create tables for ClaimedWorld application

-- Enable RLS (Row Level Security)
alter default privileges revoke execute on functions from public;

-- Create profiles table for user information
create table public.profiles (
  id uuid references auth.users not null primary key,
  display_name text,
  is_admin boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create countries table
create table public.countries (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  code text not null unique,
  current_bid integer default 0,
  current_owner_id uuid references public.profiles(id),
  custom_message text,
  custom_color text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create bids table
create table public.bids (
  id uuid primary key default uuid_generate_v4(),
  country_id uuid references public.countries(id) not null,
  user_id uuid references public.profiles(id) not null,
  amount integer not null,
  is_winning boolean default false,
  custom_message text,
  custom_color text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create function to get top bidders
create or replace function public.get_top_bidders(limit_count integer)
returns table (
  user_id uuid,
  display_name text,
  total_amount bigint,
  countries_count bigint
) as $$
begin
  return query
  select 
    b.user_id,
    p.display_name,
    sum(b.amount) as total_amount,
    count(distinct b.country_id) as countries_count
  from 
    bids b
    join profiles p on b.user_id = p.id
  group by 
    b.user_id, p.display_name
  order by 
    total_amount desc
  limit limit_count;
end;
$$ language plpgsql;

-- Create RLS policies

-- Profiles table policies
alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone."
  on profiles for select
  using (true);

create policy "Users can insert their own profile."
  on profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile."
  on profiles for update
  using (auth.uid() = id);

-- Countries table policies
alter table public.countries enable row level security;

create policy "Countries are viewable by everyone."
  on countries for select
  using (true);

create policy "Only administrators can insert countries."
  on countries for insert
  with check (auth.uid() in (select id from public.profiles where is_admin = true));

create policy "Only administrators can update countries."
  on countries for update
  using (auth.uid() in (select id from public.profiles where is_admin = true));

-- Bids table policies
alter table public.bids enable row level security;

create policy "Bids are viewable by everyone."
  on bids for select
  using (true);

create policy "Users can insert their own bids."
  on bids for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own bids."
  on bids for update
  using (auth.uid() = user_id);

-- is_admin column already added to profiles table during creation

-- Create trigger to update country current bid when a new bid is placed
create or replace function public.handle_new_bid()
returns trigger as $$
begin
  -- Update the country's current bid and owner if the new bid is higher
  update public.countries
  set 
    current_bid = NEW.amount,
    current_owner_id = NEW.user_id,
    custom_message = NEW.custom_message,
    custom_color = NEW.custom_color,
    updated_at = now()
  where 
    id = NEW.country_id
    and (current_bid is null or current_bid < NEW.amount);
  
  -- Set all previous bids for this country to not winning
  update public.bids
  set is_winning = false
  where 
    country_id = NEW.country_id
    and id != NEW.id;
  
  -- Set this bid as winning if it's the highest
  update public.bids
  set is_winning = (
    select current_owner_id = NEW.user_id
    from public.countries
    where id = NEW.country_id
  )
  where id = NEW.id;
  
  return NEW;
end;
$$ language plpgsql;

create trigger on_new_bid
  after insert on public.bids
  for each row execute procedure public.handle_new_bid();

-- Create trigger to update bid is_winning status when a country's current_owner_id changes
create or replace function public.handle_country_owner_change()
returns trigger as $$
begin
  -- If the owner has changed, update all bids for this country
  if OLD.current_owner_id is distinct from NEW.current_owner_id then
    -- Set all bids for this country to not winning
    update public.bids
    set is_winning = false
    where country_id = NEW.id;
    
    -- Set the winning bid to winning
    update public.bids
    set is_winning = true
    where 
      country_id = NEW.id
      and user_id = NEW.current_owner_id
      and amount = NEW.current_bid;
  end if;
  
  return NEW;
end;
$$ language plpgsql;

create trigger on_country_owner_change
  after update on public.countries
  for each row
  when (OLD.current_owner_id is distinct from NEW.current_owner_id)
  execute procedure public.handle_country_owner_change();
