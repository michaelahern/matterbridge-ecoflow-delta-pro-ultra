import { RestClient } from '@ecoflow-api/rest-client';
import { Matterbridge, MatterbridgeEndpoint, MatterbridgeDynamicPlatform, type PlatformConfig, batteryStorage, bridgedNode, deviceEnergyManagement, electricalSensor, powerSource } from 'matterbridge';
import { DeviceEnergyManagement, ElectricalPowerMeasurement, PowerSource } from 'matterbridge/matter/clusters';
import { AnsiLogger } from 'matterbridge/logger';
import { PowerSourceTag } from 'matterbridge/matter';
import mqtt from 'mqtt';

import { mqttResponseBaseSchema, mqttResponseCmdId1Params, mqttResponseCmdId2Params, mqttResponseCmdId3Params, restAllQuotaData } from './schemas.js';

export class EcoflowDeltaProUltraPlatform extends MatterbridgeDynamicPlatform {
    ecoflowRestClient?: RestClient;
    bridgedDevices = new Map<string, MatterbridgeEndpoint>();
    refreshSensorsInterval: NodeJS.Timeout | undefined;

    constructor(matterbridge: Matterbridge, log: AnsiLogger, config: PlatformConfig) {
        super(matterbridge, log, config);

        const accessKey = config.accessKey as string ?? process.env.ECOFLOW_ACCESS_KEY;
        const secretKey = config.secretKey as string ?? process.env.ECOFLOW_SECRET_KEY;

        if (!accessKey || !secretKey) {
            this.log.error('Missing EcoFlow Developer Access and Secret Keys!');
            this.log.error(' - Platform Config Props: accessKey & secretKey');
            this.log.error(' - Environment Variables: ECOFLOW_ACCESS_KEY & ECOFLOW_SECRET_KEY');
        }
        else {
            config.accessKey = accessKey;
            config.secretKey = secretKey;

            this.ecoflowRestClient = new RestClient({
                accessKey: accessKey,
                secretKey: secretKey,
                host: 'https://api-a.ecoflow.com'
            });
        }
    }

