// 금고 항목 종류와 칸(설계서 6절). 요약(목록·검색)과 비밀(비밀번호·메모)을 나눠 따로 암호화한다.
export type ItemKind = "remote" | "database" | "website" | "note";

export const ITEM_KINDS: { value: ItemKind; label: string }[] = [
  { value: "remote", label: "원격 접속" },
  { value: "database", label: "DB 접속" },
  { value: "website", label: "웹사이트 계정" },
  { value: "note", label: "메모" },
];

export const KIND_LABEL: Record<ItemKind, string> = Object.fromEntries(ITEM_KINDS.map((kind) => [kind.value, kind.label])) as Record<
  ItemKind,
  string
>;

export const REMOTE_PROTOCOLS = ["RDP", "AnyDesk", "TeamViewer", "SSH", "VNC", "기타"];
export const DB_TYPES = ["SQL Server", "PostgreSQL", "MySQL/MariaDB", "Oracle", "기타"];

export const TEXT_MAX = 500;
export const MEMO_MAX = 10_000;

export interface ItemSummary {
  kind: ItemKind;
  name: string;
  vendor?: string;
  protocol?: string;
  dbType?: string;
  host?: string;
  port?: number;
  dbName?: string;
  url?: string;
  username?: string;
}

// 메모 종류는 memo에 내용을 담는다.
export interface ItemSecret {
  password?: string;
  memo?: string;
}

export interface ItemDraft {
  kind: ItemKind;
  name: string;
  vendor: string;
  protocol: string;
  dbType: string;
  host: string;
  port: string;
  dbName: string;
  url: string;
  username: string;
  password: string;
  memo: string;
}

type DraftField = Exclude<keyof ItemDraft, "kind">;

// 종류마다 보이는 칸(이름은 모든 종류에 있다)
export const KIND_FIELDS: Record<ItemKind, DraftField[]> = {
  remote: ["vendor", "protocol", "host", "port", "username", "password", "memo"],
  database: ["vendor", "dbType", "host", "port", "dbName", "username", "password", "memo"],
  website: ["vendor", "url", "username", "password", "memo"],
  note: ["vendor", "memo"],
};

export function emptyDraft(kind: ItemKind): ItemDraft {
  return {
    kind,
    name: "",
    vendor: "",
    protocol: kind === "remote" ? "RDP" : "",
    dbType: kind === "database" ? "SQL Server" : "",
    host: "",
    port: "",
    dbName: "",
    url: "",
    username: "",
    password: "",
    memo: "",
  };
}

export type DraftErrors = Partial<Record<DraftField, string>>;

export function validateDraft(draft: ItemDraft): DraftErrors {
  const errors: DraftErrors = {};
  const fields: DraftField[] = ["name", ...KIND_FIELDS[draft.kind]];
  for (const field of fields) {
    const value = draft[field];
    if (field === "memo") {
      if (value.length > MEMO_MAX) errors.memo = "10,000자까지 넣을 수 있어요.";
    } else if (value.length > TEXT_MAX) {
      errors[field] = "500자까지 넣을 수 있어요.";
    }
  }
  if (!errors.name && !draft.name.trim()) errors.name = "이름을 넣으세요.";
  if (!errors.port && draft.port.trim() && KIND_FIELDS[draft.kind].includes("port")) {
    const port = Number(draft.port.trim());
    if (!/^\d+$/.test(draft.port.trim()) || port < 1 || port > 65_535) errors.port = "포트는 1~65535 사이 숫자로 넣으세요.";
  }
  return errors;
}

export function draftToContent(draft: ItemDraft): { summary: ItemSummary; secret: ItemSecret } {
  const fields = KIND_FIELDS[draft.kind];
  const summary: ItemSummary = { kind: draft.kind, name: draft.name.trim() };
  const take = (field: "vendor" | "protocol" | "dbType" | "host" | "dbName" | "url" | "username") => {
    const value = draft[field].trim();
    if (fields.includes(field) && value) summary[field] = value;
  };
  take("vendor");
  take("protocol");
  take("dbType");
  take("host");
  if (fields.includes("port") && draft.port.trim()) summary.port = Number(draft.port.trim());
  take("dbName");
  take("url");
  take("username");
  const secret: ItemSecret = {};
  if (fields.includes("password") && draft.password) secret.password = draft.password;
  if (draft.memo) secret.memo = draft.memo;
  return { summary, secret };
}

export function contentToDraft(summary: ItemSummary, secret: ItemSecret): ItemDraft {
  return {
    ...emptyDraft(summary.kind),
    name: summary.name ?? "",
    vendor: summary.vendor ?? "",
    protocol: summary.protocol ?? (summary.kind === "remote" ? "RDP" : ""),
    dbType: summary.dbType ?? (summary.kind === "database" ? "SQL Server" : ""),
    host: summary.host ?? "",
    port: summary.port ? String(summary.port) : "",
    dbName: summary.dbName ?? "",
    url: summary.url ?? "",
    username: summary.username ?? "",
    password: secret.password ?? "",
    memo: secret.memo ?? "",
  };
}

export function searchText(summary: ItemSummary): string {
  return [summary.name, summary.vendor, summary.host, summary.url, summary.username, summary.dbName]
    .filter((value): value is string => !!value)
    .join(" ")
    .toLowerCase();
}

// 웹사이트 주소는 http·https일 때만 열기 링크로 만든다.
export function safeLink(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}
