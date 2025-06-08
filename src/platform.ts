import { RestClient } from '@ecoflow-api/rest-client';
import { Matterbridge, MatterbridgeEndpoint, MatterbridgeDynamicPlatform, PlatformConfig } from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import mqtt from 'mqtt';
import { mqttResponseBaseSchema, mqttResponseCmdId1Params } from './schemas.js';

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

        const devices = await this.ecoflowRestClient.getDevicesPlain();
        console.log(devices);

        const deviceProperties = await this.ecoflowRestClient.getDevicePropertiesPlain(devices.data[0].sn);
        console.log(deviceProperties);

        const mqttCreds = await this.ecoflowRestClient.getMqttCredentials();
        console.log(mqttCreds);

        const mqttClient = await mqtt.connectAsync(`${mqttCreds.protocol}://${mqttCreds.url}:${mqttCreds.port}`, {
            username: `${mqttCreds.certificateAccount}`,
            password: `${mqttCreds.certificatePassword}`,
            protocolVersion: 5
        });

        await mqttClient.subscribeAsync(`/open/${mqttCreds.certificateAccount}/${devices.data[0].sn}/quota`);
        await mqttClient.subscribeAsync(`/open/${mqttCreds.certificateAccount}/${devices.data[0].sn}/status`);

        mqttClient.on('message', (topic, message) => {
            console.log('Topic:', topic);
            const messageWrapper = mqttResponseBaseSchema.parse(JSON.parse(message.toString()));

            switch (messageWrapper.cmdId) {
                case 1: {
                    const params = mqttResponseCmdId1Params.parse(messageWrapper.param);
                    console.log('cmdId 1:', messageWrapper, params);
                    break;
                }
                case 28:
                    break;
                default:
                    console.log('cmd other', messageWrapper);
            }
        });
    }

    override async onShutdown(reason?: string) {
        await super.onShutdown(reason);
        this.log.info('[onShutdown]', reason);

        if (this.config.unregisterOnShutdown === true) {
            await this.unregisterAllDevices(500);
        }
    }
}
