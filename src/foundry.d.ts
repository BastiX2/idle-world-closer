/**
 * Minimal declarations of the Foundry VTT v14 client API that this module uses. Own declarations on
 * purpose: only what is called here, nothing more.
 */

interface FoundryUser {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly isGM: boolean;
}

interface FoundryUsers {
  /** The active users (`user.active`) are picked with `filter`. */
  filter(predicate: (user: FoundryUser) => boolean): FoundryUser[];
  has(id: string): boolean;
  /** The active Gamemaster every client agrees on, or null when none is connected. */
  readonly activeGM: FoundryUser | null;
}

interface SettingConfig {
  name?: string;
  hint?: string;
  scope: "world" | "client" | "user";
  config: boolean;
  requiresReload?: boolean;
  /** A constructor (Boolean, String, Object) or a DataField instance. */
  type: unknown;
  default: unknown;
  choices?: Record<string, string>;
  onChange?: (value: unknown) => void;
}

interface FoundryGame {
  ready: boolean;
  readonly user: FoundryUser;
  readonly users: FoundryUsers;
  readonly settings: {
    register(module: string, key: string, config: SettingConfig): void;
    get(module: string, key: string): unknown;
  };
  readonly socket: {
    emit(event: string, data: unknown): void;
    on(event: string, handler: (data: unknown) => void): void;
  };
  readonly i18n: {
    format(key: string, data?: Record<string, unknown>): string;
    localize(key: string): string;
  };
  /** Logs this client out and returns to the join screen. */
  logOut(): void;
}

interface DialogV2Button {
  action: string;
  label: string;
  icon?: string;
  default?: boolean;
}

interface DialogV2Options {
  window?: { title?: string; icon?: string };
  classes?: string[];
  content?: string;
  buttons: DialogV2Button[];
  submit?: (result: unknown) => unknown;
}

interface DialogV2Instance {
  readonly element?: HTMLElement;
  render(options?: { force?: boolean }): Promise<unknown>;
  close(options?: { animate?: boolean }): Promise<unknown>;
}

interface FoundryNamespace {
  applications: { api: { DialogV2: new (options: DialogV2Options) => DialogV2Instance } };
  data: {
    fields: {
      NumberField: new (options: {
        required?: boolean;
        integer?: boolean;
        min?: number;
        max?: number;
        initial?: number;
      }) => unknown;
    };
  };
  utils: {
    getRoute(path: string): string;
    fetchWithTimeout(url: string, options?: RequestInit): Promise<Response>;
  };
}

declare const game: FoundryGame;
declare const foundry: FoundryNamespace;
declare const Hooks: {
  once(hook: "init" | "ready", callback: () => void): void;
  on(hook: "renderSettingsConfig", callback: (app: unknown, element: HTMLElement) => void): number;
};
