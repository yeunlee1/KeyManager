// 항목 만들기·고치기 대화상자(설계서 6절). 저장할 때마다 새 항목 열쇠로 요약과 비밀을 따로 잠근다.
import { Wand2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { describeError, errorStatus } from "@/api/errors";
import { PasswordInput } from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toastManager } from "@/components/ui/toast";
import { generatePassword } from "@/lib/generate-password";
import {
  contentToDraft,
  DB_TYPES,
  emptyDraft,
  ITEM_KINDS,
  KIND_FIELDS,
  REMOTE_PROTOCOLS,
  validateDraft,
  type DraftErrors,
  type ItemDraft,
  type ItemKind,
} from "@/lib/item-types";
import { useVault, type OpenedItem } from "./vault-context";

const PERSONAL = "personal";

type TextFieldName = "name" | "vendor" | "host" | "port" | "dbName" | "url" | "username";

function fieldLabel(kind: ItemKind, field: TextFieldName): string {
  switch (field) {
    case "name":
      return "이름(필수)";
    case "vendor":
      return "업체";
    case "host":
      return kind === "remote" ? "주소(IP·호스트·원격 ID)" : "주소(IP·호스트)";
    case "port":
      return "포트";
    case "dbName":
      return "DB 이름";
    case "url":
      return "주소(URL)";
    case "username":
      return "아이디";
  }
}

