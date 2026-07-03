// ═══ Notion API Tool Executor ═══
// Native Notion integration for BeeBot — no external MCP required

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

interface NotionHeaders {
  Authorization: string;
  "Notion-Version": string;
  "Content-Type": string;
}

function buildHeaders(apiKey: string): NotionHeaders {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

async function notionFetch(apiKey: string, path: string, options: RequestInit = {}): Promise<any> {
  const resp = await fetch(`${NOTION_API_BASE}${path}`, {
    ...options,
    headers: { ...buildHeaders(apiKey), ...(options.headers || {}) },
  });
  
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Notion API error [${resp.status}]: ${data.message || JSON.stringify(data)}`);
  }
  return data;
}

// ═══ Helper: Extract readable text from Notion blocks ═══
function extractBlockText(block: any): string {
  const type = block.type;
  const content = block[type];
  if (!content) return "";
  
  if (content.rich_text) {
    return content.rich_text.map((t: any) => t.plain_text).join("");
  }
  if (content.title) {
    return content.title.map((t: any) => t.plain_text).join("");
  }
  return "";
}

function extractPageTitle(page: any): string {
  const props = page.properties || {};
  for (const key of Object.keys(props)) {
    const prop = props[key];
    if (prop.type === "title" && prop.title?.length > 0) {
      return prop.title.map((t: any) => t.plain_text).join("");
    }
  }
  return "Untitled";
}

function formatPageSummary(page: any): any {
  return {
    id: page.id,
    title: extractPageTitle(page),
    url: page.url,
    created_time: page.created_time,
    last_edited_time: page.last_edited_time,
    archived: page.archived,
    object: page.object,
  };
}

// ═══ Actions ═══

async function searchNotion(apiKey: string, args: any) {
  const body: any = {};
  if (args.query) body.query = args.query;
  if (args.filter_type) body.filter = { value: args.filter_type, property: "object" };
  if (args.page_size) body.page_size = Math.min(args.page_size, 20);
  else body.page_size = 10;
  
  const data = await notionFetch(apiKey, "/search", {
    method: "POST",
    body: JSON.stringify(body),
  });
  
  return {
    success: true,
    results: data.results.map(formatPageSummary),
    total: data.results.length,
    has_more: data.has_more,
  };
}

async function getPage(apiKey: string, args: any) {
  if (!args.page_id) throw new Error("page_id is required");
  
  const page = await notionFetch(apiKey, `/pages/${args.page_id}`);
  
  // Also fetch blocks (content)
  const blocks = await notionFetch(apiKey, `/blocks/${args.page_id}/children?page_size=50`);
  
  const content = blocks.results
    .map((b: any) => ({ type: b.type, text: extractBlockText(b), id: b.id }))
    .filter((b: any) => b.text);
  
  return {
    success: true,
    page: formatPageSummary(page),
    properties: page.properties,
    content,
  };
}

async function listDatabases(apiKey: string, args: any) {
  const data = await notionFetch(apiKey, "/search", {
    method: "POST",
    body: JSON.stringify({
      filter: { value: "database", property: "object" },
      page_size: args.page_size || 10,
    }),
  });
  
  return {
    success: true,
    databases: data.results.map((db: any) => ({
      id: db.id,
      title: db.title?.map((t: any) => t.plain_text).join("") || "Untitled",
      url: db.url,
      properties: Object.keys(db.properties || {}),
    })),
    total: data.results.length,
  };
}

async function queryDatabase(apiKey: string, args: any) {
  if (!args.database_id) throw new Error("database_id is required");
  
  const body: any = { page_size: Math.min(args.page_size || 10, 20) };
  if (args.filter) body.filter = args.filter;
  if (args.sorts) body.sorts = args.sorts;
  
  const data = await notionFetch(apiKey, `/databases/${args.database_id}/query`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  
  return {
    success: true,
    results: data.results.map(formatPageSummary),
    total: data.results.length,
    has_more: data.has_more,
  };
}

async function createPage(apiKey: string, args: any) {
  if (!args.parent_id) throw new Error("parent_id is required");
  if (!args.title) throw new Error("title is required");
  
  const body: any = {
    parent: args.parent_type === "database"
      ? { database_id: args.parent_id }
      : { page_id: args.parent_id },
    properties: {},
  };
  
  // Set title
  if (args.parent_type === "database" && args.title_property) {
    body.properties[args.title_property] = {
      title: [{ text: { content: args.title } }],
    };
  } else {
    body.properties.title = {
      title: [{ text: { content: args.title } }],
    };
  }
  
  // Add content blocks
  if (args.content) {
    body.children = [{
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [{ type: "text", text: { content: args.content } }],
      },
    }];
  }
  
  // Add extra blocks
  if (args.blocks && Array.isArray(args.blocks)) {
    body.children = args.blocks;
  }
  
  const page = await notionFetch(apiKey, "/pages", {
    method: "POST",
    body: JSON.stringify(body),
  });
  
  return {
    success: true,
    page: formatPageSummary(page),
    message: `Page "${args.title}" created successfully.`,
  };
}

async function updatePage(apiKey: string, args: any) {
  if (!args.page_id) throw new Error("page_id is required");
  
  const body: any = {};
  if (args.properties) body.properties = args.properties;
  if (args.archived !== undefined) body.archived = args.archived;
  
  const page = await notionFetch(apiKey, `/pages/${args.page_id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  
  return {
    success: true,
    page: formatPageSummary(page),
    message: "Page updated successfully.",
  };
}

async function appendBlocks(apiKey: string, args: any) {
  if (!args.page_id) throw new Error("page_id is required");
  if (!args.content && !args.blocks) throw new Error("content or blocks required");
  
  let children: any[];
  if (args.blocks && Array.isArray(args.blocks)) {
    children = args.blocks;
  } else {
    children = [{
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [{ type: "text", text: { content: args.content } }],
      },
    }];
  }
  
  const result = await notionFetch(apiKey, `/blocks/${args.page_id}/children`, {
    method: "PATCH",
    body: JSON.stringify({ children }),
  });
  
  return {
    success: true,
    blocks_added: result.results?.length || children.length,
    message: "Content appended successfully.",
  };
}

async function deleteBlock(apiKey: string, args: any) {
  if (!args.block_id) throw new Error("block_id is required");
  
  await notionFetch(apiKey, `/blocks/${args.block_id}`, {
    method: "DELETE",
  });
  
  return {
    success: true,
    message: "Block archived/deleted successfully.",
  };
}

// ═══ Main Executor ═══
export async function executeManageNotion(
  supabase: any,
  userId: string,
  args: any,
): Promise<any> {
  const { action } = args;
  
  if (!action) {
    return { error: "Missing required parameter: action" };
  }
  
  // Fetch user's Notion API key
  const { data: settings, error: settingsError } = await supabase
    .from("ai_user_settings")
    .select("notion_api_key")
    .eq("user_id", userId)
    .maybeSingle();
  
  if (settingsError) {
    return { error: "Failed to load Notion settings" };
  }
  
  const apiKey = settings?.notion_api_key;
  if (!apiKey) {
    return {
      error: "Notion is not connected. Open Connectors → Notion and tap 'Connect with Notion' to authorize your workspace.",
      setup_required: true,
    };
  }
  
  try {
    switch (action) {
      case "search": return await searchNotion(apiKey, args);
      case "get_page": return await getPage(apiKey, args);
      case "list_databases": return await listDatabases(apiKey, args);
      case "query_database": return await queryDatabase(apiKey, args);
      case "create_page": return await createPage(apiKey, args);
      case "update_page": return await updatePage(apiKey, args);
      case "append_blocks": return await appendBlocks(apiKey, args);
      case "delete_block": return await deleteBlock(apiKey, args);
      default:
        return { error: `Unknown Notion action: ${action}` };
    }
  } catch (err: any) {
    console.error(`[Notion] Action "${action}" failed:`, err.message);
    return { error: err.message, action };
  }
}
