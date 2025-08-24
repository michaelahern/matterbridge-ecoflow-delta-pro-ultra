import { RestClient } from '@ecoflow-api/rest-client';
import { Matterbridge, MatterbridgeEndpoint, MatterbridgeDynamicPlatform, type PlatformConfig, batteryStorage, deviceEnergyManagement, electricalSensor, onOffOutlet, powerSource } from 'matterbridge';
import { DeviceEnergyManagement, ElectricalPowerMeasurement, OnOff, PowerSource } from 'matterbridge/matter/clusters';
import { AnsiLogger } from 'matterbridge/logger';
import { PowerSourceTag } from 'matterbridge/matter';
import mqtt from 'mqtt';

import { mqttResponseBaseSchema, mqttResponseCmdId1Params, mqttResponseCmdId2Params, mqttResponseCmdId3Params, restAllQuotaData } from './schemas.js';

export class EcoflowDeltaProUltraPlatform extends MatterbridgeDynamicPlatform {
    ecoflowRestClient?: RestClient;
    batteryStorageDevices = new Map<string, MatterbridgeEndpoint>();

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
            const acOutFreq = deviceProps['hs_yj751_pd_backend_addr.acOutFreq'] ?? 0;

            const endpoint = new MatterbridgeEndpoint([batteryStorage, deviceEnergyManagement], { id: 'EcoFlow-' + device.sn }, this.config.debug as boolean)
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

            endpoint.name = 'EcoFlow DELTA Pro Ultra';

            // Battery & Grid Power Sources
            endpoint.addChildDeviceType('Battery', powerSource, { tagList: [PowerSourceTag.Battery] })
                .createDefaultPowerSourceRechargeableBatteryClusterServer(batteryLevel, PowerSource.BatChargeLevel.Ok, 102_400)
                .addRequiredClusterServers();

            endpoint.addChildDeviceType('Grid', powerSource, { tagList: [PowerSourceTag.Grid] })
                .createDefaultPowerSourceWiredClusterServer(PowerSource.WiredCurrentType.Ac)
                .addRequiredClusterServers();

            // AC Input, AC Output, & DC Output Power Measurement
            endpoint.addChildDeviceType('ACInput', electricalSensor)
                .createDefaultElectricalEnergyMeasurementClusterServer()
                .createDefaultElectricalPowerMeasurementClusterServer(null, null, null, acInFreq * 1000)
                .createDefaultPowerTopologyClusterServer()
                .addRequiredClusterServers();

            endpoint.addChildDeviceType('ACOutput', electricalSensor)
                .createDefaultElectricalEnergyMeasurementClusterServer()
                .createDefaultElectricalPowerMeasurementClusterServer(null, null, null, acOutFreq * 1000)
                .createDefaultPowerTopologyClusterServer()
                .addRequiredClusterServers();

            endpoint.addChildDeviceType('DCOutput', electricalSensor)
                .createDefaultElectricalEnergyMeasurementClusterServer()
                .createDefaultElectricalPowerMeasurementClusterServer(null, null, null, null)
                .createDefaultPowerTopologyClusterServer()
                .addRequiredClusterServers();

            // AC On/Off Switch
            const acSwitch = endpoint.addChildDeviceType('ACSwitch', [onOffOutlet, powerSource])
                .createDefaultOnOffClusterServer()
                .createDefaultPowerSourceWiredClusterServer(PowerSource.WiredCurrentType.Ac)
                .addRequiredClusterServers();

            acSwitch.addCommandHandler('on', async () => {
                try {
                    this.ecoflowRestClient?.setCommandPlain({
                        sn: device.sn,
                        cmdCode: 'YJ751_PD_AC_DSG_SET',
                        params: { enable: 1 }
                    });
                }
                catch (error) {
                    this.log.error('Error executing AC Switch command [On]:', error);
                }
            });

            acSwitch.addCommandHandler('off', async () => {
                try {
                    this.ecoflowRestClient?.setCommandPlain({
                        sn: device.sn,
                        cmdCode: 'YJ751_PD_AC_DSG_SET',
                        params: { enable: 0 }
                    });
                }
                catch (error) {
                    this.log.error('Error executing AC Switch command [Off]:', error);
                }
            });

            // DC On/Off Switch
            const dcSwitch = endpoint.addChildDeviceType('DCSwitch', [onOffOutlet, powerSource])
                .createDefaultOnOffClusterServer()
                .createDefaultPowerSourceWiredClusterServer(PowerSource.WiredCurrentType.Dc)
                .addRequiredClusterServers();

