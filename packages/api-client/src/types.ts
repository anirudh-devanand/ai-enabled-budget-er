export interface UserResponse {
  id: string;
  email: string;
  display_name: string;
  mfa_enabled: boolean;
  created_at: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
}

export interface MfaChallengeResponse {
  mfa_required: true;
  challenge_token: string;
}

export type LoginResponse = TokenPair | MfaChallengeResponse;

export interface HouseholdResponse {
  id: string;
  name: string;
  created_at: string;
}

export interface HouseholdMemberResponse {
  user_id: string;
  role: "owner" | "member";
  created_at: string;
}

export interface HouseholdDetailResponse extends HouseholdResponse {
  members: HouseholdMemberResponse[];
}

export interface MfaEnrollResponse {
  secret: string;
  otpauth_uri: string;
}

export function isMfaChallenge(r: LoginResponse): r is MfaChallengeResponse {
  return (r as MfaChallengeResponse).mfa_required === true;
}

export interface ConnectionResponse {
  id: string;
  household_id: string;
  provider: string;
  institution_name: string | null;
  status: "pending" | "active" | "error";
  last_synced_at: string | null;
  created_at: string;
}

export interface AccountResponse {
  id: string;
  connection_id: string;
  name: string;
  type: string;
  currency: string;
  balance: string;
  masked_number: string | null;
}

export interface TransactionResponse {
  id: string;
  account_id: string;
  date: string;
  raw_description: string;
  amount: string;
  currency: string;
  display_name: string;
  merchant_name: string | null;
  category_id: string | null;
  category_name: string | null;
  needs_review: boolean;
}

export interface TransactionListResponse {
  items: TransactionResponse[];
  total: number;
}

export interface CategoryResponse {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
}

export interface TransactionCorrectionResponse {
  transaction_id: string;
  category_id: string;
  merchant_name: string | null;
  reapplied_count: number;
}
