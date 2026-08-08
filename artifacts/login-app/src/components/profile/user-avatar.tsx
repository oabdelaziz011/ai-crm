import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useCurrentUserAvatar } from "@/hooks/use-current-user-avatar";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  fallbackClassName?: string;
  /** Accessible name override. */
  alt?: string;
};

/** Global user avatar — always reads from `profiles.avatar_url` via React Query. */
export function UserAvatar({ className, fallbackClassName, alt }: Props) {
  const { src, name, initial } = useCurrentUserAvatar();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showImage = Boolean(src) && !failed;

  return (
    <Avatar className={cn("size-8", className)}>
      {showImage ? (
        <AvatarImage
          key={src}
          src={src}
          alt={alt ?? name}
          onLoadingStatusChange={(status) => {
            if (status === "error") setFailed(true);
            if (status === "loaded") setFailed(false);
          }}
        />
      ) : null}
      {!showImage ? (
        <AvatarFallback
          delayMs={0}
          className={cn(
            "bg-gradient-to-br from-primary/20 to-primary/5 text-xs font-bold text-primary",
            fallbackClassName,
          )}
        >
          {initial}
        </AvatarFallback>
      ) : null}
    </Avatar>
  );
}
