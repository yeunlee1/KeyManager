// 라이선스 등록 대화상자: 카테고리·버전을 고르고 25자리 키를 한 칸에 넣는다(붙여 넣으면 자동으로 5자씩 나눈다).
import { useEffect, useState, type FormEvent } from "react";
import { createItem } from "@/api/items";
import { describeError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toastManager } from "@/components/ui/toast";
import { formatLicenseKey, licenseKeyComplete } from "@/lib/license-key";
import type { CategoryVersions } from "@/types/item";
import { categoryLabel } from "./license-labels";

export function RegisterLicenseDialog({
  open,
  onOpenChange,
  versions,
  onRegistered,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versions: CategoryVersions;
  onRegistered: () => void;
}) {
  const categories = Object.keys(versions);
  const [category, setCategory] = useState("");
  const [version, setVersion] = useState("");
  const [key, setKey] = useState("");
  const [errors, setErrors] = useState<{ category?: string; version?: string; key?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategory("");
    setVersion("");
    setKey("");
    setErrors({});
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (!category) next.category = "카테고리를 고르세요.";
    if (!version) next.version = "버전을 고르세요.";
    if (!licenseKeyComplete(key)) next.key = `25자리를 모두 넣으세요. (지금 ${key.replace(/-/g, "").length}자리)`;
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await createItem({ key, category, version });
      toastManager.add({ title: "라이선스를 등록했어요", description: key, type: "success" });
      onOpenChange(false);
      onRegistered();
    } catch (failure) {
      setErrors({ form: describeError(failure, "등록하지 못했어요. 입력한 내용은 그대로 있어요. 다시 시도하세요.") });
    } finally {
      setBusy(false);
    }
  };

  const versionItems = (versions[category] ?? []).map((value) => ({ value, label: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        <form onSubmit={submit} className="contents" noValidate>
          <DialogHeader>
            <DialogTitle>라이선스 등록</DialogTitle>
            <DialogDescription>제품 키는 등록한 뒤 사용자를 지정할 수 있어요.</DialogDescription>
          </DialogHeader>
          <DialogPanel className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field invalid={!!errors.category}>
                <FieldLabel>카테고리</FieldLabel>
                <Select
                  items={categories.map((value) => ({ value, label: categoryLabel(value) }))}
                  value={category || null}
                  onValueChange={(value) => {
                    setCategory(String(value ?? ""));
                    setVersion("");
                  }}
                >
                  <SelectTrigger aria-invalid={!!errors.category || undefined}>
                    <SelectValue placeholder="고르기" />
                  </SelectTrigger>
                  <SelectPopup>
                    {categories.map((value) => (
                      <SelectItem key={value} value={value}>
                        {categoryLabel(value)}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                {errors.category && <FieldError match>{errors.category}</FieldError>}
              </Field>
              <Field invalid={!!errors.version}>
                <FieldLabel>버전</FieldLabel>
                <Select items={versionItems} value={version || null} onValueChange={(value) => setVersion(String(value ?? ""))} disabled={!category}>
                  <SelectTrigger aria-invalid={!!errors.version || undefined}>
                    <SelectValue placeholder={category ? "고르기" : "카테고리를 먼저 고르세요"} />
                  </SelectTrigger>
                  <SelectPopup>
                    {versionItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                {errors.version && <FieldError match>{errors.version}</FieldError>}
              </Field>
            </div>
            <Field invalid={!!errors.key}>
              <FieldLabel>제품 키</FieldLabel>
              <Input
                value={key}
                onChange={(event) => setKey(formatLicenseKey(event.target.value))}
                placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
                className="font-mono uppercase tracking-wide"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={!!errors.key || undefined}
              />
              <FieldDescription>영문·숫자 25자리예요. 하이픈은 자동으로 들어가고, 키 전체를 붙여 넣어도 돼요.</FieldDescription>
              {errors.key && <FieldError match>{errors.key}</FieldError>}
            </Field>
            {errors.form && (
              <p role="alert" className="text-destructive-foreground text-sm">
                {errors.form}
              </p>
            )}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>취소</DialogClose>
            <Button type="submit" loading={busy}>
              등록
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
