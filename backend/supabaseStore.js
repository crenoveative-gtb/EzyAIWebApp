const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');

function quoteIdentifier(name) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Invalid SQL identifier');
  }
  return `"${name.replace(/"/g, '""')}"`;
}

function createSupabaseStore(config) {
  const schemaName = config.schemaName || 'EzyAIAgent';
  const tableName = config.tableName || 'api_keys_store_v2';
  const legacyTableName = config.legacyTableName || 'api_keys_store';
  const bucketName = config.bucketName || 'Dev_Test';
  const folderName = config.folderName || 'EzyAIAgent';

  const quotedSchema = quoteIdentifier(schemaName);
  const quotedTable = quoteIdentifier(tableName);
  const quotedLegacyTable = quoteIdentifier(legacyTableName);
  const quotedUserIdUniqueIndex = quoteIdentifier(`idx_${tableName}_user_id`);

  const pool = new Pool({
    connectionString: config.dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  async function ensureSchemaAndTable() {
    const sql = `
      create schema if not exists ${quotedSchema};

      create table if not exists ${quotedSchema}.${quotedTable} (
        user_id uuid primary key,
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

      alter table ${quotedSchema}.${quotedTable}
        add column if not exists user_id uuid;
      create unique index if not exists ${quotedUserIdUniqueIndex}
        on ${quotedSchema}.${quotedTable}(user_id);
      alter table ${quotedSchema}.${quotedTable}
        add column if not exists huggingface_api_key text not null default '';
      alter table ${quotedSchema}.${quotedTable}
        add column if not exists pollinations_api_key text not null default '';
      alter table ${quotedSchema}.${quotedTable}
        add column if not exists replicate_api_key text not null default '';
      alter table ${quotedSchema}.${quotedTable}
        add column if not exists pollo_api_key text not null default '';
      alter table ${quotedSchema}.${quotedTable}
        add column if not exists bfl_api_key text not null default '';
      alter table ${quotedSchema}.${quotedTable}
        add column if not exists renderful_api_key text not null default '';
      alter table ${quotedSchema}.${quotedTable}
        add column if not exists kie_api_key text not null default '';
      alter table ${quotedSchema}.${quotedTable}
        add column if not exists fal_api_key text not null default '';
    `;

    await pool.query(sql);
  }

  async function ensureStorageFolder() {
    const keepPath = `${folderName.replace(/^\/+|\/+$/g, '')}/.keep`;
    const { error } = await supabase.storage
      .from(bucketName)
      .upload(keepPath, Buffer.from(''), {
        contentType: 'text/plain',
        upsert: true
      });

    if (error) {
      throw new Error(`Storage folder setup failed: ${error.message}`);
    }
  }

  async function init() {
    await ensureSchemaAndTable();
    await ensureStorageFolder();
  }

  function normalizeUserId(userId) {
    if (typeof userId !== 'string') {
      throw new Error('Missing user id');
    }
    const normalized = userId.trim();
    if (!normalized) {
      throw new Error('Missing user id');
    }
    return normalized;
  }

  function mapRowToStoredKeys(row) {
    const source = row || {};
    return {
      geminiApiKey: typeof source.gemini_api_key === 'string' ? source.gemini_api_key : '',
      openrouterApiKey: typeof source.openrouter_api_key === 'string' ? source.openrouter_api_key : '',
      groqApiKey: typeof source.groq_api_key === 'string' ? source.groq_api_key : '',
      aimlapiApiKey: typeof source.aimlapi_api_key === 'string' ? source.aimlapi_api_key : '',
      huggingfaceApiKey: typeof source.huggingface_api_key === 'string' ? source.huggingface_api_key : '',
      pollinationsApiKey: typeof source.pollinations_api_key === 'string' ? source.pollinations_api_key : '',
      replicateApiKey: typeof source.replicate_api_key === 'string' ? source.replicate_api_key : '',
      polloApiKey: typeof source.pollo_api_key === 'string' ? source.pollo_api_key : '',
      bflApiKey: typeof source.bfl_api_key === 'string' ? source.bfl_api_key : '',
      renderfulApiKey: typeof source.renderful_api_key === 'string' ? source.renderful_api_key : '',
      kieApiKey: typeof source.kie_api_key === 'string' ? source.kie_api_key : '',
      falApiKey: typeof source.fal_api_key === 'string' ? source.fal_api_key : ''
    };
  }

  function hasAnyApiKey(storedKeys) {
    if (!storedKeys) return false;
    return [
      storedKeys.geminiApiKey,
      storedKeys.openrouterApiKey,
      storedKeys.groqApiKey,
      storedKeys.aimlapiApiKey,
      storedKeys.huggingfaceApiKey,
      storedKeys.pollinationsApiKey,
      storedKeys.replicateApiKey,
      storedKeys.polloApiKey,
      storedKeys.bflApiKey,
      storedKeys.renderfulApiKey,
      storedKeys.kieApiKey,
      storedKeys.falApiKey
    ].some((value) => typeof value === 'string' && value.trim().length > 0);
  }

  async function readLegacyStoredKeys() {
    if (legacyTableName === tableName) {
      return null;
    }

    const query = `
      select
        gemini_api_key,
        openrouter_api_key,
        groq_api_key,
        aimlapi_api_key,
        huggingface_api_key,
        pollinations_api_key,
        replicate_api_key,
        pollo_api_key,
        bfl_api_key,
        renderful_api_key,
        kie_api_key,
        fal_api_key
      from ${quotedSchema}.${quotedLegacyTable}
      order by updated_at desc nulls last
      limit 1;
    `;

    try {
      const result = await pool.query(query);
      if (!result.rows[0]) {
        return null;
      }
      return mapRowToStoredKeys(result.rows[0]);
    } catch (error) {
      if (typeof error?.message === 'string' && error.message.includes('does not exist')) {
        return null;
      }
      throw error;
    }
  }

  async function readStoredKeys(userId) {
    const normalizedUserId = normalizeUserId(userId);
    const query = `
      select
        gemini_api_key,
        openrouter_api_key,
        groq_api_key,
        aimlapi_api_key,
        huggingface_api_key,
        pollinations_api_key,
        replicate_api_key,
        pollo_api_key,
        bfl_api_key,
        renderful_api_key,
        kie_api_key,
        fal_api_key
      from ${quotedSchema}.${quotedTable}
      where user_id = $1
      limit 1;
    `;
    const result = await pool.query(query, [normalizedUserId]);
    if (result.rows[0]) {
      return mapRowToStoredKeys(result.rows[0]);
    }

    const legacyKeys = await readLegacyStoredKeys();
    if (hasAnyApiKey(legacyKeys)) {
      await writeStoredKeys(normalizedUserId, legacyKeys);
      return legacyKeys;
    }

    return mapRowToStoredKeys({});
  }

  async function writeStoredKeys(userId, nextKeys) {
    const normalizedUserId = normalizeUserId(userId);
    const query = `
      insert into ${quotedSchema}.${quotedTable}
      (
        user_id,
        gemini_api_key,
        openrouter_api_key,
        groq_api_key,
        aimlapi_api_key,
        huggingface_api_key,
        pollinations_api_key,
        replicate_api_key,
        pollo_api_key,
        bfl_api_key,
        renderful_api_key,
        kie_api_key,
        fal_api_key
      )
      values
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      on conflict (user_id) do update
      set
        gemini_api_key = excluded.gemini_api_key,
        openrouter_api_key = excluded.openrouter_api_key,
        groq_api_key = excluded.groq_api_key,
        aimlapi_api_key = excluded.aimlapi_api_key,
        huggingface_api_key = excluded.huggingface_api_key,
        pollinations_api_key = excluded.pollinations_api_key,
        replicate_api_key = excluded.replicate_api_key,
        pollo_api_key = excluded.pollo_api_key,
        bfl_api_key = excluded.bfl_api_key,
        renderful_api_key = excluded.renderful_api_key,
        kie_api_key = excluded.kie_api_key,
        fal_api_key = excluded.fal_api_key,
        updated_at = now()
    `;

    await pool.query(query, [
      normalizedUserId,
      nextKeys.geminiApiKey || '',
      nextKeys.openrouterApiKey || '',
      nextKeys.groqApiKey || '',
      nextKeys.aimlapiApiKey || '',
      nextKeys.huggingfaceApiKey || '',
      nextKeys.pollinationsApiKey || '',
      nextKeys.replicateApiKey || '',
      nextKeys.polloApiKey || '',
      nextKeys.bflApiKey || '',
      nextKeys.renderfulApiKey || '',
      nextKeys.kieApiKey || '',
      nextKeys.falApiKey || ''
    ]);

    return readStoredKeys(normalizedUserId);
  }

  return {
    init,
    readStoredKeys,
    writeStoredKeys
  };
}

module.exports = { createSupabaseStore };
