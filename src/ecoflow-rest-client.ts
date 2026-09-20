import { createHmac, randomUUID } from 'node:crypto';

interface EcoflowRestClientOptions {
    accessKey: string;
    secretKey: string;
    host: string;
}

interface DeviceListEntry {
    sn: string;
    productName?: string;
    deviceName?: string;
}

interface ApiResponse<TData> {
    code?: string;
    message?: string;
    data: TData;
}

interface MqttCredentialsResponse {
    certificateAccount: string;
    certificatePassword: string;
    url: string;
    protocol: 'mqtts' | string;
    port: number;
}

export class EcoflowRestClient {
    private readonly accessKey: string;
    private readonly secretKey: string;
    private readonly restApiHost: string;
    private readonly deviceListUrl: string;
    private readonly deviceQuotaUrl: string;
    private readonly setCommandUrl: string;
    private readonly certificationUrl: string;

    constructor(options: EcoflowRestClientOptions) {
        this.accessKey = options.accessKey;
        this.secretKey = options.secretKey;
        this.restApiHost = options.host;

        this.deviceListUrl = this.makeUrl('/iot-open/sign/device/list');
        this.deviceQuotaUrl = this.makeUrl('/iot-open/sign/device/quota/all');
        this.setCommandUrl = this.makeUrl('/iot-open/sign/device/quota');
        this.certificationUrl = this.makeUrl('/iot-open/sign/certification');
    }

    async getMqttCredentials(): Promise<MqttCredentialsResponse> {
        const response = await this.request<{ port: string | number; certificateAccount: string; certificatePassword: string; url: string; protocol: 'mqtts' | string }>('GET', this.certificationUrl);

        return {
            ...response.data,
            port: Number.parseInt(String(response.data.port), 10)
        };
    }

    async getDevicesPlain(): Promise<ApiResponse<DeviceListEntry[]>> {
        return this.request<DeviceListEntry[]>('GET', this.deviceListUrl);
    }

    async setCommandPlain(payload: Record<string, unknown>): Promise<ApiResponse<unknown>> {
        return this.request<unknown>('PUT', this.setCommandUrl, payload);
    }

    async getDevicePropertiesPlain(sn: string): Promise<ApiResponse<Record<string, unknown>>> {
        return this.request<Record<string, unknown>>('GET', `${this.deviceQuotaUrl}?sn=${encodeURIComponent(sn)}`);
    }

    private async request<TData>(method: 'GET' | 'PUT', url: string, payload?: Record<string, unknown>): Promise<ApiResponse<TData>> {
        const signature = this.createSignature(payload);
        const requestInit: RequestInit = {
            method,
            headers: [
                ['accessKey', signature.accessKey],
                ['timestamp', signature.timestamp],
                ['nonce', signature.nonce],
                ['sign', signature.signature],
                ['Content-Type', 'application/json;charset=UTF-8']
            ]
        };

        if (payload !== undefined) {
            requestInit.body = JSON.stringify(payload);
        }

        const response = await fetch(url, requestInit);
        const responseBody = await response.json() as ApiResponse<TData>;

        if (response.status !== 200) {
            throw new Error(`Request failed with status ${response.status}, ${JSON.stringify(responseBody, null, 2)}`);
        }

        if (responseBody.code !== undefined && responseBody.code !== '0') {
            throw new Error(`code: ${responseBody.code} | message: ${responseBody.message ?? 'Unknown error'}`);
        }

        return responseBody;
    }

    private makeUrl(path: string): string {
        return `${this.restApiHost}${path}`;
    }

    private createSignature(payload?: Record<string, unknown>): { nonce: string; timestamp: string; signature: string; accessKey: string } {
        const timestamp = Date.now().toString();
        const nonce = randomUUID();
        const dataString = payload ? this.buildDataString(payload) : '';
        const signatureText = dataString ? `${dataString}&accessKey=${this.accessKey}&nonce=${nonce}&timestamp=${timestamp}` : `accessKey=${this.accessKey}&nonce=${nonce}&timestamp=${timestamp}`;
        const signature = createHmac('sha256', this.secretKey).update(signatureText).digest('hex');

        return {
            nonce,
            timestamp,
            signature,
            accessKey: this.accessKey
        };
    }

    private buildDataString(data: Record<string, unknown>): string {
        const flatData = this.flatten(data);
        const keys = Object.keys(flatData).sort((a, b) => a.localeCompare(b));
        return keys.map(key => `${key}=${flatData[key]}`).join('&');
    }

    private flatten(value: unknown, path = ''): Record<string, unknown> {
        const result: Record<string, unknown> = {};

        if (Array.isArray(value)) {
            for (let index = 0; index < value.length; index += 1) {
                const item = value[index];
                if (item !== null && typeof item === 'object') {
                    Object.assign(result, this.flatten(item, `${path}[${index}]`));
                }
                else {
                    result[`${path}[${index}]`] = item;
                }
            }
            return result;
        }

        if (value !== null && typeof value === 'object') {
            const recordValue = value as Record<string, unknown>;
            for (const key of Object.keys(recordValue)) {
                const item = recordValue[key];
                const nextPath = path ? `${path}.${key}` : key;
                if (item !== null && typeof item === 'object') {
                    Object.assign(result, this.flatten(item, nextPath));
                }
                else {
                    result[nextPath] = item;
                }
            }
        }

        return result;
    }
}
