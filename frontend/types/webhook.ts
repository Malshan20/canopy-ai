/** Types mirroring backend/app/schemas/webhook.py */

export interface WebhookCreatedResponse {
  id: string;
  url: string;
  /** HMAC signing secret — present ONLY in the create response, never again. */
  secret: string;
  enabled: boolean;
  created_at: string;
}

export interface WebhookResponse {
  id: string;
  url: string;
  enabled: boolean;
  last_triggered_at: string | null;
  last_status_code: number | null;
  created_at: string;
}
