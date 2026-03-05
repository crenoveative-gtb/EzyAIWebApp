create schema if not exists "EzyAIAgent";

create table if not exists "EzyAIAgent"."api_keys_store" (
  id integer primary key check (id = 1),
  gemini_api_key text not null default '',
  openrouter_api_key text not null default '',
  groq_api_key text not null default '',
  aimlapi_api_key text not null default '',
  huggingface_api_key text not null default '',
  pollinations_api_key text not null default '',
  replicate_api_key text not null default '',
  pollo_api_key text not null default '',
  updated_at timestamptz not null default now()
);

insert into "EzyAIAgent"."api_keys_store" (id)
values (1)
on conflict (id) do nothing;

create table if not exists "EzyAIAgent"."image_generations" (
  id uuid primary key,
  provider text not null,
  model text not null,
  prompt text not null,
  size text not null,
  media_type text not null default 'image',
  source_url text,
  image_url text not null,
  storage_path text not null,
  latency_ms integer,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_image_generations_created_at
  on "EzyAIAgent"."image_generations"(created_at desc);

create index if not exists idx_image_generations_expires_at
  on "EzyAIAgent"."image_generations"(expires_at asc);
