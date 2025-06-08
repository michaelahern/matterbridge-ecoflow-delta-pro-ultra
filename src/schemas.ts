import { z } from 'zod';

export const mqttResponseBaseSchema = z.object({
    cmdId: z.number().int(),
    cmdFunc: z.number().int(),
    param: z.record(z.string(), z.any()).optional(),
    addr: z.string()
}).passthrough();

// cmdId: 1,
// cmdFunc: 2,
// param: { ... },
// addr: 'hs_yj751_pd_appshow_addr'
export const mqttResponseCmdId1Params = z.object({
    access5p8InType: z.number().int().optional(),
    access5p8OutType: z.number().int().optional(),
    bpNum: z.number().int().optional(),
    c20ChgMaxWatts: z.number().int().optional(),
    chgTimeTaskMode: z.number().int().optional(),
    chgTimeTaskParam: z.number().int().optional(),
    chgTimeTaskTable0: z.number().int().optional(),
    chgTimeTaskTable1: z.number().int().optional(),
    chgTimeTaskTable2: z.number().int().optional(),
    chgTimeTaskType: z.number().int().optional(),
    dsgTimeTaskMode: z.number().int().optional(),
    dsgTimeTaskNotice: z.number().int().optional(),
    dsgTimeTaskTable0: z.number().int().optional(),
    dsgTimeTaskTable1: z.number().int().optional(),
    dsgTimeTaskTable2: z.number().int().optional(),
    dsgTimeTaskType: z.number().int().optional(),
    fullCombo: z.number().int().optional(),
    inAc5p8Pwr: z.number().optional(),
    inAcC20Pwr: z.number().optional(),
    inHvMpptPwr: z.number().optional(),
    inLvMpptPwr: z.number().optional(),
    outAc5p8Pwr: z.number().optional(),
    outAcL11Pwr: z.number().optional(),
    outAcL12Pwr: z.number().optional(),
    outAcL14Pwr: z.number().optional(),
    outAcL21Pwr: z.number().optional(),
    outAcL22Pwr: z.number().optional(),
    outAcTtPwr: z.number().optional(),
    outAdsPwr: z.number().optional(),
    outPrPwr: z.number().optional(),
    outTypec1Pwr: z.number().optional(),
    outTypec2Pwr: z.number().optional(),
    outUsb1Pwr: z.number().optional(),
    outUsb2Pwr: z.number().optional(),
    paraChgMaxWatts: z.number().int().optional(),
    remainCombo: z.number().int().optional(),
    remainTime: z.number().int().optional(),
    soc: z.number().int().optional(),
    sysErrCode: z.number().int().optional(),
    wattsInSum: z.number().optional(),
    wattsOutSum: z.number().optional(),
    wirlesss4gErrCode: z.number().int().optional(),
    wireless4GSta: z.number().int().optional(),
    wireless4gCon: z.number().int().optional(),
    wireless4gOn: z.number().int().optional()
}).passthrough();

// cmdId: 2
// cmdFunc: 2
// param: { ... }
// addr: 'hs_yj751_pd_backend_addr'
export const mqttResponseCmdId2Params = z.object({
    acOutFreq: z.number().int().optional()
    // inAc5p8Amp: z.number().optional(),
    // inAc5p8Vol: z.number().optional(),
    // inAcC20Amp: z.number().optional(),
    // inAcC20Vol: z.number().optional(),
    // inHvMpptAmp: z.number().optional(),
    // inHvMpptVol: z.number().optional(),
    // inLvMpptAmp: z.number().optional(),
    // inLvMpptVol: z.number().optional(),
    // outAc5p8Amp: z.number().optional(),
    // outAc5p8Vol: z.number().optional(),
    // outAcL11Pf: z.number().optional(),
    // outAcL12Amp: z.number().optional(),
    // outAcL12Pf: z.number().optional(),
    // outAcL14Amp: z.number().optional(),
    // outAcL14Pf: z.number().optional(),
    // outAcL14Vol: z.number().optional(),
    // outAcL21Amp: z.number().optional(),
    // outAcL21Pf: z.number().optional(),
    // outAcL21Vol: z.number().optional(),
    // outAcL22Amp: z.number().optional(),
    // outAcL22Pf: z.number().optional(),
    // outAcL22Vol: z.number().optional(),
    // outAcP58Pf: z.number().optional(),
    // outAcTtAmp: z.number().optional(),
    // outAcTtPf: z.number().optional(),
    // outAcTtVol: z.number().optional()
}).passthrough();

// cmdId: 3
// cmdFunc: 2
// param: { ... }
// addr: 'hs_yj751_pd_app_set_info_addr'
export const mqttResponseCmdId3Params = z.object({
    acOftenOpenFlg: z.number().int().optional(),
    acOftenOpenMinSoc: z.number().int().optional(),
    acOutFreq: z.number().int().optional(),
    acStandbyMins: z.number().int().optional(),
    backupRatio: z.number().int().optional(),
    bmsModeSet: z.number().int().optional(),
    chg5p8SetWatts: z.number().int().optional(),
    chgC20SetWatts: z.number().int().optional(),
    chgMaxSoc: z.number().int().optional(),
    dcStandbyMins: z.number().int().optional(),
    dsgMinSoc: z.number().int().optional(),
    energyMamageEnable: z.number().int().optional(),
    powerStandbyMins: z.number().int().optional(),
    screenStandbySec: z.number().int().optional(),
    sysBackupSoc: z.number().int().optional(),
    sysTimezone: z.number().int().optional(),
    sysTimezoneId: z.string().optional(),
    sysWordMode: z.number().int().optional(),
    timezoneSettype: z.number().int().optional()
}).passthrough();

export type MqttResponseBase = z.infer<typeof mqttResponseBaseSchema>;
export type MqttResponseCmdId1Params = z.infer<typeof mqttResponseCmdId1Params>;
export type MqttResponseCmdId2Params = z.infer<typeof mqttResponseCmdId2Params>;
export type MqttResponseCmdId3Params = z.infer<typeof mqttResponseCmdId3Params>;
