/** Types mirroring backend/app/schemas/api_key.py */

export interface ApiKeyCreatedResponse {
  id: string;
  name: string;
  /** Plaintext key — present ONLY in the create response, never again. */
  key: string;
  key_prefix: string;
  created_at: string;
}

export interface ApiKeyResponse {
  id: string;
  name: string;
  key_prefix: string;
  created_by: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}
