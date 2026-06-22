CREATE TABLE IF NOT EXISTS public.claim_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID REFERENCES public.claims(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    vote_type TEXT CHECK (vote_type IN ('verify', 'contest')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(claim_id, user_id)
);

CREATE OR REPLACE FUNCTION vote_claim(p_claim_id UUID, p_vote_type TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_verifications INT;
    v_contests INT;
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Upsert the vote
    INSERT INTO public.claim_votes (claim_id, user_id, vote_type)
    VALUES (p_claim_id, v_user_id, p_vote_type)
    ON CONFLICT (claim_id, user_id) 
    DO UPDATE SET vote_type = EXCLUDED.vote_type, created_at = NOW();

    -- Calculate new totals
    SELECT COUNT(*) INTO v_verifications FROM public.claim_votes WHERE claim_id = p_claim_id AND vote_type = 'verify';
    SELECT COUNT(*) INTO v_contests FROM public.claim_votes WHERE claim_id = p_claim_id AND vote_type = 'contest';

    RETURN json_build_object(
        'verifications', v_verifications,
        'contests', v_contests
    );
END;
$$;

CREATE OR REPLACE FUNCTION get_claim_votes(p_claim_ids UUID[])
RETURNS TABLE (
    claim_id UUID,
    verifications BIGINT,
    contests BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT 
        c.claim_id,
        COUNT(*) FILTER (WHERE c.vote_type = 'verify') as verifications,
        COUNT(*) FILTER (WHERE c.vote_type = 'contest') as contests
    FROM public.claim_votes c
    WHERE c.claim_id = ANY(p_claim_ids)
    GROUP BY c.claim_id;
$$;
