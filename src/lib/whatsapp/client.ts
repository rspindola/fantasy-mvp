/**
 * WhatsApp Cloud API client using Meta Graph API.
 * Sends template messages via the official WhatsApp Business Platform.
 *
 * Requires environment variables:
 * - WHATSAPP_PHONE_NUMBER_ID: The Phone Number ID from Meta Business
 * - WHATSAPP_ACCESS_TOKEN: System User Access Token with whatsapp_business_messaging permission
 */

const GRAPH_API_VERSION = 'v22.0'

interface TemplateParameter {
  type: 'text'
  text: string
}

interface TemplateComponent {
  type: 'body'
  parameters: TemplateParameter[]
}

interface SendTemplateOptions {
  to: string // E.164 format: +5511999998888
  templateName: string
  languageCode?: string
  bodyParameters?: string[]
}

interface WhatsAppApiResponse {
  messaging_product: string
  contacts: { input: string; wa_id: string }[]
  messages: { id: string }[]
}

interface WhatsAppApiError {
  error: {
    message: string
    type: string
    code: number
    fbtrace_id: string
  }
}

/**
 * Sends a WhatsApp template message via the Meta Cloud API.
 * Returns the message ID on success, or null if sending fails.
 */
export async function sendTemplateMessage(
  options: SendTemplateOptions
): Promise<string | null> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    console.warn(
      '[WhatsApp] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN. Skipping notification.'
    )
    return null
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`

  // Build template components
  const components: TemplateComponent[] = []
  if (options.bodyParameters && options.bodyParameters.length > 0) {
    components.push({
      type: 'body',
      parameters: options.bodyParameters.map((text) => ({
        type: 'text' as const,
        text,
      })),
    })
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: options.to.replace(/\D/g, ''), // Strip non-digits for API
    type: 'template',
    template: {
      name: options.templateName,
      language: { code: options.languageCode ?? 'pt_BR' },
      ...(components.length > 0 ? { components } : {}),
    },
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = (await response.json()) as WhatsAppApiError
      console.error(
        `[WhatsApp] API error ${response.status}:`,
        errorData.error?.message ?? 'Unknown error'
      )
      return null
    }

    const data = (await response.json()) as WhatsAppApiResponse
    const messageId = data.messages?.[0]?.id ?? null

    if (messageId) {
      console.log(`[WhatsApp] Message sent successfully: ${messageId}`)
    }

    return messageId
  } catch (error) {
    console.error('[WhatsApp] Failed to send message:', error)
    return null
  }
}
