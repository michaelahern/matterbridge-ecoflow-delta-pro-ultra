import { RestClient } from '@ecoflow-api/rest-client';
import { Matterbridge, MatterbridgeEndpoint, MatterbridgeDynamicPlatform, PlatformConfig, batteryStorage, bridgedNode, electricalSensor, powerSource } from 'matterbridge';
import { PowerSource } from 'matterbridge/matter/clusters';
import { AnsiLogger } from 'matterbridge/logger';
import { PowerSourceTag } from 'matterbridge/matter';
import mqtt from 'mqtt';

import { mqttResponseBaseSchema, mqttResponseCmdId1Params, mqttResponseCmdId2Params, mqttResponseCmdId3Params, restAllQuotaData } from './schemas.js';

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

        const devices = await this.ecoflowRestClient.getDevicesPlain();

        for (const device of devices.data) {
            if (device.productName !== 'DELTA Pro Ultra') {
                continue;
            }

            const devicePropsResponse = await this.ecoflowRestClient.getDevicePropertiesPlain(devices.data[0].sn);
            const deviceProps = restAllQuotaData.parse(devicePropsResponse.data);

            this.log.info('Properties:', deviceProps);

            const batteryLevel = deviceProps['hs_yj751_pd_appshow_addr.soc'];
            const voltsIn = deviceProps['hs_yj751_pd_backend_addr.inAcC20Vol'];
            const ampsIn = deviceProps['hs_yj751_pd_backend_addr.inAcC20Amp'];
            const wattsIn = deviceProps['hs_yj751_pd_appshow_addr.wattsInSum'];
            const acInFreq = deviceProps['hs_yj751_pd_backend_addr.acInFreq'];

            const endpoint = new MatterbridgeEndpoint([batteryStorage, bridgedNode], { uniqueStorageKey: 'EcoFlow-' + device.sn }, this.config.debug as boolean)
                .createDefaultBridgedDeviceBasicInformationClusterServer(
                    device.deviceName ?? 'DELTA Pro Ultra',
                    device.sn,
                    0xfff1,
                    'EcoFlow',
                    device.productName,
                    parseInt(this.version.replace(/\D/g, '')),
                    this.version,
                    parseInt(this.matterbridge.matterbridgeVersion.replace(/\D/g, '')),
                    this.matterbridge.matterbridgeVersion)
                .addRequiredClusterServers();

            endpoint.addChildDeviceType('Battery', powerSource, { tagList: [PowerSourceTag.Battery] })
                .createDefaultPowerSourceRechargeableBatteryClusterServer(batteryLevel, PowerSource.BatChargeLevel.Ok, 102.4 * 1000)
                .addRequiredClusterServers();

            endpoint.addChildDeviceType('Grid', powerSource, { tagList: [PowerSourceTag.Grid] })
                .createDefaultPowerSourceWiredClusterServer(PowerSource.WiredCurrentType.Ac)
                .addRequiredClusterServers();

            endpoint.addChildDeviceType('FromGrid', electricalSensor)
                .createDefaultElectricalEnergyMeasurementClusterServer()
                .createDefaultElectricalPowerMeasurementClusterServer(voltsIn ? voltsIn * 1000 : null, ampsIn ? ampsIn * 1000 : null, wattsIn ? wattsIn * 1000 : null, acInFreq ? acInFreq * 1000 : null)
                .createDefaultPowerTopologyClusterServer()
                .addRequiredClusterServers();

            // endpoint.addChildDeviceType('ToOutlets', electricalSensor)
            //     .createDefaultElectricalEnergyMeasurementClusterServer()
            //     .createDefaultElectricalPowerMeasurementClusterServer(null, null, wattsOut * 1000, acOutFreq * 1000)
            //     .createDefaultPowerTopologyClusterServer()
            //     .addRequiredClusterServers();

            this.setSelectDevice(device.sn, device.deviceName ?? 'DELTA Pro Ultra', undefined, 'hub');
            await this.registerDevice(endpoint);
            this.bridgedDevices.set(device.sn, endpoint);
        }
    }

    override async onConfigure() {
        await super.onConfigure();
        this.log.info('[onConfigure]');

        const mqttCreds = await this.ecoflowRestClient.getMqttCredentials();
        const mqttClient = await mqtt.connectAsync(`${mqttCreds.protocol}://${mqttCreds.url}:${mqttCreds.port}`, {
            username: `${mqttCreds.certificateAccount}`,
            password: `${mqttCreds.certificatePassword}`,
            protocolVersion: 5
        });

        for (const deviceSerialNumber of this.bridgedDevices.keys()) {
            await mqttClient.subscribeAsync(`/open/${mqttCreds.certificateAccount}/${deviceSerialNumber}/quota`);
            await mqttClient.subscribeAsync(`/open/${mqttCreds.certificateAccount}/${deviceSerialNumber}/status`);
        }

        mqttClient.on('message', (topic, message) => {
            const messageWrapper = mqttResponseBaseSchema.parse(JSON.parse(message.toString()));
            switch (messageWrapper.cmdId) {
                case 1: {
                    const params = mqttResponseCmdId1Params.parse(messageWrapper.param);
                    this.log.info('MQTT Message', topic, messageWrapper.cmdId, messageWrapper.cmdFunc, params);
                    break;
                }
                case 2: {
                    const params = mqttResponseCmdId2Params.parse(messageWrapper.param);
                    this.log.info('MQTT Message', topic, messageWrapper.cmdId, messageWrapper.cmdFunc, params);
                    break;
                }
                case 3: {
                    const params = mqttResponseCmdId3Params.parse(messageWrapper.param);
                    this.log.info('MQTT Message', topic, messageWrapper.cmdId, messageWrapper.cmdFunc, params);
                    break;
                }
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
