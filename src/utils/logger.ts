/* SPDX-License-Identifier: AGPL-3.0-only */
import { pino } from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'kvendra-platform' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
