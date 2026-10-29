import { IExperimentationService, IExperimentationTelemetry, IExperimentationFilterProvider } from 'tas-client';
import * as docode from 'docode';
import { TargetPopulation } from './DoCodeFilterProvider';
/**
 *
 * @param extensionName The name of the extension.
 * @param extensionVersion The version of the extension.
 * @param telemetry Telemetry implementation.
 * @param targetPopulation An enum containing the target population ('team', 'internal', 'insiders', 'public').
 * @param memento The memento state to be used for cache.
 * @param filterProviders The filter providers.
 */
export declare function getExperimentationService(extensionName: string, extensionVersion: string, targetPopulation: TargetPopulation, telemetry: IExperimentationTelemetry, memento: docode.Memento, ...filterProviders: IExperimentationFilterProvider[]): IExperimentationService;
/**
 * Returns the experimentation service after waiting on initialize.
 *
 * @param extensionName The name of the extension.
 * @param extensionVersion The version of the extension.
 * @param telemetry Telemetry implementation.
 * @param targetPopulation An enum containing the target population ('team', 'internal', 'insiders', 'public').
 * @param memento The memento state to be used for cache.
 * @param filterProviders The filter providers.
 */
export declare function getExperimentationServiceAsync(extensionName: string, extensionVersion: string, targetPopulation: TargetPopulation, telemetry: IExperimentationTelemetry, memento: docode.Memento, ...filterProviders: IExperimentationFilterProvider[]): Promise<IExperimentationService>;
