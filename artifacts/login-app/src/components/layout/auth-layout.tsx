import { ReactNode } from "react";
import { Shield } from "lucide-react";
import { motion } from "framer-motion";

export function AuthLayout({ children, title, subtitle }: { children: ReactNode, title: string, subtitle: string }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden text-foreground">
      <div className="ambient-glow" />
      
      <div className="w-full max-w-md p-8 relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex flex-col items-center mb-8"
        >
          <div className="w-16 h-16 bg-card border border-border rounded-2xl flex items-center justify-center shadow-lg mb-6 relative group">
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-2xl group-hover:bg-primary/30 transition-colors duration-500" />
            <Shield className="w-8 h-8 text-primary relative z-10" />
          </div>
          <h1 className="text-3xl font-medium tracking-tight text-foreground mb-2">{title}</h1>
          <p className="text-muted-foreground text-center">{subtitle}</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
          className="bg-card/50 backdrop-blur-xl border border-border shadow-2xl rounded-2xl p-8"
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
