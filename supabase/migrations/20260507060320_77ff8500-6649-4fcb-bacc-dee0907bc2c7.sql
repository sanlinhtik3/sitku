
DO $$
DECLARE
  sys_user uuid;
  new_id uuid;
  doc record;
BEGIN
  SELECT user_id INTO sys_user FROM public.user_roles WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1;
  IF sys_user IS NULL THEN
    SELECT id INTO sys_user FROM auth.users ORDER BY created_at ASC LIMIT 1;
  END IF;
  IF sys_user IS NULL THEN RAISE NOTICE 'No users — skipping seed'; RETURN; END IF;

  FOR doc IN
    SELECT * FROM (VALUES
      ('agent_widget_playbook', 'Widget: kpi_dashboard',
       'USE WHEN >=3 numeric KPIs to compare. Tool: show_widget. preset="kpi_dashboard". data={kpis:[{label,value,delta?,trend?,unit?,sublabel?}], title?}. EXAMPLE: {"preset":"kpi_dashboard","data":{"kpis":[{"label":"Revenue","value":"$12.4K","delta":18,"trend":"up","unit":"%"},{"label":"Burn","value":"$8.1K","delta":-5,"trend":"down"},{"label":"Runway","value":"14","unit":"mo"}]}}. PAIRS WITH: cfo_runway_analysis, cfo_pnl_summary, strategy_okr_tracker.'),
      ('agent_widget_playbook', 'Widget: bar_chart',
       'USE WHEN comparing >=3 categories numerically. preset="bar_chart". data={labels[],values[],title?,color?,horizontal?,unit?}. EXAMPLE: {"preset":"bar_chart","data":{"labels":["Food","Rent","Transport"],"values":[320,800,150],"unit":"$"}}. Use horizontal:true for >6 categories or long labels.'),
      ('agent_widget_playbook', 'Widget: line_chart',
       'USE WHEN trend over >=4 time points (multi-series allowed). preset="line_chart". data={labels[],series:[{name,values[],color?}],title?,unit?}. EXAMPLE cashflow forecast with two series Income and Expense over 6 months.'),
      ('agent_widget_playbook', 'Widget: donut_chart',
       'USE WHEN show parts of a whole (allocation, share, %). preset="donut_chart". data={segments:[{label,value,color?}],title?,centerLabel?}.'),
      ('agent_widget_playbook', 'Widget: progress_bars',
       'USE WHEN multi-step status / quotas / utilization. preset="progress_bars". data={items:[{label,value,max?,color?,sublabel?}],title?}. EXAMPLE budget status with Food 280/400.'),
      ('agent_widget_playbook', 'Widget: stat_grid',
       'USE WHEN 4-12 quick stats (no charting). preset="stat_grid". data={stats:[{label,value,icon?,color?}],columns?,title?}.'),
      ('agent_widget_playbook', 'Widget: data_table',
       'USE WHEN >=4 columns of structured rows. preset="data_table". data={columns:[{key,label,type?:"text|number|badge|progress"}],rows[],title?,footer?}.'),
      ('agent_widget_playbook', 'Widget: comparison_table',
       'USE WHEN compare same attributes across alternatives. preset="comparison_table". data={columns[],rows:[{label,values[]}],highlight?}.'),
      ('agent_widget_playbook', 'Widget: timeline',
       'USE WHEN milestones with dates. preset="timeline". data={events:[{date,title,description?,status?:"completed|active|upcoming"}]}.'),
      ('agent_widget_playbook', 'Widget: scorecard',
       'USE WHEN single-screen executive scorecard (<=6 metrics). preset="scorecard". data={metrics:[{label,value,delta?,unit?}],title?}.'),
      ('agent_widget_playbook', 'Widget: progress_tracker',
       'USE WHEN linear multi-step status (onboarding, deployment, OKR). preset="progress_tracker". data={steps:[{label,status?:"completed|active|upcoming"}],current?}.'),
      ('agent_widget_playbook', 'Widget: calendar_view',
       'USE WHEN monthly overview with events. preset="calendar_view". data={year?,month?,events:[{date,label?,color?}],title?}.'),
      ('agent_widget_playbook', 'Widget: gantt_chart',
       'USE WHEN project timeline with task bars. preset="gantt_chart". data={tasks:[{label,start,end,color?,status?}],title?}.'),
      ('agent_widget_playbook', 'Widget: pricing_cards',
       'USE WHEN compare plans/tiers with CTA. preset="pricing_cards". INTERACTIVE — clicks post back via window.beebot.send().'),
      ('agent_widget_playbook', 'Widget: image_gallery',
       'USE WHEN >=3 images grid. preset="image_gallery". data={images:[{url,caption?}],columns?,title?}.'),
      ('agent_widget_playbook', 'Widget: code_diff',
       'USE WHEN show before/after code. preset="code_diff". data={lines:[{type:"add|remove|context",text,lineNumber?}],title?,language?}.'),
      ('agent_widget_playbook', 'Widget: tree_view',
       'USE WHEN hierarchical structure (file tree, taxonomy). preset="tree_view". data={nodes:[{label,children?,icon?,meta?}],title?}. CLICKABLE nodes -> follow-up question.'),
      ('agent_widget_playbook', 'Widget: map_pins',
       'USE WHEN spatial pins on abstract canvas. preset="map_pins".'),
      ('agent_widget_playbook', 'Widget: quiz_card',
       'USE WHEN ask user to pick an option. preset="quiz_card". INTERACTIVE.'),
      ('agent_widget_playbook', 'Widget: form_builder',
       'USE WHEN collect structured input. preset="form_builder". INTERACTIVE.'),
      ('agent_widget_playbook', 'Widget: flowchart',
       'USE WHEN process / decision flow / how it works. preset="flowchart". data={nodes:[{id,label,type?:"start|end|decision|process"}],edges:[{from,to,label?}],direction?:"TB|LR",title?}. Mermaid-rendered, nodes clickable.'),
      ('agent_widget_playbook', 'Widget: mindmap',
       'USE WHEN brainstorm / taxonomy / idea breakdown. preset="mindmap". data={root:{label},branches:[{label,children?}],title?}.'),
      ('agent_widget_playbook', 'Widget: sequence_diagram',
       'USE WHEN actor interactions / API call sequence. preset="sequence_diagram". data={actors:[name],steps:[{from,to,message}],title?}.'),
      ('agent_widget_playbook', 'Widget: org_chart',
       'USE WHEN reporting lines / team hierarchy. preset="org_chart".'),
      ('agent_widget_playbook', 'Widget: network_graph',
       'USE WHEN relationships / dependencies / Porters Five Forces. preset="network_graph". data={nodes:[{id,label?,group?}],links:[{source,target,weight?}],title?}.'),
      ('agent_widget_playbook', 'Widget: dashboard (composite)',
       'USE WHEN >=3 widgets belong on one screen (KPIs + chart + table). preset="dashboard". data={title?,density?,sections:[{id?,preset,data,span?:1-12,title?,note?}]}. SPAN: full=12, half=6, third=4. Always prefer ONE composite over multiple show_widget calls.'),
      ('agent_widget_playbook', 'Meta: Click-to-Explore',
       'KPI cards, chart bars/segments, donut arcs, tree nodes, and ALL diagram nodes are clickable. They post a follow-up question into the chat via window.beebot.send().'),
      ('agent_widget_playbook', 'Meta: Anti-Prose Rule',
       'When the answer contains >=3 numeric facts, >=4 list items, or any comparison, you MUST emit a widget — not a paragraph. NEVER repeat numbers in prose after rendering a widget; let the widget speak.'),
      ('agent_widget_playbook', 'Meta: Composite Dashboard Recipe',
       'For executive view requests: preset="dashboard". Recipe: kpi_dashboard span:12 (3-6 KPIs), then line_chart span:8 + donut_chart span:4, then data_table span:12. Density: <=6 points=roomy, 7-20=comfortable, >20=compact.'),
      ('agent_widget_playbook', 'Meta: Diagram Cheat-Sheet',
       'flowchart=process; mindmap=ideas; sequence_diagram=API/actor calls; org_chart=hierarchy; network_graph=relationships. All Mermaid-rendered, mobile-first responsive, clickable. Keep nodes <=25.'),

      ('cfo_playbook', 'CFO: Cash-Flow Forecast',
       'Project 3/6/12-month income vs expense based on FlowState transactions. Tool: cfo_cashflow_forecast (months_ahead). ALWAYS render as line_chart (Income, Expense series) + scorecard (Net, Burn rate, Months to zero). Assumptions: trailing 90-day average.'),
      ('cfo_playbook', 'CFO: Runway Analysis',
       'Runway = current cash / monthly burn. Tool: cfo_runway_analysis. Render kpi_dashboard (Cash, Burn, Runway months, Trend) + gantt of remaining months color-coded green/amber/red. Recommend hiring freeze, pricing, fundraise based on runway.'),
      ('cfo_playbook', 'CFO: Unit Economics CAC LTV',
       'CAC = sales+marketing spend / new customers. LTV = ARPU * gross margin / churn. Healthy: LTV/CAC >= 3, CAC payback <= 12mo. Tool: cfo_unit_economics. Render scorecard + bar_chart by cohort.'),
      ('cfo_playbook', 'CFO: Break-Even Analysis',
       'Break-even units = fixed costs / (price - variable cost). Render line_chart (revenue vs total cost) with break-even marker + KPI.'),
      ('cfo_playbook', 'CFO: P&L Summary',
       'Period P&L = Revenue - COGS - OpEx - Taxes = Net Income. Tool: cfo_pnl_summary. Render dashboard composite: KPIs + bar_chart by category + data_table line items.'),
      ('cfo_playbook', 'CFO: Financial KPI Library',
       'Standard KPIs: MRR, ARR, ARPU, CAC, LTV, Churn, Gross Margin, Burn Multiple, Magic Number, Rule of 40. Always quantify with delta vs prior period. Use kpi_dashboard with delta+trend.'),

      ('strategy_consulting', 'Strategy: SWOT Analysis',
       'Strengths/Weaknesses (internal) x Opportunities/Threats (external). Tool: strategy_swot_analysis. Render preset="dashboard" with 4 progress_bars sections (S/W/O/T) span:6 each, OR a 2x2 data_table. 3-5 items per quadrant.'),
      ('strategy_consulting', 'Strategy: Porters Five Forces',
       'Competitive Rivalry, Supplier Power, Buyer Power, Threat of Substitutes, Threat of New Entrants. Score 1-5 each. Tool: strategy_porter_five_forces. Render network_graph + scorecard.'),
      ('strategy_consulting', 'Strategy: BCG Growth-Share Matrix',
       'Stars (high growth/share), Cash Cows (low growth/high share), Question Marks, Dogs. Render bar_chart with quadrant labels OR data_table 4 rows + recommended action.'),
      ('strategy_consulting', 'Strategy: Ansoff Matrix',
       'Market Penetration, Product Development, Market Development, Diversification. Render data_table 2x2 with risk score per cell.'),
      ('strategy_consulting', 'Strategy: Lean Canvas',
       '9 blocks: Problem, Customer Segments, UVP, Solution, Channels, Revenue Streams, Cost Structure, Key Metrics, Unfair Advantage. Tool: strategy_lean_canvas. Render preset="dashboard" with 9 stat_grid sections span:4 each.'),
      ('strategy_consulting', 'Strategy: OKR Tracker',
       'Objective + 3-5 Key Results (0-100% progress). Tool: strategy_okr_tracker. Render progress_tracker + kpi_dashboard. Healthy = 60-70% achievement.'),
      ('strategy_consulting', 'Strategy: McKinsey 7S',
       'Strategy, Structure, Systems (hard) + Shared Values, Skills, Style, Staff (soft). Render network_graph (7 nodes around Shared Values) + scorecard (alignment 1-5).'),
      ('strategy_consulting', 'Strategy: Roadmap Planning',
       'Initiatives with start/end, owner, status. Tool: strategy_roadmap. Render gantt_chart by quarter + progress_tracker. Group: Now (0-3mo), Next (3-6mo), Later (6-12mo).')
    ) AS t(category, title, content)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.ai_generated_content
      WHERE category = doc.category AND title = doc.title AND source_type = 'system_doc'
    ) THEN
      INSERT INTO public.ai_generated_content (
        user_id, title, content, category, language, is_global, is_template,
        source_type, quality_score, tags
      ) VALUES (
        sys_user, doc.title, doc.content, doc.category, 'english',
        true, true, 'system_doc', 95,
        CASE doc.category
          WHEN 'agent_widget_playbook' THEN ARRAY['widget','playbook','visualization','system']
          WHEN 'cfo_playbook' THEN ARRAY['cfo','finance','playbook','system']
          ELSE ARRAY['strategy','consulting','playbook','system']
        END
      ) RETURNING id INTO new_id;

      INSERT INTO public.kb_embedding_sync_queue (content_id, action, status)
      VALUES (new_id, 'create', 'pending')
      ON CONFLICT (content_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;
