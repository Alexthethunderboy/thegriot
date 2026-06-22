-- Create media table for rich attachments to entities
CREATE TABLE IF NOT EXISTS media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    media_type VARCHAR(50) NOT NULL, -- 'image', 'audio', 'video', 'document'
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_entity_id ON media(entity_id);