    override async onStart(reason?: string) {
        this.log.info('[onStart]', reason);

        await this.ready;
        await this.clearSelect();

        if (!this.ecoflowRestClient) {
            return;
        }

        const devices = await this.ecoflowRestClient.getDevicesPlain();

        for (const device of devices.data) {
            if (device.productName !== 'DELTA Pro Ultra') {
                continue;
            }

            const devicePropsResponse = await this.ecoflowRestClient.getDevicePropertiesPlain(device.sn);
            const deviceProps = restAllQuotaData.parse(devicePropsResponse.data);
            this.log.debug('Properties:', deviceProps);

            const batteryLevel = deviceProps['hs_yj751_pd_appshow_addr.soc'];
            const acInFreq = deviceProps['hs_yj751_pd_backend_addr.acInFreq'] ?? 0;
            const acInAmp = (deviceProps['hs_yj751_pd_backend_addr.inAc5p8Amp'] ?? 0) + (deviceProps['hs_yj751_pd_backend_addr.inAcC20Amp'] ?? 0);
            const acInPwr = (deviceProps['hs_yj751_pd_appshow_addr.inAc5p8Pwr'] ?? 0) + (deviceProps['hs_yj751_pd_appshow_addr.inAcC20Pwr'] ?? 0);
            const acInVol5p8 = deviceProps['hs_yj751_pd_backend_addr.inAc5p8Vol'] ?? 0;
            const acInVolC20 = deviceProps['hs_yj751_pd_backend_addr.inAcC20Vol'] ?? 0;
            const acInVol = acInVol5p8 > 0 && acInVolC20 > 0 ? (acInVol5p8 + acInVolC20) / 2 : (acInVol5p8 > 0 ? acInVol5p8 : acInVolC20);

            const endpoint = new MatterbridgeEndpoint([batteryStorage, deviceEnergyManagement, bridgedNode], { id: 'EcoFlow-' + device.sn }, this.config.debug as boolean)
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
                .createDefaultDeviceEnergyManagementClusterServer(DeviceEnergyManagement.EsaType.BatteryStorage, true, DeviceEnergyManagement.EsaState.Online, -7200_000, 7200_000)
                .createDefaultDeviceEnergyManagementModeClusterServer()
                .addRequiredClusterServers();

            endpoint.name = `EcoFlow ${device.productName}`;

            endpoint.addChildDeviceType('Battery', powerSource, { tagList: [PowerSourceTag.Battery] })
                .createDefaultPowerSourceRechargeableBatteryClusterServer(batteryLevel, PowerSource.BatChargeLevel.Ok, 102.4 * 1000)
                .addRequiredClusterServers();

            endpoint.addChildDeviceType('Grid', powerSource, { tagList: [PowerSourceTag.Grid] })
                .createDefaultPowerSourceWiredClusterServer(PowerSource.WiredCurrentType.Ac)
                .addRequiredClusterServers();

            // TODO: Move to SolarPower Endpoint
            // endpoint.addChildDeviceType('Solar', powerSource, { tagList: [PowerSourceTag.Solar] })
            //     .createDefaultPowerSourceWiredClusterServer(PowerSource.WiredCurrentType.Dc)
            //     .addRequiredClusterServers();

            endpoint.addChildDeviceType('ACInput', electricalSensor)
                .createDefaultElectricalEnergyMeasurementClusterServer()
                .createDefaultElectricalPowerMeasurementClusterServer(
                    Math.round(acInVol * 1000),
                    Math.round(acInAmp * 1000),
                    Math.round(acInPwr * 1000),
                    Math.round(acInFreq * 1000))
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

        if (!this.ecoflowRestClient) {
            return;
        }

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

        mqttClient.on('message', async (topic, message) => {
            const serialNumber = topic.split('/')[3];
            const endpoint = this.bridgedDevices.get(serialNumber);
            if (!endpoint) {
                return;
            }

            const batteryPowerSourceEndpoint = endpoint.getChildEndpointByName('Battery');
            const gridPowerSourceEndpoint = endpoint.getChildEndpointByName('Grid');
            // const solarPowerSourceEndpoint = endpoint.getChildEndpointByName('Solar');

            const acInputElectricalSensorEndpoint = endpoint.getChildEndpointByName('ACInput');

            const messageWrapper = mqttResponseBaseSchema.parse(JSON.parse(message.toString()));
            switch (messageWrapper.cmdId) {
                case 1: {
                    const params = mqttResponseCmdId1Params.parse(messageWrapper.param);
                    this.log.debug('MQTT Message', topic, messageWrapper.cmdId, messageWrapper.cmdFunc, params);

                    // Battery Power Source: Battery Percent Remaining & Charge Level
                    if (batteryPowerSourceEndpoint && params.soc !== undefined) {
                        const batChargeLevel = params.soc > 10 ? PowerSource.BatChargeLevel.Ok : PowerSource.BatChargeLevel.Warning;
                        await batteryPowerSourceEndpoint.setAttribute(PowerSource.Cluster.id, 'batPercentRemaining', params.soc * 2, endpoint.log);
                        await batteryPowerSourceEndpoint.setAttribute(PowerSource.Cluster.id, 'batChargeLevel', batChargeLevel, endpoint.log);
                    }

                    // Battery Power Source: Battery Time Remaining
                    if (batteryPowerSourceEndpoint && params.remainTime !== undefined && params.wattsInSum !== undefined) {
                        if (params.wattsInSum === 0) {
                            await batteryPowerSourceEndpoint.setAttribute(PowerSource.Cluster.id, 'batTimeRemaining', params.remainTime * 60, endpoint.log);
                        }
                        else {
                            await batteryPowerSourceEndpoint.setAttribute(PowerSource.Cluster.id, 'batTimeRemaining', null, endpoint.log);
                        }
                    }

                    // Grid Power Source: Status
                    if (gridPowerSourceEndpoint && params.inAc5p8Pwr !== undefined && params.inAcC20Pwr !== undefined) {
                        const powerSourceStatus = params.inAc5p8Pwr > 0 || params.inAcC20Pwr > 0 ? PowerSource.PowerSourceStatus.Active : PowerSource.PowerSourceStatus.Standby;
                        await gridPowerSourceEndpoint.setAttribute(PowerSource.Cluster.id, 'status', powerSourceStatus, endpoint.log);
                    }

                    // Solar Power Source: Status
                    // if (solarPowerSourceEndpoint && params.inHvMpptPwr !== undefined && params.inLvMpptPwr !== undefined) {
                    //     const powerSourceStatus = params.inHvMpptPwr > 0 || params.inLvMpptPwr > 0 ? PowerSource.PowerSourceStatus.Active : PowerSource.PowerSourceStatus.Standby;
                    //     await solarPowerSourceEndpoint.setAttribute(PowerSource.Cluster.id, 'status', powerSourceStatus, endpoint.log);
                    // }

                    // AC Input Electrical Sensor: Power/Watts
                    if (acInputElectricalSensorEndpoint && params.inAc5p8Pwr !== undefined && params.inAcC20Pwr !== undefined) {
                        const acInPwr_mW = Math.round((params.inAc5p8Pwr + params.inAcC20Pwr) * 1000);
                        await acInputElectricalSensorEndpoint.setAttribute(ElectricalPowerMeasurement.Cluster.id, 'activePower', acInPwr_mW, endpoint.log);
                    }

                    break;
                }
                case 2: {
                    const params = mqttResponseCmdId2Params.parse(messageWrapper.param);
                    this.log.debug('MQTT Message', topic, messageWrapper.cmdId, messageWrapper.cmdFunc, params);

                    // Battery Power Source: Battery Charging State
                    if (batteryPowerSourceEndpoint && params.bmsInputWatts !== undefined) {
                        const batChargeState = params.bmsInputWatts > 0 ? PowerSource.BatChargeState.IsCharging : PowerSource.BatChargeState.IsNotCharging;
                        await batteryPowerSourceEndpoint.setAttribute(PowerSource.Cluster.id, 'batChargeState', batChargeState, endpoint.log);
                    }

                    // Battery Power Source: Status
                    if (batteryPowerSourceEndpoint && params.bmsOutputWatts !== undefined) {
                        const powerSourceStatus = params.bmsOutputWatts > 0 ? PowerSource.PowerSourceStatus.Active : PowerSource.PowerSourceStatus.Standby;
                        await batteryPowerSourceEndpoint.setAttribute(PowerSource.Cluster.id, 'status', powerSourceStatus, endpoint.log);
                    }

                    // AC Input Electrical Sensor: Current/Amps
                    if (acInputElectricalSensorEndpoint && params.inAc5p8Amp !== undefined && params.inAcC20Amp !== undefined) {
                        const acInAmp_mA = Math.round((params.inAc5p8Amp + params.inAcC20Amp) * 1000);
                        await acInputElectricalSensorEndpoint.setAttribute(ElectricalPowerMeasurement.Cluster.id, 'activeCurrent', acInAmp_mA, endpoint.log);
                    }

                    // AC Input Electrical Sensor: Voltage/Volts
                    if (acInputElectricalSensorEndpoint && params.inAc5p8Vol !== undefined && params.inAcC20Vol !== undefined) {
                        const acInVol = params.inAc5p8Vol > 0 && params.inAcC20Vol > 0
                            ? (params.inAc5p8Vol + params.inAcC20Vol) / 2
                            : (params.inAc5p8Vol > 0 ? params.inAc5p8Vol : params.inAcC20Vol);
                        const acInVol_mV = Math.round(acInVol * 1000);
                        await acInputElectricalSensorEndpoint.setAttribute(ElectricalPowerMeasurement.Cluster.id, 'voltage', acInVol_mV, endpoint.log);
                    }

                    break;
                }
                case 3: {
                    const params = mqttResponseCmdId3Params.parse(messageWrapper.param);
                    this.log.debug('MQTT Message', topic, messageWrapper.cmdId, messageWrapper.cmdFunc, params);
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