            dcSwitch.addCommandHandler('on', async () => {
                try {
                    this.ecoflowRestClient?.setCommandPlain({
                        sn: device.sn,
                        cmdCode: 'YJ751_PD_DC_SWITCH_SET',
                        params: { enable: 1 }
                    });
                }
                catch (error) {
                    this.log.error('Error executing DC Switch command [On]:', error);
                }
            });

            dcSwitch.addCommandHandler('off', async () => {
                try {
                    this.ecoflowRestClient?.setCommandPlain({
                        sn: device.sn,
                        cmdCode: 'YJ751_PD_DC_SWITCH_SET',
                        params: { enable: 0 }
                    });
                }
                catch (error) {
                    this.log.error('Error executing DC Switch command [Off]:', error);
                }
            });

            await this.registerDevice(endpoint);
            this.batteryStorageDevices.set(device.sn, endpoint);
            this.setSelectDevice(device.sn, device.deviceName ?? 'DELTA Pro Ultra', 'https://developer.ecoflow.com/', 'hub');
        }
    }

    override async onConfigure() {
        await super.onConfigure();

        if (!this.ecoflowRestClient) {
            return;
        }

        const mqttCreds = await this.ecoflowRestClient.getMqttCredentials();
        const mqttBroker = `${mqttCreds.protocol}://${mqttCreds.url}:${mqttCreds.port}`;

        this.log.info('Connecting to EcoFlow MQTT Broker:', mqttBroker);
        const mqttClient = await mqtt.connectAsync(mqttBroker, {
            username: `${mqttCreds.certificateAccount}`,
            password: `${mqttCreds.certificatePassword}`,
            protocolVersion: 5
        });

        for (const deviceSerialNumber of this.batteryStorageDevices.keys()) {
            await mqttClient.subscribeAsync(`/open/${mqttCreds.certificateAccount}/${deviceSerialNumber}/quota`);
            await mqttClient.subscribeAsync(`/open/${mqttCreds.certificateAccount}/${deviceSerialNumber}/status`);
        }

        mqttClient.on('message', async (topic, message) => {
            const serialNumber = topic.split('/')[3];
            if (!serialNumber) {
                return;
            }

            const endpoint = this.batteryStorageDevices.get(serialNumber);
            if (!endpoint) {
                return;
            }

            const batteryPowerSourceEndpoint = endpoint.getChildEndpointByName('Battery');
            const gridPowerSourceEndpoint = endpoint.getChildEndpointByName('Grid');

            const acInputElectricalSensorEndpoint = endpoint.getChildEndpointByName('ACInput');
            const acOutputElectricalSensorEndpoint = endpoint.getChildEndpointByName('ACOutput');
            const dcOutputElectricalSensorEndpoint = endpoint.getChildEndpointByName('DCOutput');

            const acSwitchOnOffSwitchEndpoint = endpoint.getChildEndpointByName('ACSwitch');
            const dcSwitchOnOffSwitchEndpoint = endpoint.getChildEndpointByName('DCSwitch');

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

                    // Electrical Sensor: Power/Watts
                    // Partial Messages
                    //  - { remainTime: 10363 }
                    //  - { wattsOutSum: 9 }

                    // AC Input Electrical Sensor: Power/Watts
                    // Partial Messages
                    //  - { inAcC20Pwr: 1214.2208, wattsInSum: 1214, wattsOutSum: 10 }
                    //  - { inAcC20Pwr: 1206.6578, remainTime: 9, wattsInSum: 1207 }
                    if (acInputElectricalSensorEndpoint && (params.inAc5p8Pwr !== undefined || params.inAcC20Pwr !== undefined)) {
                        const acInPwr_mW = Math.round(((params.inAc5p8Pwr ?? 0) + (params.inAcC20Pwr ?? 0)) * 1000);
                        await acInputElectricalSensorEndpoint.setAttribute(ElectricalPowerMeasurement.Cluster.id, 'activePower', acInPwr_mW, endpoint.log);
                    }

                    // AC Output Electrical Sensor: Power/Watts
                    if (acOutputElectricalSensorEndpoint && (params.outAc5p8Pwr !== undefined || params.outAcL11Pwr !== undefined || params.outAcL12Pwr !== undefined
                        || params.outAcL14Pwr !== undefined || params.outAcL21Pwr !== undefined || params.outAcL22Pwr !== undefined || params.outAcTtPwr !== undefined)) {
                        const acOutPwr_mW = Math.round(((params.outAc5p8Pwr ?? 0) + (params.outAcL11Pwr ?? 0) + (params.outAcL12Pwr ?? 0)
                            + (params.outAcL14Pwr ?? 0) + (params.outAcL21Pwr ?? 0) + (params.outAcL22Pwr ?? 0) + (params.outAcTtPwr ?? 0)) * 1000);
                        await acOutputElectricalSensorEndpoint.setAttribute(ElectricalPowerMeasurement.Cluster.id, 'activePower', acOutPwr_mW, endpoint.log);
                    }

                    // DC Output Electrical Sensor: Power/Watts
                    // Partial Messages
                    //  - { outUsb1Pwr: 8.956857, remainTime: 10366, wattsOutSum: 9 }
                    if (dcOutputElectricalSensorEndpoint && (params.outAdsPwr !== undefined || params.outTypec1Pwr !== undefined
                        || params.outTypec2Pwr !== undefined || params.outUsb1Pwr !== undefined || params.outUsb2Pwr !== undefined)) {
                        const dcOutPwr_mW = Math.round(((params.outAdsPwr ?? 0) + (params.outTypec1Pwr ?? 0) + (params.outTypec2Pwr ?? 0)
                            + (params.outUsb1Pwr ?? 0) + (params.outUsb2Pwr ?? 0)) * 1000);
                        await dcOutputElectricalSensorEndpoint.setAttribute(ElectricalPowerMeasurement.Cluster.id, 'activePower', dcOutPwr_mW, endpoint.log);
                    }

                    // AC On/Off Switch
                    if (acSwitchOnOffSwitchEndpoint && params.showFlag !== undefined) {
                        const isOn = (params.showFlag & 0x04) !== 0;
                        await acSwitchOnOffSwitchEndpoint.setAttribute(OnOff.Cluster.id, 'onOff', isOn, endpoint.log);
                    }

                    // DC On/Off Switch
                    if (dcSwitchOnOffSwitchEndpoint && params.showFlag !== undefined) {
                        const isOn = (params.showFlag & 0x02) !== 0;
                        await dcSwitchOnOffSwitchEndpoint.setAttribute(OnOff.Cluster.id, 'onOff', isOn, endpoint.log);
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
                        const acInVol = params.inAc5p8Vol > 0 && params.inAcC20Vol > 0 ? null : (params.inAc5p8Vol > 0 ? params.inAc5p8Vol : params.inAcC20Vol);
                        const acInVol_mV = acInVol ? Math.round(acInVol * 1000) : null;
                        await acInputElectricalSensorEndpoint.setAttribute(ElectricalPowerMeasurement.Cluster.id, 'voltage', acInVol_mV, endpoint.log);
                    }

                    // AC Output Electrical Sensor: Current/Amps
                    // if (acOutputElectricalSensorEndpoint && params.outAc5p8Amp !== undefined && params.outAcL11Amp !== undefined && params.outAcL12Amp !== undefined
                    //     && params.outAcL14Amp !== undefined && params.outAcL21Amp !== undefined && params.outAcL22Amp !== undefined && params.outAcTtAmp !== undefined) {
                    //     const acOutAmp_mA = Math.round((params.outAc5p8Amp + params.outAcL11Amp + params.outAcL12Amp
                    //         + params.outAcL14Amp + params.outAcL21Amp + params.outAcL22Amp + params.outAcTtAmp) * 1000);
                    //     await acOutputElectricalSensorEndpoint.setAttribute(ElectricalPowerMeasurement.Cluster.id, 'activeCurrent', acOutAmp_mA, endpoint.log);
                    // }

                    // DC Output Electrical Sensor: Current/Amps
                    // if (dcOutputElectricalSensorEndpoint && params.outAdsAmp !== undefined && params.outTypec1Amp !== undefined && params.outTypec2Amp !== undefined
                    //     && params.outUsb1Amp !== undefined && params.outUsb2Amp !== undefined) {
                    //     const dcOutAmp_mA = Math.round((params.outAdsAmp + params.outTypec1Amp + params.outTypec2Amp + params.outUsb1Amp + params.outUsb2Amp) * 1000);
                    //     await dcOutputElectricalSensorEndpoint.setAttribute(ElectricalPowerMeasurement.Cluster.id, 'activeCurrent', dcOutAmp_mA, endpoint.log);
                    // }

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
