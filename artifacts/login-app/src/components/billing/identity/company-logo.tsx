import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type CompanyLogoProps = {
  name: string;
  logoUrl?: string | null;
  className?: string;
};

export function CompanyLogo({ name, logoUrl, className = "h-9 w-9" }: CompanyLogoProps) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Avatar className={className}>
      {logoUrl ? <AvatarImage src={logoUrl} alt={name} /> : null}
      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initials}</AvatarFallback>
    </Avatar>
  );
}
