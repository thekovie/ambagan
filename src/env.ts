import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_PATH: z.string().min(1).default("./data/ambagan.db"),
  /** Persistent directory for admin-uploaded images (payment QR codes). */
  ASSETS_DIR: z.string().min(1).default("./data/assets"),
  /** Where backups go. Default: a `backups` folder next to the database. For real safety, point it at another disk. */
  BACKUP_DIR: z.string().min(1).optional(),
  /** How many backups to keep (the newest ones). */
  BACKUP_KEEP: z.coerce.number().int().min(1).max(365).default(14),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  APP_URL: z.url(),
  ADMIN_EMAIL: z.email(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM_NAME: z.string().default("Shared Subscription Payments"),
  SMTP_FROM_EMAIL: z.email().optional(),
  SMTP_REPLY_TO: z.email().optional(),
});

export type Env = Omit<z.infer<typeof schema>, `SMTP_${string}`> & {
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    password?: string;
    fromName: string;
    fromEmail: string;
    replyTo?: string;
  } | null;
};

/** Validates raw environment variables. SMTP is optional outside production. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment:\n${issues.join("\n")}`);
  }
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_NAME, SMTP_FROM_EMAIL, SMTP_REPLY_TO, ...rest } =
    parsed.data;

  if (rest.NODE_ENV === "production" && (!SMTP_HOST || !SMTP_FROM_EMAIL)) {
    throw new Error("Invalid environment:\nSMTP_HOST and SMTP_FROM_EMAIL are required in production");
  }
  const smtp =
    SMTP_HOST && SMTP_FROM_EMAIL
      ? {
          host: SMTP_HOST,
          port: SMTP_PORT,
          secure: SMTP_SECURE === "true",
          user: SMTP_USER,
          password: SMTP_PASSWORD,
          fromName: SMTP_FROM_NAME,
          fromEmail: SMTP_FROM_EMAIL,
          replyTo: SMTP_REPLY_TO,
        }
      : null;
  return { ...rest, smtp };
}

let cached: Env | undefined;
/** Lazily validated process environment (server only). */
export function getEnv(): Env {
  return (cached ??= parseEnv(process.env));
}
