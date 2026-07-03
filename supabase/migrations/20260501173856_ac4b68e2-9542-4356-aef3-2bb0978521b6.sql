-- F9: Drop legacy agent_episodic_memory table
-- All active writes were rerouted to chat_memory_embeddings.
-- All read references in code have been removed in this batch.
DROP TABLE IF EXISTS public.agent_episodic_memory CASCADE;