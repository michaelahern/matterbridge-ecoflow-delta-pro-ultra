import { RestClient } from '@ecoflow-api/rest-client';
import { Matterbridge, MatterbridgeEndpoint, MatterbridgeDynamicPlatform, PlatformConfig } from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';

export class EcoflowDeltaProUltraPlatform extends MatterbridgeDynamicPlatform {
    ecoflowRestClient: RestClient;
    bridgedDevices = new Map<string, MatterbridgeEndpoint>();
    refreshSensorsInterval: NodeJS.Timeout | undefined;

    constructor(matterbridge: Matterbridge, log: AnsiLogger, config: PlatformConfig) {
        super(matterbridge, log, config);
        this.log.info('[init]');

        const accessKey = config.accessKey as string ?? process.env.ECOFLOW_ACCESS_KEY;
        const secretKey = config.secretKey as string ?? process.env.ECOFLOW_SECRET_KEY;

        if (!accessKey || !secretKey) {
            this.log.error('Must set the ECOFLOW_ACCESS_KEY and ECOFLOW_SECRET_KEY environment variables, exiting...');
            process.exit(1);
        }

        config.accessKey = accessKey;
        config.secretKey = secretKey;

        this.ecoflowRestClient = new RestClient({
            accessKey: accessKey,
            secretKey: secretKey,
            host: 'https://api-a.ecoflow.com'
        });
    }

    override async onStart(reason?: string) {
        this.log.info('[onStart]', reason);

        await this.ready;
        await this.clearSelect();
    }

    override async onConfigure() {
        await super.onConfigure();
        this.log.info('[onConfigure]');
    }

    override async onShutdown(reason?: string) {
        await super.onShutdown(reason);
        this.log.info('[onShutdown]', reason);

        if (this.config.unregisterOnShutdown === true) {
            await this.unregisterAllDevices(500);
        }
    }
}
