import { toDriverJsConfig } from './driverAdapter.ts';
import type { DriverBackendConfig, DriverBackendInstance } from './types.ts';

export async function createBrowserDriverBackend(
  config: DriverBackendConfig
): Promise<DriverBackendInstance> {
  const [{ driver }] = await Promise.all([
    import('driver.js'),
    import('driver.js/dist/driver.css'),
  ]);
  return driver(toDriverJsConfig(config));
}
