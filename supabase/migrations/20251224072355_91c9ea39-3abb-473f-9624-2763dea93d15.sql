-- Add is_active column to cr_blueprint_components
ALTER TABLE public.cr_blueprint_components 
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Set deprecated/merged components to inactive
UPDATE public.cr_blueprint_components 
SET is_active = false 
WHERE component_key IN ('positioning', 'hooks', 'system', 'launch_sequence', 'crisis_mgmt', 'superfan_funnel');

-- Re-order the active components (1-10)
UPDATE public.cr_blueprint_components SET order_index = 1 WHERE component_key = 'ikigai';
UPDATE public.cr_blueprint_components SET order_index = 2 WHERE component_key = 'archetype';
UPDATE public.cr_blueprint_components SET order_index = 3 WHERE component_key = 'avatar';
UPDATE public.cr_blueprint_components SET order_index = 4 WHERE component_key = 'templates';
UPDATE public.cr_blueprint_components SET order_index = 5 WHERE component_key = 'blueprint';
UPDATE public.cr_blueprint_components SET order_index = 6 WHERE component_key = 'monetization';
UPDATE public.cr_blueprint_components SET order_index = 7 WHERE component_key = 'roadmap';
UPDATE public.cr_blueprint_components SET order_index = 8 WHERE component_key = 'collab';
UPDATE public.cr_blueprint_components SET order_index = 9 WHERE component_key = 'analytics';
UPDATE public.cr_blueprint_components SET order_index = 10 WHERE component_key = 'mindset';