export function ItemFormDialog({
  open,
  onOpenChange,
  existing,
  defaultGroupId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: OpenedItem | null;
  defaultGroupId?: string | null;
}) {
  const vault = useVault();
  const [draft, setDraft] = useState<ItemDraft>(emptyDraft("remote"));
  const [location, setLocation] = useState<string>(PERSONAL);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clearRotation, setClearRotation] = useState(false);

  const writableGroups = vault.groups.filter((group) => group.state === "open" && (group.permission === "edit" || vault.me.role === "admin"));

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setFormError(null);
    setClearRotation(false);
    if (!existing) {
      setDraft(emptyDraft("remote"));
      setLocation(defaultGroupId && writableGroups.some((group) => group.id === defaultGroupId) ? defaultGroupId : PERSONAL);
      return;
    }
    if (!existing.summary) return;
    const summary = existing.summary;
    let cancelled = false;
    setLoading(true);
    vault
      .fetchSecret(existing, "edit")
      .then((secret) => {
        if (!cancelled) setDraft(contentToDraft(summary, secret));
      })
      .catch((failure) => {
        if (!cancelled) setFormError(describeError(failure, "비밀을 불러오지 못했어요. 닫은 뒤 다시 여세요."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // 대화상자를 열 때 한 번만 불러온다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing]);

  const set = <K extends keyof ItemDraft>(field: K, value: ItemDraft[K]) => setDraft((current) => ({ ...current, [field]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setFormError(null);
    try {
      await vault.saveItem(draft, { groupId: location === PERSONAL ? null : location }, existing ?? undefined, clearRotation);
      toastManager.add({ title: existing ? "항목을 고쳤어요" : "항목을 만들었어요", description: draft.name.trim(), type: "success" });
      onOpenChange(false);
    } catch (failure) {
      if (errorStatus(failure) === 409) {
        setFormError("다른 사람이 먼저 고쳤거나 묶음 열쇠가 바뀌었어요. 닫은 뒤 새 내용을 불러와 다시 하세요.");
        void vault.reload();
      } else {
        setFormError(describeError(failure, "저장하지 못했어요. 입력한 내용은 그대로 있어요. 다시 시도하세요."));
      }
    } finally {
      setBusy(false);
    }
  };

  const fields = KIND_FIELDS[draft.kind];
  const textField = (field: TextFieldName, options: { mono?: boolean; inputMode?: "numeric" | "url" } = {}) => (
    <Field invalid={!!errors[field]}>
      <FieldLabel>{fieldLabel(draft.kind, field)}</FieldLabel>
      <Input
        value={draft[field]}
        onChange={(event) => set(field, event.target.value)}
        className={options.mono ? "font-mono" : undefined}
        inputMode={options.inputMode}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={!!errors[field] || undefined}
      />
      {errors[field] && <FieldError match>{errors[field]}</FieldError>}
    </Field>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-xl">
        <form onSubmit={submit} className="contents" noValidate>
          <DialogHeader>
            <DialogTitle>{existing ? "항목 고치기" : "항목 추가"}</DialogTitle>
            <DialogDescription>이름·주소·아이디는 목록 검색에, 비밀번호·메모는 볼 때만 따로 받아요. 모두 이 브라우저에서 암호화해요.</DialogDescription>
          </DialogHeader>
          <DialogPanel className="grid gap-4">
            {loading ? (
              <div className="grid gap-3" aria-busy="true" aria-label="항목을 불러오는 중">
                <Skeleton className="h-9" />
                <Skeleton className="h-9" />
                <Skeleton className="h-9" />
              </div>
            ) : (
              <>
                {!existing && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel>종류</FieldLabel>
                      <Select items={ITEM_KINDS} value={draft.kind} onValueChange={(value) => setDraft({ ...emptyDraft(value as ItemKind), name: draft.name, vendor: draft.vendor })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectPopup>
                          {ITEM_KINDS.map((kind) => (
                            <SelectItem key={kind.value} value={kind.value}>
                              {kind.label}
                            </SelectItem>
                          ))}
                        </SelectPopup>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel>저장 위치</FieldLabel>
                      <Select
                        items={[{ value: PERSONAL, label: "개인 금고" }, ...writableGroups.map((group) => ({ value: group.id, label: group.name ?? "이름 없는 묶음" }))]}
                        value={location}
                        onValueChange={(value) => setLocation(String(value))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectPopup>
                          <SelectItem value={PERSONAL}>개인 금고</SelectItem>
                          {writableGroups.map((group) => (
                            <SelectItem key={group.id} value={group.id}>
                              {group.name ?? "이름 없는 묶음"}
                            </SelectItem>
                          ))}
                        </SelectPopup>
                      </Select>
                      <FieldDescription>개인 금고는 나만, 묶음은 그 묶음 사람들이 함께 봐요.</FieldDescription>
                    </Field>
                  </div>
                )}
                {textField("name")}
                {fields.includes("vendor") && textField("vendor")}
                {fields.includes("protocol") && (
                  <Field>
                    <FieldLabel>접속 방식</FieldLabel>
                    <Select items={REMOTE_PROTOCOLS.map((value) => ({ value, label: value }))} value={draft.protocol} onValueChange={(value) => set("protocol", String(value))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectPopup>
                        {REMOTE_PROTOCOLS.map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  </Field>
                )}
                {fields.includes("dbType") && (
                  <Field>
                    <FieldLabel>DB 종류</FieldLabel>
                    <Select items={DB_TYPES.map((value) => ({ value, label: value }))} value={draft.dbType} onValueChange={(value) => set("dbType", String(value))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectPopup>
                        {DB_TYPES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  </Field>
                )}
                {(fields.includes("host") || fields.includes("port")) && (
                  <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
                    {fields.includes("host") && textField("host", { mono: true })}
                    {fields.includes("port") && textField("port", { mono: true, inputMode: "numeric" })}
                  </div>
                )}
                {fields.includes("dbName") && textField("dbName", { mono: true })}
                {fields.includes("url") && textField("url", { mono: true, inputMode: "url" })}
                {fields.includes("username") && textField("username", { mono: true })}
                {fields.includes("password") && (
                  <Field invalid={!!errors.password}>
                    <FieldLabel>비밀번호</FieldLabel>
                    <div className="flex gap-2">
                      <div className="min-w-0 flex-1">
                        <PasswordInput value={draft.password} onChange={(event) => set("password", event.target.value)} autoComplete="new-password" className="font-mono" aria-invalid={!!errors.password || undefined} />
                      </div>
                      <Button type="button" variant="outline" onClick={() => set("password", generatePassword())}>
                        <Wand2 aria-hidden />
                        만들기
                      </Button>
                    </div>
                    <FieldDescription>만들기를 누르면 영문 대소문자·숫자·기호 20자를 만들어요.</FieldDescription>
                    {errors.password && <FieldError match>{errors.password}</FieldError>}
                  </Field>
                )}
                <Field invalid={!!errors.memo}>
                  <FieldLabel>{draft.kind === "note" ? "내용" : "메모"}</FieldLabel>
                  <Textarea value={draft.memo} onChange={(event) => set("memo", event.target.value)} aria-invalid={!!errors.memo || undefined} />
                  <FieldDescription>비밀번호처럼 볼 때만 받아요. 10,000자까지 넣을 수 있어요.</FieldDescription>
                  {errors.memo && <FieldError match>{errors.memo}</FieldError>}
                </Field>
                {existing?.row.needsRotation && (
                  <Label className="flex items-start gap-2 text-sm">
                    <Checkbox checked={clearRotation} onCheckedChange={(value) => setClearRotation(value === true)} />
                    실제 비밀번호를 새로 바꿨어요(교체 권장 표시를 지워요).
                  </Label>
                )}
              </>
            )}
            {formError && (
              <p role="alert" className="text-destructive-foreground text-sm">
                {formError}
              </p>
            )}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>취소</DialogClose>
            <Button type="submit" loading={busy} disabled={loading}>
              {existing ? "저장" : "추가"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
