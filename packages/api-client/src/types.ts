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
