import { Inject, Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { Logger } from '@vendure/core';
import { RedisConnection } from 'bullmq';
import { timer } from 'rxjs';

import { BULLMQ_PLUGIN_OPTIONS, loggerCtx } from './constants';
import { BullMQPluginOptions } from './types';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
    private timeoutTimer: any;
    constructor(@Inject(BULLMQ_PLUGIN_OPTIONS) private options: BullMQPluginOptions) {
        super();
    }
    async isHealthy(key: string, timeoutMs = 5000): Promise<HealthIndicatorResult> {
        let connection: RedisConnection;
        connection = new RedisConnection({
            ...this.options.connection,
            connectTimeout: 10000,
        });
        const pingResult = await new Promise(async (resolve, reject) => {
            try {
                connection.on('error', err => {
                    Logger.error(`Redis health check error: ${err.message}`, loggerCtx, err.stack);
                    resolve(err);
                });
                if (this.timeoutTimer) {
                    clearTimeout(this.timeoutTimer);
                }
                const timeout = new Promise<void>(
                    _resolve => (this.timeoutTimer = setTimeout(_resolve, timeoutMs)),
                );
                const client = await Promise.race([connection.client, timeout]);
                clearTimeout(this.timeoutTimer);
                if (!client) {
                    resolve('timeout');
                    return;
                }
                client.ping((err, res) => {
                    if (err) {
                        resolve(err);
                    } else {
                        resolve(res);
                    }
                });
            } catch (e) {
                resolve(e);
            }
        });

        try {
            await connection.close();
            // await connection.disconnect();
        } catch (e) {
            Logger.error(`Redis health check error closing connection: ${e.message}`, loggerCtx, e.stack);
        }

        const result = this.getStatus(key, pingResult === 'PONG');

        if (pingResult) {
            return result;
        }
        throw new HealthCheckError('Redis failed', result);
    }
}
