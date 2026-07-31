export interface UserResponse {
  id: string;
  email: string;
  display_name: string;
  mfa_enabled: boolean;
  authenticator_enabled?: boolean;
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
  primary_method?: "email" | "totp" | "inline";
  totp_available?: boolean;
  message?: string;
  dev_code?: string | null;
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

export interface MfaActivateResponse {
  recovery_codes: string[];
}

export interface DeleteRequestResponse {
  delivery: "email" | "totp" | "inline";
  expires_in_seconds: number;
  requires_password: boolean;
  message: string;
  code: string | null;
}

export interface DeleteConfirmRequest {
  code: string;
  confirm: "DELETE";
  password?: string;
  email_confirm?: string;
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

export interface SyncReauthRequired {
  connection_id: string;
  household_id: string;
  institution_name: string | null;
  code: string;
}

export interface SyncMineResponse {
  synced: number;
  failed: number;
  skipped: number;
  reauth_required?: SyncReauthRequired[];
}

export interface AccountResponse {
  id: string;
  connection_id: string;
  name: string;
  type: string;
  currency: string;
  balance: string;
  masked_number: string | null;
  nickname?: string | null;
  notes?: string | null;
  hidden?: boolean;
  display_name?: string | null;
  institution_name?: string | null;
}

export interface AccountDetailResponse extends AccountResponse {
  recent_transactions: TransactionResponse[];
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

export interface TransactionFilters {
  limit?: number;
  offset?: number;
  needsReview?: boolean;
  accountId?: string;
  categoryId?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  minAmount?: string;
  maxAmount?: string;
}

export interface CategoryResponse {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
  icon_key?: string | null;
  color?: string | null;
}

export interface OAuthProvider {
  id: string;
  name: string;
  enabled: boolean;
  auth_url: string | null;
}

export interface TransactionCorrectionResponse {
  transaction_id: string;
  category_id: string;
  merchant_name: string | null;
  reapplied_count: number;
}

export interface BudgetResponse {
  id: string;
  household_id: string;
  name: string;
  mode: string;
  currency: string;
}

export interface BudgetCategoryStatus {
  category_id: string;
  target: string;
  actual: string;
  remaining: string;
  rollover: boolean;
}

export interface BudgetDetailResponse extends BudgetResponse {
  period_start: string | null;
  period_end: string | null;
  categories: BudgetCategoryStatus[];
}

export type GoalType = "save" | "debt_payoff" | "emergency_fund" | "custom";
export type GoalPriority = "low" | "medium" | "high";
export type GoalStatus = "active" | "paused" | "completed";

export interface GoalResponse {
  id: string;
  household_id: string;
  name: string;
  type: GoalType | string;
  target_amount: string;
  current_amount: string;
  target_date: string | null;
  start_date: string | null;
  notes: string | null;
  priority: GoalPriority | string;
  currency: string;
  status: GoalStatus | string;
  progress_pct: number;
  remaining: string;
  days_left: number | null;
  monthly_needed: string;
  on_track: boolean | null;
}

export interface GoalCreateInput {
  household_id: string;
  name: string;
  type?: GoalType | string;
  target_amount: string;
  current_amount?: string;
  target_date?: string | null;
  start_date?: string | null;
  notes?: string | null;
  priority?: GoalPriority | string;
  currency?: string;
}

export interface GoalUpdateInput {
  name?: string;
  type?: GoalType | string;
  target_amount?: string;
  current_amount?: string;
  target_date?: string | null;
  start_date?: string | null;
  notes?: string | null;
  priority?: GoalPriority | string;
  status?: GoalStatus | string;
  currency?: string;
}

export interface CashFlowPoint {
  date: string;
  income: string;
  spending: string;
  net: string;
}

export interface PeriodSummary {
  days: number;
  income_total: string;
  spending_total: string;
  net: string;
  currency: string;
}

export interface PlanItemResponse {
  id: string;
  action: string;
  amount: string;
  rationale: string;
  category_id: string | null;
}

export interface PlanResponse {
  id: string;
  goal_id: string;
  summary: string;
  monthly_surplus_needed: string;
  projected_completion: string | null;
  items: PlanItemResponse[];
}

export interface NetWorthResponse {
  total: string;
  currency: string;
  accounts: { id: string; name: string; balance: string; type: string }[];
}

export interface NamedAmount {
  name: string;
  amount: string;
  category_id?: string;
  merchant_id?: string;
}

export interface MessageResponse {
  id: string;
  role: string;
  content: string;
  tool_name: string | null;
}

export interface ConversationResponse {
  id: string;
  household_id: string;
  title: string;
}
