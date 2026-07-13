import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus } from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "@/context/auth-context";

const registerSchema = z.object({
  email:    z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
type RegisterFormValues = z.infer<typeof registerSchema>;

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isLoading, signUp } = useAuth();

  useEffect(() => {
    if (user) setLocation("/dashboard");
  }, [user, setLocation]);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    const { error } = await signUp(values.email, values.password);
    if (error) {
      form.setError("root", { message: error });
    } else {
      toast({
        title: "Identity created",
        description: "Your credentials have been securely stored. You can now log in.",
      });
      setLocation("/dashboard");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AuthLayout
      title="Initialize Identity"
      subtitle="Establish your credentials to enter the vault."
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {form.formState.errors.root && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive text-center font-medium">
              {form.formState.errors.root.message}
            </div>
          )}
          <FormField control={form.control} name="email" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-muted-foreground">Desired Identity</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  className="bg-background/50 border-white/10 focus-visible:ring-primary/50 text-white placeholder:text-muted-foreground/50 h-12"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="password" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-muted-foreground">Secure Passkey</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="••••••••"
                  className="bg-background/50 border-white/10 focus-visible:ring-primary/50 text-white placeholder:text-muted-foreground/50 h-12 font-mono tracking-widest"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <Button
            type="submit"
            className="w-full h-12 text-base font-medium group transition-all"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Initialize Access
                <UserPlus className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </form>
      </Form>

      <div className="mt-8 text-center text-sm text-muted-foreground">
        Already established?{" "}
        <Link href="/login" className="text-primary hover:text-primary/80 transition-colors font-medium">
          Authenticate here
        </Link>
      </div>
    </AuthLayout>
  );
}
