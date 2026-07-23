import type {
  AccountDetailResponse,
  AccountResponse,
  BudgetDetailResponse,
  BudgetResponse,
  CategoryResponse,
  ConnectionResponse,
  ConversationResponse,
  GoalResponse,
  HouseholdDetailResponse,
  HouseholdResponse,
  LoginResponse,
  MessageResponse,
  MfaEnrollResponse,
  MfaActivateResponse,
  NamedAmount,
  NetWorthResponse,
  OAuthProvider,
  PlanResponse,
  TokenPair,
  TransactionCorrectionResponse,
  TransactionFilters,
  TransactionListResponse,
  UserResponse,
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
  }
}

export interface TokenStorage {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  setTokens(tokens: TokenPair): void;
  clear(): void;
}

/** In-memory storage; web/mobile provide persistent implementations. */
export class MemoryTokenStorage implements TokenStorage {
  private access: string | null = null;
  private refresh: string | null = null;

  getAccessToken() {
    return this.access;
  }
  getRefreshToken() {
    return this.refresh;
  }
  setTokens(tokens: TokenPair) {
    this.access = tokens.access_token;
    this.refresh = tokens.refresh_token;
  }
  clear() {
    this.access = null;
    this.refresh = null;
  }
}

export class LedgerClient {
  constructor(
    private baseUrl: string,
    private storage: TokenStorage = new MemoryTokenStorage(),
  ) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts: { auth?: boolean; retried?: boolean } = {},
  ): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.auth) {
      const token = this.storage.getAccessToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (resp.status === 401 && opts.auth && !opts.retried) {
      const refreshed = await this.tryRefresh();
      if (refreshed) return this.request<T>(method, path, body, { ...opts, retried: true });
    }
    if (!resp.ok) {
      let detail = resp.statusText;
      try {
        const data = await resp.json();
        if (typeof data.detail === "string") detail = data.detail;
      } catch {
        // non-JSON error body
      }
      throw new ApiError(resp.status, detail);
    }
    if (resp.status === 204) return undefined as T;
    return (await resp.json()) as T;
  }

  private async tryRefresh(): Promise<boolean> {
    const refreshToken = this.storage.getRefreshToken();
    if (!refreshToken) return false;
    try {
      const pair = await this.request<TokenPair>("POST", "/v1/auth/refresh", {
        refresh_token: refreshToken,
      });
      this.storage.setTokens(pair);
      return true;
    } catch {
      this.storage.clear();
      return false;
    }
  }

  // --- auth ---

  register(email: string, password: string, displayName: string) {
    return this.request<UserResponse>("POST", "/v1/auth/register", {
      email,
      password,
      display_name: displayName,
    });
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    const result = await this.request<LoginResponse>("POST", "/v1/auth/login", {
      email,
      password,
    });
    if ("access_token" in result) this.storage.setTokens(result);
    return result;
  }

  async verifyMfa(challengeToken: string, code: string): Promise<TokenPair> {
    const pair = await this.request<TokenPair>("POST", "/v1/auth/mfa/verify", {
      challenge_token: challengeToken,
      code,
    });
    this.storage.setTokens(pair);
    return pair;
  }

  async logout(): Promise<void> {
    const refreshToken = this.storage.getRefreshToken();
    if (refreshToken) {
      await this.request<void>("POST", "/v1/auth/logout", { refresh_token: refreshToken }).catch(
        () => undefined,
      );
    }
    this.storage.clear();
  }

  logoutAll() {
    return this.request<void>("POST", "/v1/auth/logout-all", undefined, { auth: true });
  }

  enrollMfa() {
    return this.request<MfaEnrollResponse>("POST", "/v1/auth/mfa/enroll", undefined, {
      auth: true,
    });
  }

  activateMfa(code: string) {
    return this.request<MfaActivateResponse>("POST", "/v1/auth/mfa/activate", { code }, { auth: true });
  }

  regenerateRecoveryCodes() {
    return this.request<MfaActivateResponse>("POST", "/v1/auth/mfa/recovery-codes", undefined, {
      auth: true,
    });
  }

  // --- users ---

  me() {
    return this.request<UserResponse>("GET", "/v1/users/me", undefined, { auth: true });
  }

  updateMe(displayName: string) {
    return this.request<UserResponse>(
      "PATCH",
      "/v1/users/me",
      { display_name: displayName },
      { auth: true },
    );
  }

  listOAuthProviders() {
    return this.request<{ providers: OAuthProvider[] }>("GET", "/v1/auth/oauth/providers");
  }

  async loginWithGoogleCode(code: string, redirectUri?: string) {
    const result = await this.request<LoginResponse>("POST", "/v1/auth/oauth/google/callback", {
      code,
      redirect_uri: redirectUri,
    });
    if ("access_token" in result) this.storage.setTokens(result);
    return result;
  }

  // --- households ---

  listHouseholds() {
    return this.request<HouseholdResponse[]>("GET", "/v1/households/", undefined, { auth: true });
  }

  createHousehold(name: string) {
    return this.request<HouseholdResponse>("POST", "/v1/households/", { name }, { auth: true });
  }

  getHousehold(id: string) {
    return this.request<HouseholdDetailResponse>("GET", `/v1/households/${id}`, undefined, {
      auth: true,
    });
  }

  // --- bank connections ---

  createConnection(householdId: string, loginId: string) {
    return this.request<ConnectionResponse>(
      "POST",
      "/v1/connections/",
      { household_id: householdId, login_id: loginId },
      { auth: true },
    );
  }

  createPlaidLinkToken(householdId: string) {
    return this.request<{ link_token: string }>(
      "POST",
      "/v1/connections/plaid/link-token",
      { household_id: householdId },
      { auth: true },
    );
  }

  createPlaidConnection(householdId: string, publicToken: string) {
    return this.request<ConnectionResponse>(
      "POST",
      "/v1/connections/plaid",
      { household_id: householdId, public_token: publicToken },
      { auth: true },
    );
  }

  async importCsvStatement(input: {
    householdId: string;
    accountName: string;
    accountType?: string;
    currency?: string;
    institutionName?: string;
    file: Blob;
    fileName?: string;
  }): Promise<{ connection: ConnectionResponse; imported_transactions: number }> {
    const form = new FormData();
    form.append("household_id", input.householdId);
    form.append("account_name", input.accountName);
    form.append("account_type", input.accountType ?? "chequing");
    form.append("currency", input.currency ?? "CAD");
    if (input.institutionName) form.append("institution_name", input.institutionName);
    form.append("file", input.file, input.fileName ?? "statement.csv");

    const headers: Record<string, string> = {};
    const token = this.storage.getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const resp = await fetch(`${this.baseUrl}/v1/connections/import`, {
      method: "POST",
      headers,
      body: form,
    });
    if (resp.status === 401) {
      const refreshed = await this.tryRefresh();
      if (refreshed) return this.importCsvStatement(input);
    }
    if (!resp.ok) {
      let detail = resp.statusText;
      try {
        const data = await resp.json();
        if (typeof data.detail === "string") detail = data.detail;
      } catch {
        // ignore
      }
      throw new ApiError(resp.status, detail);
    }
    return (await resp.json()) as {
      connection: ConnectionResponse;
      imported_transactions: number;
    };
  }

  syncConnection(connectionId: string) {
    return this.request<ConnectionResponse>(
      "POST",
      `/v1/connections/${connectionId}/sync`,
      undefined,
      { auth: true },
    );
  }

  listConnections(householdId: string) {
    return this.request<ConnectionResponse[]>(
      "GET",
      `/v1/connections/?household_id=${householdId}`,
      undefined,
      { auth: true },
    );
  }

  listAccounts(householdId: string, includeHidden = false) {
    const hidden = includeHidden ? "&include_hidden=true" : "";
    return this.request<AccountResponse[]>(
      "GET",
      `/v1/connections/accounts?household_id=${householdId}${hidden}`,
      undefined,
      { auth: true },
    );
  }

  getAccount(accountId: string) {
    return this.request<AccountDetailResponse>(
      "GET",
      `/v1/connections/accounts/${accountId}`,
      undefined,
      { auth: true },
    );
  }

  updateAccount(
    accountId: string,
    body: { nickname?: string | null; notes?: string | null; hidden?: boolean },
  ) {
    return this.request<AccountResponse>(
      "PATCH",
      `/v1/connections/accounts/${accountId}`,
      body,
      { auth: true },
    );
  }

  listTransactions(householdId: string, filters: TransactionFilters | number = 50, offset = 0, needsReview?: boolean) {
    const f: TransactionFilters =
      typeof filters === "number"
        ? { limit: filters, offset, needsReview }
        : filters;
    const params = new URLSearchParams({ household_id: householdId });
    params.set("limit", String(f.limit ?? 50));
    params.set("offset", String(f.offset ?? 0));
    if (f.needsReview !== undefined) params.set("needs_review", String(f.needsReview));
    if (f.accountId) params.set("account_id", f.accountId);
    if (f.categoryId) params.set("category_id", f.categoryId);
    if (f.q) params.set("q", f.q);
    if (f.dateFrom) params.set("date_from", f.dateFrom);
    if (f.dateTo) params.set("date_to", f.dateTo);
    if (f.minAmount) params.set("min_amount", f.minAmount);
    if (f.maxAmount) params.set("max_amount", f.maxAmount);
    return this.request<TransactionListResponse>(
      "GET",
      `/v1/connections/transactions?${params.toString()}`,
      undefined,
      { auth: true },
    );
  }

  // --- categories & corrections ---

  listCategories(householdId?: string) {
    const path = householdId
      ? `/v1/categories/?household_id=${householdId}`
      : `/v1/categories/`;
    return this.request<CategoryResponse[]>("GET", path, undefined, { auth: true });
  }

  listCategoryIcons() {
    return this.request<{ icons: string[]; colors: string[] }>("GET", "/v1/categories/icons", undefined, {
      auth: true,
    });
  }

  updateCategoryPreference(
    categoryId: string,
    householdId: string,
    iconKey: string,
    color: string,
  ) {
    return this.request<CategoryResponse>(
      "PUT",
      `/v1/categories/${categoryId}/preference?household_id=${householdId}`,
      { icon_key: iconKey, color },
      { auth: true },
    );
  }

  correctTransaction(transactionId: string, categoryId: string, merchantName?: string) {
    return this.request<TransactionCorrectionResponse>(
      "PATCH",
      `/v1/transactions/${transactionId}/category`,
      { category_id: categoryId, merchant_name: merchantName ?? null },
      { auth: true },
    );
  }

  // --- budgets & metrics ---

  createBudget(householdId: string, opts?: { propose?: boolean; name?: string }) {
    return this.request<BudgetResponse>(
      "POST",
      "/v1/budgets/",
      {
        household_id: householdId,
        name: opts?.name ?? "Monthly budget",
        propose_from_history: opts?.propose ?? false,
      },
      { auth: true },
    );
  }

  listBudgets(householdId: string) {
    return this.request<BudgetResponse[]>(
      "GET",
      `/v1/budgets/?household_id=${householdId}`,
      undefined,
      { auth: true },
    );
  }

  getBudget(budgetId: string) {
    return this.request<BudgetDetailResponse>("GET", `/v1/budgets/${budgetId}`, undefined, {
      auth: true,
    });
  }

  getNetWorth(householdId: string) {
    return this.request<NetWorthResponse>(
      "GET",
      `/v1/metrics/net-worth?household_id=${householdId}`,
      undefined,
      { auth: true },
    );
  }

  getSpendingByCategory(householdId: string, days = 30) {
    return this.request<NamedAmount[]>(
      "GET",
      `/v1/metrics/spending-by-category?household_id=${householdId}&days=${days}`,
      undefined,
      { auth: true },
    );
  }

  // --- goals & planner ---

  createGoal(
    householdId: string,
    name: string,
    targetAmount: string,
    targetDate?: string,
  ) {
    return this.request<GoalResponse>(
      "POST",
      "/v1/goals/",
      {
        household_id: householdId,
        name,
        type: "save",
        target_amount: targetAmount,
        target_date: targetDate ?? null,
      },
      { auth: true },
    );
  }

  listGoals(householdId: string) {
    return this.request<GoalResponse[]>(
      "GET",
      `/v1/goals/?household_id=${householdId}`,
      undefined,
      { auth: true },
    );
  }

  buildPlan(goalId: string) {
    return this.request<PlanResponse>("POST", `/v1/goals/${goalId}/plan`, undefined, {
      auth: true,
    });
  }

  // --- assistant ---

  createConversation(householdId: string) {
    return this.request<ConversationResponse>(
      "POST",
      "/v1/assistant/conversations",
      { household_id: householdId },
      { auth: true },
    );
  }

  sendChat(conversationId: string, message: string) {
    return this.request<MessageResponse>(
      "POST",
      `/v1/assistant/conversations/${conversationId}/messages`,
      { message },
      { auth: true },
    );
  }
}
