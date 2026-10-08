import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { router } from './routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// Behind the HTTPS reverse proxy (Caddy → nginx) req.ip / req.protocol must come
// from X-Forwarded-* — otherwise every client looks like the proxy.
if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);

app.use(helmet());
// CORS_ORIGIN may list several origins, comma-separated (e.g. the site and an Amplify preview)
const allowedOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim().replace(/\/+$/, '')).filter(Boolean);
app.use(cors({ origin: allowedOrigins.length > 1 ? allowedOrigins : allowedOrigins[0] }));
app.use(express.json());
app.use(morgan('dev'));

app.use('/api', router);

app.use(errorHandler);

export default app;
