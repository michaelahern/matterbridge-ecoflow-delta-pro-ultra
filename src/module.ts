import { type PlatformConfig, type PlatformMatterbridge } from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import { EcoflowDeltaProUltraPlatform } from './platform.js';

export default function initializePlugin(matterbridge: PlatformMatterbridge, log: AnsiLogger, config: PlatformConfig): EcoflowDeltaProUltraPlatform {
    return new EcoflowDeltaProUltraPlatform(matterbridge, log, config);
}
