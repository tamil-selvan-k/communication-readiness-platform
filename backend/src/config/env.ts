import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  AI_SERVICE_URL: z.string().url().default('http://127.0.0.1:8000'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // Number of reverse-proxy hops in front of the backend (production: 2 = Caddy + nginx)
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  JWT_SECRET: z.string().min(32).default('dev-secret-change-in-production-min-32-chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/comm_readiness'),
  UPLOAD_MAX_FILE_SIZE_MB: z.coerce.number().default(5),
  UPLOAD_DIR: z.string().default('uploads'),
  // Shared secret for internal calls to the Python AI service
  INTERNAL_API_KEY: z.string().default('change-me'),

  // Session/Assessment limits
  MAX_QUESTIONS_PER_SESSION: z.coerce.number().default(10),
  MAX_TAB_SWITCH_LIMIT: z.coerce.number().default(3),

  // Optional third-party services
  REDIS_URL: z.string().optional(),
  DEEPGRAM_API_KEY: z.string().optional(),
  APP_NAME: z.string().default('AI Interview Platform'),
  APP_URL: z.string().default('http://localhost:5173'),

  // SMTP (Nodemailer) — transactional email
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default('noreply@aiinterview.dev'),
});

export const env = schema.parse(process.env);

// The defaults above are published in the repository. Running production on them
// would let anyone mint valid JWTs or call the AI service's internal endpoints.
const DEFAULT_JWT_SECRET = 'dev-secret-change-in-production-min-32-chars';
if (env.NODE_ENV === 'production') {
  if (env.JWT_SECRET === DEFAULT_JWT_SECRET) {
    throw new Error('JWT_SECRET must be set to a private value in production');
  }
  if (env.INTERNAL_API_KEY === 'change-me') {
    throw new Error('INTERNAL_API_KEY must be set to a private value in production');
  }
}
