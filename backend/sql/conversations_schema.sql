-- EzyAIAgent Conversation Threads Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create conversations table
CREATE TABLE IF NOT EXISTS "EzyAIAgent".conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  system_prompt TEXT,
  agent_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create messages table
CREATE TABLE IF NOT EXISTS "EzyAIAgent".messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES "EzyAIAgent".conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  image_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_conversations_updated 
  ON "EzyAIAgent".conversations(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation 
  ON "EzyAIAgent".messages(conversation_id, created_at ASC);

-- Create updated_at trigger for conversations
CREATE OR REPLACE FUNCTION "EzyAIAgent".update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON "EzyAIAgent".conversations
  FOR EACH ROW
  EXECUTE FUNCTION "EzyAIAgent".update_updated_at_column();

-- Create storage bucket for chat images (run this if bucket doesn't exist)
-- This needs to be run via Supabase client, not SQL
-- INSERT INTO storage.buckets (id, name, public) 
-- VALUES ('chat-images', 'chat-images', true)
-- ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE "EzyAIAgent".conversations IS 'Chat conversation threads';
COMMENT ON TABLE "EzyAIAgent".messages IS 'Messages within conversations';

-- Image generation history (retention cleanup is handled by backend job)
CREATE TABLE IF NOT EXISTS "EzyAIAgent".image_generations (
  id UUID PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  size TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image',
  source_url TEXT,
  image_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_image_generations_created_at
  ON "EzyAIAgent".image_generations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_image_generations_expires_at
  ON "EzyAIAgent".image_generations(expires_at ASC);
