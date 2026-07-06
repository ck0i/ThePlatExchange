import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  ItemRef,
  NotificationRule,
  NotificationChannel,
  NotificationThreshold,
  PersonalizationState,
  ProductOpportunityAction,
  PortfolioEntry,
  PrivacySettings,
  Todo,
  TodoStatus,
  UserProfile,
  UserAssumptions,
} from "./product.js";

export interface UserStoreOptions {
  path?: string;
  now?: () => Date;
}

export interface ProfileUpdate {
  displayName?: string;
  email?: string;
  timezone?: string;
  crossplay?: boolean;
  assumptions?: Partial<UserAssumptions>;
  privacy?: Partial<PrivacySettings>;
}

type StoredState = PersonalizationState;

export interface TodoInput {
  title: string;
  methodId?: string;
  itemRefs?: ItemRef[];
  action?: ProductOpportunityAction;
  dueAt?: string;
  sourceOpportunityId?: string;
  notes?: string;
}

export interface TodoUpdate {
  status?: TodoStatus;
  notes?: string;
  dueAt?: string;
  title?: string;
}

export interface PortfolioInput {
  item: ItemRef;
  quantity: number;
  rank?: number;
  acquiredAt?: string;
  costBasisPlat?: number;
  notes?: string;
}

export interface NotificationRuleInput {
  name: string;
  methodIds: string[];
  filters: Record<string, unknown>;
  threshold: NotificationThreshold;
  channels: NotificationChannel[];
  cooldownSeconds: number;
  enabled: boolean;
  lastTriggeredAt?: string;
  dedupeKey?: string;
  changedBecause?: string;
}

const DEFAULT_ASSUMPTIONS: UserAssumptions = {
  traceOpportunityCostPlat: 0.02,
  endoPlatPerThousand: 1.2,
  creditPlatPerMillion: 1,
  preferredMissionTypes: ["Capture", "Extermination", "Void Cascade", "Disruption", "Survival"],
  unlockedContent: ["fissures", "steel_path_assumed", "arbitrations_assumed"],
  accessibleSyndicates: [],
};

const DEFAULT_PRIVACY: PrivacySettings = {
  privateByDefault: true,
  allowAnonymousAggregates: false,
  teamSharingEnabled: false,
};

export class UserStore {
  private readonly path: string;
  private readonly now: () => Date;
  private state: StoredState | null = null;

  constructor(options: UserStoreOptions = {}) {
    this.path = options.path ?? join(process.cwd(), ".cache", "the-plat-exchange", "user-state.json");
    this.now = options.now ?? (() => new Date());
  }

  async load(): Promise<PersonalizationState> {
    if (this.state) return this.snapshot();
    try {
      const raw = await readFile(this.path, "utf8");
      const parsed = JSON.parse(raw) as Partial<StoredState>;
      this.state = normalizeState(parsed, this.now().toISOString());
    } catch {
      this.state = normalizeState({}, this.now().toISOString());
      await this.persist();
    }
    return this.snapshot();
  }

  getState(): PersonalizationState {
    if (!this.state) this.state = normalizeState({}, this.now().toISOString());
    return this.snapshot();
  }
  async updateProfile(update: ProfileUpdate): Promise<PersonalizationState> {
    await this.load();
    const current = this.state!;
    current.profile = {
      ...current.profile,
      ...definedProfileUpdate(update),
      assumptions: { ...current.profile.assumptions, ...(update.assumptions ?? {}) },
      privacy: { ...current.profile.privacy, ...(update.privacy ?? {}) },
    };
    current.auditLog.unshift({ id: id("audit"), at: this.now().toISOString(), event: "profile_updated" });
    await this.persist();
    return this.snapshot();
  }

  async addTodo(input: TodoInput): Promise<PersonalizationState> {
    await this.load();
    const title = String(input.title ?? "").trim();
    if (title.length === 0) throw new Error("todo title required");
    const todo: Todo = {
      id: id("todo"),
      userId: this.state!.profile.id,
      title,
      itemRefs: input.itemRefs ?? [],
      action: input.action ?? "hold",
      status: "open",
    };
    if (input.methodId !== undefined) todo.methodId = input.methodId;
    if (input.dueAt !== undefined) todo.dueAt = input.dueAt;
    if (input.sourceOpportunityId !== undefined) todo.sourceOpportunityId = input.sourceOpportunityId;
    if (input.notes !== undefined) todo.notes = input.notes;
    this.state!.todos.unshift(todo);
    this.state!.auditLog.unshift({ id: id("audit"), at: this.now().toISOString(), event: "todo_created" });
    await this.persist();
    return this.snapshot();
  }

