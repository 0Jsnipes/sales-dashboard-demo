type GmailTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
};

type GmailMessageListResponse = {
  messages?: Array<{ id: string; threadId: string }>;
  resultSizeEstimate?: number;
};

type GmailHeader = { name: string; value: string };

type GmailPartBody = {
  attachmentId?: string;
  data?: string;
  size?: number;
};

type GmailMessagePart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: GmailPartBody;
  parts?: GmailMessagePart[];
};

type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailMessagePart;
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function gmailAccessToken() {
  const clientId = requireEnv("GMAIL_CLIENT_ID");
  const clientSecret = requireEnv("GMAIL_CLIENT_SECRET");
  const refreshToken = requireEnv("GMAIL_REFRESH_TOKEN");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json() as Partial<GmailTokenResponse> & { error?: string; error_description?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Unable to get Gmail access token.");
  }
  return data.access_token;
}

async function gmailRequest<T>(path: string, init?: RequestInit) {
  const accessToken = await gmailAccessToken();
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  const data = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || `Gmail API request failed for ${path}.`);
  return data;
}

function headerValue(headers: GmailHeader[] | undefined, name: string) {
  return headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function collectAttachmentParts(parts: GmailMessagePart[] = [], results: GmailMessagePart[] = []) {
  for (const part of parts) {
    if (part.filename && (part.body?.attachmentId || part.body?.data)) results.push(part);
    if (part.parts?.length) collectAttachmentParts(part.parts, results);
  }
  return results;
}

async function attachmentBuffer(messageId: string, part: GmailMessagePart) {
  const inlineData = part.body?.data;
  if (inlineData) return Buffer.from(inlineData, "base64url");
  const attachmentId = part.body?.attachmentId;
  if (!attachmentId) throw new Error(`Attachment missing for message ${messageId}.`);
  const response = await gmailRequest<{ data?: string }>(`messages/${messageId}/attachments/${attachmentId}`);
  if (!response.data) throw new Error(`Attachment data missing for message ${messageId}.`);
  return Buffer.from(response.data, "base64url");
}

export async function listReportMessages(maxResults = 10) {
  const query = process.env.GMAIL_REPORTS_QUERY?.trim() || "in:inbox has:attachment is:unread";
  const response = await gmailRequest<GmailMessageListResponse>(`messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`);
  return response.messages ?? [];
}

export async function getReportMessage(messageId: string) {
  const message = await gmailRequest<GmailMessage>(`messages/${messageId}?format=full`);
  const payload = message.payload;
  const topHeaders = payload?.headers ?? [];
  const parts = collectAttachmentParts(payload?.parts ?? []);
  const attachments = [];
  for (const part of parts) {
    attachments.push({
      fileName: part.filename || "attachment",
      contentType: part.mimeType || "application/octet-stream",
      buffer: await attachmentBuffer(message.id, part),
    });
  }
  return {
    id: message.id,
    threadId: message.threadId,
    subject: headerValue(topHeaders, "Subject"),
    from: headerValue(topHeaders, "From"),
    attachments,
  };
}

export async function markMessageProcessed(messageId: string) {
  const addLabelIds = process.env.GMAIL_PROCESSED_LABEL_ID?.trim() ? [process.env.GMAIL_PROCESSED_LABEL_ID.trim()] : [];
  await gmailRequest(`messages/${messageId}/modify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      removeLabelIds: ["UNREAD"],
      addLabelIds,
    }),
  });
}
