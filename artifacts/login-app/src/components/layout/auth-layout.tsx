import { ReactNode } from "react";
import { motion } from "framer-motion";
import { ValueOrLogo } from "@/components/brand/valueor-logo";
import { cn } from "@/lib/utils";

export function AuthLayout({
  children,
  title,
  subtitle,
  wide = false,
}: {
  children: ReactNode;
  /** Optional page heading under the logo (e.g. register). Omit on login. */
  title?: string;
  subtitle: string;
  /** Wider card for multi-step registration / onboarding. */
  wide?: boolean;
}) {
  const showTitle = Boolean(title?.trim());

  return (
    <div className="auth-canvas relative flex min-h-screen w-full items-center justify-center overflow-hidden text-foreground">
      <div className="auth-canvas__grid" aria-hidden />
      <div className="auth-canvas__orb auth-canvas__orb--primary" aria-hidden />
      <div className="auth-canvas__orb auth-canvas__orb--secondary" aria-hidden />

      <div
        className={cn(
          "relative z-10 w-full p-6 sm:p-8",
          wide ? "max-w-[920px]" : "max-w-md",
        )}
      >
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mb-6 flex flex-col items-center sm:mb-8"
        >
          {/* Light brand plate keeps the official logo readable in light + dark themes */}
          <div dir="ltr" className="mb-4 flex w-full justify-center sm:mb-5">
            <div
              className={cn(
                "flex w-[min(100%,300px)] items-center justify-center rounded-2xl border border-black/5",
                "bg-[#F4F6F8]/95 px-5 py-4 shadow-sm backdrop-blur-sm sm:w-[360px] sm:px-7 sm:py-5 md:w-[400px]",
                "dark:border-white/10 dark:bg-[#F4F6F8] dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)]",
              )}
            >
              <ValueOrLogo className="w-full max-w-[340px] sm:max-w-[380px]" />
            </div>
          </div>
          {showTitle ? (
            <h1 className="mb-2 text-center text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
              {title}
            </h1>
          ) : null}
          <p className="text-center text-muted-foreground">{subtitle}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
          className={cn(
            "rounded-2xl border border-white/60 bg-white/85 p-6 text-foreground shadow-2xl shadow-teal-900/5 backdrop-blur-xl sm:p-8",
            "dark:border-white/10 dark:bg-card/80 dark:shadow-black/40",
          )}
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