  async updateTodo(idValue: string, update: TodoUpdate): Promise<PersonalizationState> {
    await this.load();
    const todo = this.state!.todos.find((entry) => entry.id === idValue);
    if (!todo) throw new Error(`todo not found: ${idValue}`);
    if (update.status) todo.status = update.status;
    if (update.notes !== undefined) todo.notes = update.notes;
    if (update.dueAt !== undefined) todo.dueAt = update.dueAt;
    if (update.title !== undefined && update.title.trim().length > 0) todo.title = update.title.trim();
    this.state!.auditLog.unshift({ id: id("audit"), at: this.now().toISOString(), event: `todo_${todo.status}` });
    await this.persist();
    return this.snapshot();
  }

  async addPortfolio(input: PortfolioInput): Promise<PersonalizationState> {
    await this.load();
    if (!input.item?.name) throw new Error("portfolio item required");
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error("portfolio quantity must be positive");
    const entry: PortfolioEntry = {
      id: id("portfolio"),
      userId: this.state!.profile.id,
      item: input.item,
      quantity: Math.floor(input.quantity),
      acquiredAt: input.acquiredAt ?? this.now().toISOString(),
    };
    if (input.rank !== undefined) entry.rank = input.rank;
    if (input.costBasisPlat !== undefined) entry.costBasisPlat = input.costBasisPlat;
    if (input.notes !== undefined) entry.notes = input.notes;
    this.state!.portfolio.unshift(entry);
    this.state!.auditLog.unshift({ id: id("audit"), at: this.now().toISOString(), event: "portfolio_entry_created" });
    await this.persist();
    return this.snapshot();
  }

  async addNotificationRule(rule: NotificationRuleInput): Promise<PersonalizationState> {
    await this.load();
    const entry: NotificationRule = { ...rule, id: id("alert"), userId: this.state!.profile.id };
    if (entry.cooldownSeconds < 60) entry.cooldownSeconds = 60;
    this.state!.notificationRules.unshift(entry);
    this.state!.auditLog.unshift({ id: id("audit"), at: this.now().toISOString(), event: "notification_rule_created" });
    await this.persist();
    return this.snapshot();
  }

  async deleteAll(): Promise<PersonalizationState> {
    this.state = normalizeState({}, this.now().toISOString());
    this.state.auditLog.unshift({ id: id("audit"), at: this.now().toISOString(), event: "user_data_deleted" });
    await this.persist();
    return this.snapshot();
  }

  exportState(): PersonalizationState {
    return this.getState();
  }

  private async persist(): Promise<void> {
    if (!this.state) return;
    await mkdir(dirname(this.path), { recursive: true });
    const tempPath = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, JSON.stringify(this.state, null, 2), "utf8");
    await rename(tempPath, this.path);
  }

  private snapshot(): PersonalizationState {
    return JSON.parse(JSON.stringify(this.state)) as PersonalizationState;
  }
}

function normalizeState(input: Partial<StoredState>, nowIso: string): StoredState {
  const profile: UserProfile = {
    id: input.profile?.id ?? id("user"),
    displayName: input.profile?.displayName ?? "Local trader",
    timezone: input.profile?.timezone ?? "UTC",
    platform: "pc",
    crossplay: input.profile?.crossplay ?? true,
    assumptions: { ...DEFAULT_ASSUMPTIONS, ...(input.profile?.assumptions ?? {}) },
    privacy: { ...DEFAULT_PRIVACY, ...(input.profile?.privacy ?? {}) },
  };
  if (input.profile?.email !== undefined) profile.email = input.profile.email;
  return {
    profile,
    savedFilters: Array.isArray(input.savedFilters) ? input.savedFilters : [],
    watchlists: Array.isArray(input.watchlists) ? input.watchlists : [],
    portfolio: Array.isArray(input.portfolio) ? input.portfolio : [],
    todos: Array.isArray(input.todos) ? input.todos : [],
    notificationRules: Array.isArray(input.notificationRules) ? input.notificationRules : [],
    deliveries: Array.isArray(input.deliveries) ? input.deliveries : [],
    tradeJournal: Array.isArray(input.tradeJournal) ? input.tradeJournal : [],
    auditLog: Array.isArray(input.auditLog) && input.auditLog.length > 0 ? input.auditLog : [{ id: id("audit"), at: nowIso, event: "local_private_profile_created" }],
    exportAvailable: true,
    deleteAvailable: true,
    warnings: [
      "Local TPE account data is private by default and stored on this server only.",
      "Do not enter Warframe, Digital Extremes, or Warframe.market credentials; TPE never needs them.",
    ],
  };
}

function definedProfileUpdate(update: Partial<Pick<UserProfile, "displayName" | "email" | "timezone" | "crossplay">>): Partial<UserProfile> {
  const result: Partial<UserProfile> = {};
  if (typeof update.displayName === "string" && update.displayName.trim()) result.displayName = update.displayName.trim();
  if (typeof update.email === "string") result.email = update.email.trim();
  if (typeof update.timezone === "string" && update.timezone.trim()) result.timezone = update.timezone.trim();
  if (typeof update.crossplay === "boolean") result.crossplay = update.crossplay;
  return result;
}

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
