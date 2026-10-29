// 가린 채로 입력하고, 보기 버튼으로 잠깐(30초) 보이는 비밀번호 입력칸
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

const REVEAL_MS = 30_000;

export function PasswordInput(props: Omit<ComponentProps<typeof InputGroupInput>, "type">) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(false), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [shown]);
  return (
    <InputGroup>
      <InputGroupInput {...props} type={shown ? "text" : "password"} spellCheck={false} autoCapitalize="off" autoCorrect="off" />
      <InputGroupAddon align="inline-end">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={shown ? "비밀번호 가리기" : "비밀번호 보기"}
          aria-pressed={shown}
          onClick={() => setShown((value) => !value)}
        >
          {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </Button>
      </InputGroupAddon>
    </InputGroup>
  );
}
