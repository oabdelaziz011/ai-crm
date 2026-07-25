declare module "nodemailer" {
  export function createTransport(options: Record<string, unknown>): {
    sendMail(options: Record<string, unknown>): Promise<{
      messageId?: string;
      accepted?: unknown[];
      rejected?: unknown[];
    }>;
    verify(): Promise<void>;
  };
}
